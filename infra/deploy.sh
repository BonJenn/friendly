#!/bin/bash
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="friendly-api"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "=== Deploying Friendly API ==="
echo "Project: ${PROJECT_ID}"
echo "Region:  ${REGION}"
echo ""

# ─── Step 1: Build and push Docker image ────────────────────
echo ">> Building Docker image..."
cd "$(dirname "$0")/../services/friendly-api"

gcloud builds submit \
  --project="${PROJECT_ID}" \
  --tag="${IMAGE}" \
  .

# ─── Step 2: Deploy to Cloud Run ────────────────────────────
echo ">> Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=360s \
  --concurrency=80 \
  --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID}" \
  --set-env-vars="STORAGE_BUCKET=${PROJECT_ID}-storage" \
  --set-env-vars="USE_MOCK_PROVIDERS=false" \
  --set-env-vars="NODE_ENV=production" \
  --set-env-vars="LOG_LEVEL=info" \
  --set-env-vars="OPENAI_API_KEY=${OPENAI_API_KEY:?Set OPENAI_API_KEY}"

# ─── Step 3: Get service URL ────────────────────────────────
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')

echo ""
echo "=== Deployment Complete ==="
echo "Service URL: ${SERVICE_URL}"
echo ""
echo "NEXT STEPS:"
echo "1. Update API_BASE_URL in apps/friendly-mobile/src/config/constants.ts"
echo "2. Set real API keys via:"
echo "   gcloud run services update ${SERVICE_NAME} \\"
echo "     --set-env-vars='OPENAI_API_KEY=sk-...,USE_MOCK_PROVIDERS=false'"
echo "3. Set the proactive job secret:"
echo "   gcloud run services update ${SERVICE_NAME} \\"
echo "     --set-env-vars='PROACTIVE_JOB_SECRET=your-secret-here'"
