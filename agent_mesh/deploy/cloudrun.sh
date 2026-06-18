#!/bin/bash
set -e

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
SERVICE_NAME="agent-mesh"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

echo "Building Docker image..."
docker build -t ${IMAGE} .

echo "Pushing image to GCR..."
docker push ${IMAGE}

echo "Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE} \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 10 \
  --set-secrets="ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,GITHUB_TOKEN=GITHUB_TOKEN:latest,E2B_API_KEY=E2B_API_KEY:latest,LANGFUSE_SECRET_KEY=LANGFUSE_SECRET_KEY:latest"
