from flask import Flask, render_template, request, jsonify
from ultralytics import YOLO

import cv2
import numpy as np
import base64
import tempfile
import os

app = Flask(__name__)

# ===========================
# Load YOLO Model
# ===========================

MODEL_PATH = "best.pt"

model = YOLO(MODEL_PATH)

CLASS_NAMES = model.names

print("Model Loaded Successfully")

# ===========================
# Helper
# ===========================

def image_to_base64(img):

    _, buffer = cv2.imencode(".jpg", img)

    return base64.b64encode(buffer).decode("utf-8")


def detect_frame(frame):

    results = model.predict(

        frame,

        imgsz=640,

        conf=0.35,

        verbose=False

    )

    total = 0
    empty = 0
    occupied = 0

    data = []

    for r in results:

        boxes = r.boxes

        total = len(boxes)

        for i, box in enumerate(boxes):

            cls = int(box.cls)

            conf = float(box.conf)

            label = CLASS_NAMES[cls]

            if label.lower() == "empty":

                color = (0,255,0)

                empty += 1

                status = "Empty"

            else:

                color = (0,0,255)

                occupied += 1

                status = "Occupied"

            x1,y1,x2,y2 = map(int,box.xyxy[0])

            cv2.rectangle(

                frame,

                (x1,y1),

                (x2,y2),

                color,

                2

            )

            text = f"{status} {conf:.2f}"

            cv2.putText(

                frame,

                text,

                (x1,y1-10),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.6,

                color,

                2

            )

            data.append({

                "slot_id":i+1,

                "status":status,

                "confidence":round(conf*100,2)

            })

    return frame,data,total,empty,occupied


# ===========================
# Home
# ===========================

@app.route("/")
def home():
    return render_template("index.html")


# ===========================
# IMAGE DETECTION
# ===========================

@app.route("/detect/image", methods=["POST"])
def detect_image():

    if "image" not in request.files:
        return jsonify({"error": "No Image"}), 400

    file = request.files["image"]

    image_bytes = np.frombuffer(file.read(), np.uint8)

    frame = cv2.imdecode(image_bytes, cv2.IMREAD_COLOR)

    if frame is None:
        return jsonify({"error": "Invalid Image"}), 400

    frame, results, total, empty, occupied = detect_frame(frame)

    return jsonify({

        "success": True,

        "image_b64": image_to_base64(frame),

        "results": results,

        "total": total,

        "n_tersedia": empty,

        "n_penuh": occupied

    })


# ===========================
# LIVE CAMERA
# ===========================

@app.route("/detect/frame", methods=["POST"])
def detect_live():

    data = request.get_json()

    if data is None:
        return jsonify({"error": "No Frame"}), 400

    frame_data = data["frame"]

    frame_data = frame_data.split(",")[1]

    image = base64.b64decode(frame_data)

    npimg = np.frombuffer(image, np.uint8)

    frame = cv2.imdecode(npimg, cv2.IMREAD_COLOR)

    if frame is None:
        return jsonify({"error": "Invalid Frame"}), 400

    frame, results, total, empty, occupied = detect_frame(frame)

    return jsonify({

        "success": True,

        "image_b64": image_to_base64(frame),

        "results": results,

        "total": total,

        "n_tersedia": empty,

        "n_penuh": occupied

    })


# ===========================
# VIDEO DETECTION
# ===========================

@app.route("/detect/video", methods=["POST"])
def detect_video():

    if "video" not in request.files:
        return jsonify({"error": "No Video"}), 400

    file = request.files["video"]

    temp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")

    file.save(temp.name)

    cap = cv2.VideoCapture(temp.name)

   frame_count = 0

while True:

    ret, frame = cap.read()

    if not ret:
        break

    frame_count += 1

    if frame_count % 5 != 0:
        continue

    frame, results, total, empty, occupied = detect_frame(frame)

    last_frame = frame.copy()

    cap.release()

    os.remove(temp.name)

    if last_frame is None:
        return jsonify({"error": "Video Error"}), 400

    return jsonify({

        "success": True,

        "image_b64": image_to_base64(last_frame),

        "results": results,

        "total": total,

        "n_tersedia": empty,

        "n_penuh": occupied

    })


# ===========================
# HEALTH CHECK
# ===========================

@app.route("/health")
def health():

    return jsonify({

        "status":"running",

        "model":"best.pt"

    })


# ===========================
# MAIN
# ===========================

if __name__ == "__main__":

    app.run(

        host="0.0.0.0",

        port=5000,

        debug=True

    )


