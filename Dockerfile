# ============================================================
# Dockerfile — PlagiarismIQ
# ============================================================
# Single-stage build:
#   - Python 3.11-slim base
#   - Flask + gunicorn serve the API
#   - Frontend static files are bundled inside the image
#   - nginx (separate container) proxies requests here
# ============================================================

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install Python dependencies first (layer cache friendly)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy frontend static files (Flask will serve them too as fallback)
COPY frontend/ ./frontend/

# Expose gunicorn port
EXPOSE 8000

# Run with gunicorn: 4 workers, bind to 0.0.0.0:8000
CMD ["gunicorn", \
     "--workers", "4", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "60", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "backend.app:app"]
