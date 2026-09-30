# ==========================================
# SkyCast Weather Engine - Backend Dockerfile
# ==========================================
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies for asyncpg and compiled extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies in isolated layer
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt


# ==========================================
# Final Production Runtime Stage
# ==========================================
FROM python:3.12-slim AS runner

WORKDIR /app

# Install curl for container health check
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder stage
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/app

# Copy application source tree
COPY . /app/backend

EXPOSE 8000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/docs || exit 1

# Start FastAPI server directly with exec for immediate SIGTERM/SIGINT signal handling
CMD ["sh", "-c", "exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

