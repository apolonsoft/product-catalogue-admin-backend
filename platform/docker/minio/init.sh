#!/bin/sh

sleep 2

echo ""
echo "Checking MinIO readiness at http://localhost:9000/minio/health/ready..."

# Wait until MinIO is reachable before proceeding
until mc alias set local http://localhost:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" > /dev/null 2>&1 && mc ready local > /dev/null 2>&1; do
  echo "Waiting for MinIO to be ready..."
  sleep 1
done

echo "MinIO is ready. Proceeding with bucket setup..."

# Create the configured bucket (idempotent due to -p flag)
mc mb -p "local/${S3_BUCKET}"

echo "Bucket creation completed."
