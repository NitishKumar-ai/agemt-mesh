FROM python:3.11-slim
WORKDIR /app
# Install system deps for psycopg2, semgrep
RUN apt-get update && apt-get install -y gcc libpq-dev git curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE 8080
# Cloud Run uses PORT env var
CMD uvicorn api:app --host 0.0.0.0 --port ${PORT:-8080} --workers 2
