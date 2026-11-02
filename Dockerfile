# syntax=docker/dockerfile:1
# FailureLab AI: one container serving the built dashboard and the API on one origin.
# Build:  docker build -t failurelab .
# Run:    docker run --rm -p 8000:8000 --env-file backend/.env failurelab
# Without a model key the baseline planners, replays, lab, benchmark and real recordings work.

# --- Stage 1: build the dashboard -------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- Stage 2: runtime --------------------------------------------------------------
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FAILURELAB_FRONTEND_DIR=/app/frontend/dist
WORKDIR /app/backend

# The app locates .env, replays, results and data relative to its source tree, so it is
# installed in editable mode from this checkout (see docs/DEPLOYMENT.md).
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --upgrade pip && pip install -e .

# Committed evidence and curated replays; caches and raw downloads are excluded by
# .dockerignore. Runtime replays are written next to the demo folder.
COPY backend/replays/demo ./replays/demo
COPY backend/results ./results
COPY backend/data/real ./data/real
COPY --from=frontend /build/frontend/dist /app/frontend/dist

RUN useradd --create-home --uid 10001 failurelab \
    && chown -R failurelab:failurelab /app
USER failurelab

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:' + __import__('os').environ.get('PORT','8000') + '/api/health', timeout=4).status == 200 else 1)"

# Hosts such as Render and Fly set PORT; default to 8000 locally.
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
