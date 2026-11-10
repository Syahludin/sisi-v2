#!/usr/bin/env bash
# Deploy sisi-pdf-engine ke Cloud Run (jalankan di Cloud Shell dari folder ini).
#   bash deploy.sh                      -> service sisi2-pdf-staging
#   bash deploy.sh sisi2-pdf-production -> service production (rahasia BERBEDA dari staging)
#   ROTASI=1 bash deploy.sh <service>   -> buat rahasia baru (Script Property PDF_ENGINE_SECRET wajib ikut diganti)
set -euo pipefail
LAYANAN="${1:-sisi2-pdf-staging}"
# v1.0.38: asia-southeast1 (Singapura). asia-southeast2 (Jakarta) menolak semua request ("Rate exceeded") sesudah billing
# project sempat mati 27 Okt 2026, walau kuota normal.
REGION="${REGION:-asia-southeast1}"
PROJECT="$(gcloud config get-value project 2>/dev/null)"
[ -n "$PROJECT" ] || { echo "Project belum dipilih: gcloud config set project <id>"; exit 1; }
echo "Project $PROJECT, region $REGION, service $LAYANAN"

RAHASIA=""
if ! gcloud run services describe "$LAYANAN" --region "$REGION" --format='value(metadata.name)' >/dev/null 2>&1 || [ "${ROTASI:-0}" = "1" ]; then
  RAHASIA="$(openssl rand -hex 32)"
fi

ARGS=(--source . --region "$REGION" --allow-unauthenticated
  --max-instances 1 --min-instances 0 --concurrency 4
  --cpu 1 --memory 512Mi --timeout 120 --cpu-throttling
  --labels "app=sisi-v2,komponen=pdf-engine")
ENV_VARS="ENGINE_DAILY_REQUEST_BUDGET=500,ENGINE_MAX_BODY_BYTES=25000000"
[ -n "$RAHASIA" ] && ENV_VARS="$ENV_VARS,PDF_SECRET=$RAHASIA"
ARGS+=(--update-env-vars "$ENV_VARS")

gcloud run deploy "$LAYANAN" "${ARGS[@]}"
URL="$(gcloud run services describe "$LAYANAN" --region "$REGION" --format='value(status.url)')"
echo
echo "================ ISI SCRIPT PROPERTIES APPS SCRIPT ================"
echo "PDF_ENGINE_URL    = $URL"
if [ -n "$RAHASIA" ]; then
  echo "PDF_ENGINE_SECRET = $RAHASIA"
  echo "(rahasia ini hanya tampil sekali, salin sekarang)"
else
  echo "PDF_ENGINE_SECRET = (tidak berubah; rotasi: ROTASI=1 bash deploy.sh $LAYANAN)"
fi
echo "==================================================================="
echo "Cek cepat: curl -s $URL/   (harus: ok)"
