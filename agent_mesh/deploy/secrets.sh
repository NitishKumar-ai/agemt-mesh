#!/bin/bash
PROJECT_ID=${1:?'Usage: secrets.sh <project-id>'}
for SECRET in ANTHROPIC_API_KEY GEMINI_API_KEY OPENAI_API_KEY GITHUB_TOKEN E2B_API_KEY LANGFUSE_SECRET_KEY; do
  gcloud secrets create $SECRET --project=$PROJECT_ID 2>/dev/null || true
  echo "Set $SECRET: gcloud secrets versions add $SECRET --data-file=-"
done
