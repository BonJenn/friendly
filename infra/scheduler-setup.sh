#!/bin/bash
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
REGION="${GCP_REGION:-us-central1}"
JOB_SECRET="${PROACTIVE_JOB_SECRET:?Set PROACTIVE_JOB_SECRET}"

# Get the Cloud Run service URL
SERVICE_URL=$(gcloud run services describe friendly-api \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')

echo "=== Setting up Cloud Scheduler for Proactive Outreach ==="
echo "Service URL: ${SERVICE_URL}"
echo ""

# ─── Create scheduler job ───────────────────────────────────
# Runs every 15 minutes
gcloud scheduler jobs create http friendly-proactive-job \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --schedule="*/15 * * * *" \
  --uri="${SERVICE_URL}/api/proactive/run" \
  --http-method=POST \
  --headers="x-job-secret=${JOB_SECRET},Content-Type=application/json" \
  --attempt-deadline=120s \
  --max-retry-attempts=1 \
  --description="Friendly proactive outreach - sends texts/calls to eligible users every 15 min" \
  || echo "Job already exists, updating..."

# Update if it already exists
gcloud scheduler jobs update http friendly-proactive-job \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --schedule="*/15 * * * *" \
  --uri="${SERVICE_URL}/api/proactive/run" \
  --http-method=POST \
  --headers="x-job-secret=${JOB_SECRET},Content-Type=application/json" \
  --attempt-deadline=120s \
  --max-retry-attempts=1 \
  2>/dev/null || true

echo ""
echo "=== Scheduler Setup Complete ==="
echo ""
echo "To test manually:"
echo "  gcloud scheduler jobs run friendly-proactive-job --project=${PROJECT_ID} --location=${REGION}"
echo ""
echo "To pause:"
echo "  gcloud scheduler jobs pause friendly-proactive-job --project=${PROJECT_ID} --location=${REGION}"
echo ""
echo "To view logs:"
echo "  gcloud logging read 'resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"friendly-api\"' --project=${PROJECT_ID} --limit=50"
