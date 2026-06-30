import os
import cv2
import base64
import tempfile
import numpy as np

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from ultralytics import YOLO

# =====================================================
# FLASK
# =====================================================

app = Flask(__name__)
CORS(app)

# =====================================================
# LOAD MODEL
# =====================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MODEL_PATH = os.path.join(BASE_DIR, "best.pt")

if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"Model tidak ditemukan : {MODEL_PATH}")

model = YOLO(MODEL_PATH)

CLASS_NAMES = model.names

print("=" * 50)
print("MODEL BERHASIL DIMUAT")
print(MODEL_PATH)
print(CLASS_NAMES)
print("=" * 50)

# =====================================================
# CLASS
# =====================================================

CLASS_EMPTY = 0
CLASS_OCCUPIED = 1

# =====================================================
# IMAGE -> BASE64
# =====================================================

def image_to_base64(image):

    success, buffer = cv2.imencode(".jpg", image)

    if not success:
        return ""

    return base64.b64encode(buffer).decode("utf-8")


# =====================================================
# BASE64 -> IMAGE
# =====================================================

def decode_base64_image(data):

    if "," in data:
        data = data.split(",")[1]

    image_bytes = base64.b64decode(data)

    np_array = np.frombuffer(image_bytes, np.uint8)

    image = cv2.imdecode(np_array, cv2.IMREAD_COLOR)

    return image


# =====================================================
# DETECTION
# =====================================================

def predict_image(image):

    prediction = model.predict(

        source=image,

        imgsz=640,

        conf=0.35,

        verbose=False

    )[0]

    canvas = image.copy()

    results = []

    empty_count = 0

    occupied_count = 0

    slot_id = 1

    for box in prediction.boxes:

        cls = int(box.cls.item())

        conf = float(box.conf.item())

        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()

        x1 = int(x1)
        y1 = int(y1)
        x2 = int(x2)
        y2 = int(y2)

        if cls == CLASS_EMPTY:

            color = (0,255,0)

            status = "Empty"

            empty_count += 1

        else:

            color = (0,0,255)

            status = "Occupied"

            occupied_count += 1

        # Bounding Box

        cv2.rectangle(

            canvas,

            (x1,y1),

            (x2,y2),

            color,

            3

        )

        # Label

        text = f"{slot_id}. {status} {conf:.2f}"

        cv2.putText(

            canvas,

            text,

            (x1,max(y1-10,20)),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.65,

            color,

            2

        )

        results.append({

            "slot_id": slot_id,

            "status": status,

            "confidence": round(conf*100,2),

            "bbox":[x1,y1,x2,y2]

        })

        slot_id += 1

    total = empty_count + occupied_count

    # =====================================================
    # INFO PANEL
    # =====================================================

    overlay = canvas.copy()

    cv2.rectangle(

        overlay,

        (10,10),

        (280,110),

        (30,30,30),

        -1

    )

    cv2.addWeighted(

        overlay,

        0.60,

        canvas,

        0.40,

        0,

        canvas

    )

    cv2.putText(

        canvas,

        f"Total : {total}",

        (20,35),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.7,

        (255,255,255),

        2

    )

    cv2.putText(

        canvas,

        f"Available : {empty_count}",

        (20,65),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.7,

        (0,255,0),

        2

    )

    cv2.putText(

        canvas,

        f"Occupied : {occupied_count}",

        (20,95),

        cv2.FONT_HERSHEY_SIMPLEX,

        0.7,

        (0,0,255),

        2

    )

    return {

        "image": canvas,

        "results": results,

        "total": total,

        "available": empty_count,

        "occupied": occupied_count

    }


# =====================================================
# HOME
# =====================================================

@app.route("/")
def home():
    return render_template("index.html")


# =====================================================
# DETECT IMAGE
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
            "message": "Gambar tidak valid"
        }), 400

    output = predict_image(image)

    return jsonify({

        "success": True,

        "image_b64": image_to_base64(output["image"]),

        "results": output["results"],

        "total": output["total"],

        "n_tersedia": output["available"],

        "n_penuh": output["occupied"]

    })


