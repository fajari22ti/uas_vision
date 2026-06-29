"""
==========================================================
SISTEM MONITORING KETERSEDIAAN SLOT PARKIR OTOMATIS
YOLOv8 / YOLO11 - Flask Backend
Author : Rizki Fajari
==========================================================
"""

import os
import cv2
import base64
import numpy as np

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

from ultralytics import YOLO

# =====================================================
# Flask
# =====================================================

app = Flask(__name__)
CORS(app)

# =====================================================
# Load Model
# =====================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(BASE_DIR, "best.pt")

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(
        f"Model tidak ditemukan : {MODEL_PATH}"
    )

model = YOLO(MODEL_PATH)

print("===================================")
print("YOLO MODEL LOADED")
print(MODEL_PATH)
print(model.names)
print("===================================")

# =====================================================
# Class Name
# =====================================================

CLASS_EMPTY = 0
CLASS_OCCUPIED = 1

# =====================================================
# Utility
# =====================================================

def image_to_base64(img):

    _, buffer = cv2.imencode(".jpg", img)

    return base64.b64encode(buffer).decode("utf-8")


def decode_base64_image(data):

    if "," in data:
        data = data.split(",")[1]

    img_bytes = base64.b64decode(data)

    img_array = np.frombuffer(img_bytes, np.uint8)

    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    return img


# =====================================================
# Prediction
# =====================================================

def predict_image(image):

    prediction = model.predict(

        source=image,

        imgsz=640,

        conf=0.25,

        verbose=False

    )[0]

    canvas = image.copy()

    empty_count = 0

    occupied_count = 0

    results = []

    for box in prediction.boxes:

        cls = int(box.cls.item())

        conf = float(box.conf.item())

        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()

        x1 = int(x1)
        y1 = int(y1)
        x2 = int(x2)
        y2 = int(y2)

        label = model.names[cls]

        if cls == CLASS_EMPTY:

            color = (0,255,0)

            status = "Empty"

            empty_count += 1

        else:

            color = (0,0,255)

            status = "Occupied"

            occupied_count += 1

        cv2.rectangle(

            canvas,

            (x1,y1),

            (x2,y2),

            color,

            2

        )

        text = f"{status} {conf:.2f}"

        cv2.putText(

            canvas,

            text,

            (x1,y1-10),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.6,

            color,

            2

        )

        results.append({

            "class":label,

            "status":status,

            "confidence":round(conf*100,2),

            "bbox":[x1,y1,x2,y2]

        })

    total = empty_count + occupied_count

    cv2.rectangle(

        canvas,

        (10,10),

        (330,80),

        (20,20,20),

        -1

    )

    cv2.putText(

        canvas,

        f"Available : {empty_count}",

        (20,35),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.7,

        (0,255,0),

        2

    )

    cv2.putText(

        canvas,

        f"Occupied : {occupied_count}",

        (20,65),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.7,

        (0,0,255),

        2

    )

    return {

        "image":canvas,

        "results":results,

        "available":empty_count,

        "occupied":occupied_count,

        "total":total

    }

# =====================================================
# Route Home
# =====================================================

@app.route("/")
def home():

    return render_template("index.html")


# =====================================================
# Detect Image
# =====================================================

@app.route("/detect/image", methods=["POST"])
def detect_image():

    if "image" not in request.files:
        return jsonify({
            "success": False,
            "message": "Image tidak ditemukan"
        }), 400

    file = request.files["image"]

    image_bytes = np.frombuffer(file.read(), np.uint8)

    image = cv2.imdecode(image_bytes, cv2.IMREAD_COLOR)

    if image is None:
        return jsonify({
            "success": False,
            "message": "Gagal membaca gambar"
        }), 400

    output = predict_image(image)

    return jsonify({

        "success": True,

        "image": image_to_base64(output["image"]),

        "available": output["available"],

        "occupied": output["occupied"],

        "total": output["total"],

        "results": output["results"]

    })


# =====================================================
# Detect Webcam Frame
# =====================================================

@app.route("/detect/frame", methods=["POST"])
def detect_frame():

    data = request.get_json()

    if data is None:

        return jsonify({

            "success":False,

            "message":"Tidak ada data"

        }),400


    if "frame" not in data:

        return jsonify({

            "success":False,

            "message":"Frame kosong"

        }),400


    image = decode_base64_image(data["frame"])

    if image is None:

        return jsonify({

            "success":False,

            "message":"Frame tidak valid"

        }),400


    output = predict_image(image)

    return jsonify({

        "success":True,

        "image":image_to_base64(output["image"]),

        "available":output["available"],

        "occupied":output["occupied"],

        "total":output["total"],

        "results":output["results"]

    })


# =====================================================
# Health Check
# =====================================================

@app.route("/health")
def health():

    return jsonify({

        "status":"running",

        "model":"best.pt",

        "classes":model.names

    })


# =====================================================
# API Model Info
# =====================================================

@app.route("/model")
def model_info():

    return jsonify({

        "model":"YOLO",

        "weights":"best.pt",

        "classes":model.names,

        "total_class":len(model.names)

    })


# =====================================================
# Run Flask
# =====================================================

if __name__=="__main__":

    app.run(

        host="0.0.0.0",

        port=5000,

        debug=True

    )
