"""
app.py
======
Flask REST API for the Plagiarism Detection System.

Endpoints:
  POST /api/analyze        — JSON body { text_a, text_b }
  POST /api/analyze-files  — multipart form-data { file_a, file_b }
  GET  /api/health         — health check
  GET  /                   — serves the frontend UI
"""

import os
import sys

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# Support both: `python app.py` and `gunicorn backend.app:app`
try:
    from backend.vectorizer import analyze   # gunicorn / package import
except ImportError:
    from vectorizer import analyze           # direct `python app.py`

# Serve frontend from the sibling 'frontend' directory
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
CORS(app)  # Allow cross-origin requests from the frontend


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "Plagiarism Detector API is running."})


@app.route("/api/analyze", methods=["POST"])
def analyze_text():
    """
    Accept JSON: { "text_a": "...", "text_b": "..." }
    Returns full similarity analysis.
    """
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON payload."}), 400

    text_a = data.get("text_a", "").strip()
    text_b = data.get("text_b", "").strip()

    if not text_a or not text_b:
        return jsonify({"error": "Both text_a and text_b are required."}), 400

    if len(text_a) > 500_000 or len(text_b) > 500_000:
        return jsonify({"error": "Text too large. Max 500,000 characters per document."}), 413

    result = analyze(text_a, text_b)
    return jsonify(result)


@app.route("/api/analyze-files", methods=["POST"])
def analyze_files():
    """
    Accept multipart/form-data with keys: file_a, file_b  (plain-text files).
    """
    if "file_a" not in request.files or "file_b" not in request.files:
        return jsonify({"error": "Both file_a and file_b must be provided."}), 400

    file_a = request.files["file_a"]
    file_b = request.files["file_b"]

    try:
        text_a = file_a.read().decode("utf-8", errors="replace").strip()
        text_b = file_b.read().decode("utf-8", errors="replace").strip()
    except Exception as exc:
        return jsonify({"error": f"Failed to read files: {str(exc)}"}), 400

    if not text_a or not text_b:
        return jsonify({"error": "One or both files are empty."}), 400

    if len(text_a) > 500_000 or len(text_b) > 500_000:
        return jsonify({"error": "File too large. Max 500,000 characters per document."}), 413

    result = analyze(text_a, text_b)
    return jsonify(result)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n[*] Plagiarism Detector API running on http://localhost:{port}\n")
    app.run(debug=True, port=port)