# =====================================================
# DETECT VIDEO
# =====================================================

@app.route("/detect/video", methods=["POST"])
def detect_video():

    if "video" not in request.files:
        return jsonify({
            "success": False,
            "message": "Video tidak ditemukan"
        }), 400

    file = request.files["video"]

    if file.filename == "":
        return jsonify({
            "success": False,
            "message": "Nama file kosong"
        }), 400

    ext = os.path.splitext(file.filename)[1]

    if ext == "":
        ext = ".mp4"

    temp_file = tempfile.NamedTemporaryFile(
        delete=False,
        suffix=ext
    )

    temp_path = temp_file.name

    file.save(temp_path)

    temp_file.close()

    cap = cv2.VideoCapture(temp_path)

    if not cap.isOpened():

        os.remove(temp_path)

        return jsonify({
            "success": False,
            "message": "Video gagal dibuka"
        }), 400

    last_output = None

    frame_count = 0

    SAMPLE = 5

    MAX_FRAME = 80

    while True:

        ret, frame = cap.read()

        if not ret:
            break

        if frame_count % SAMPLE == 0:

            last_output = predict_image(frame)

            if frame_count >= MAX_FRAME:
                break

        frame_count += 1

    cap.release()

    if os.path.exists(temp_path):
        os.remove(temp_path)

    if last_output is None:

        return jsonify({
            "success": False,
            "message": "Tidak ada frame yang diproses"
        }), 400

    return jsonify({

        "success": True,

        "image_b64": image_to_base64(last_output["image"]),

        "results": last_output["results"],

        "total": last_output["total"],

        "n_tersedia": last_output["available"],

        "n_penuh": last_output["occupied"]

    })


# =====================================================
# LIVE CAMERA DETECTION
# =====================================================

@app.route("/detect/frame", methods=["POST"])
def detect_frame():

    data = request.get_json()

    if data is None:
        return jsonify({
            "success": False,
            "message": "Tidak ada data"
        }), 400

    if "frame" not in data:
        return jsonify({
            "success": False,
            "message": "Frame tidak ditemukan"
        }), 400

    image = decode_base64_image(data["frame"])

    if image is None:
        return jsonify({
            "success": False,
            "message": "Frame tidak valid"
        }), 400

    output = predict_image(image)

    return jsonify({

        "success": True,

        "image_b64": image_to_base64(output["image"]),

        "results": output["results"],

        "total": output["total"],

        "n_tersedia": output["available"],

        "n_penuh": output["occupied"]

    })


# =====================================================
# HEALTH CHECK
# =====================================================

@app.route("/health")
def health():

    return jsonify({

        "status": "running",

        "model": "best.pt",

        "classes": model.names,

        "framework": "YOLO + Flask"

    })


# =====================================================
# MODEL INFORMATION
# =====================================================

@app.route("/model")
def model_info():

    return jsonify({

        "model": "YOLO",

        "weights": "best.pt",

        "classes": model.names,

        "total_class": len(model.names)

    })


# =====================================================
# ROOT API
# =====================================================

@app.route("/api")
def api():

    return jsonify({

        "application": "Smart Parking Detection",

        "author": "Rizki Fajari",

        "model": "best.pt",

        "status": "running"

    })


# =====================================================
# ERROR HANDLER
# =====================================================

@app.errorhandler(404)
def not_found(e):

    return jsonify({

        "success": False,

        "message": "Endpoint tidak ditemukan"

    }),404


@app.errorhandler(500)
def internal_error(e):

    return jsonify({

        "success": False,

        "message": "Internal Server Error",

        "error": str(e)

    }),500


# =====================================================
# MAIN
# =====================================================

if __name__ == "__main__":

    PORT = int(os.environ.get("PORT", 5000))

    app.run(

        host="0.0.0.0",

        port=PORT,

        debug=True

    )
