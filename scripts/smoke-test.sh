#!/bin/sh
set -e

COMPOSE="docker-compose"
APP_URL="http://localhost:3000"
TIMEOUT=60

cleanup() {
  echo "Tearing down containers..."
  $COMPOSE down -v --remove-orphans 2>/dev/null
}
trap cleanup EXIT

echo "=== Smoke Test ==="

# 1. Build and start
echo "Starting containers..."
$COMPOSE up -d --build

# 2. Wait for app to become healthy
echo "Waiting for app to become healthy (max ${TIMEOUT}s)..."
elapsed=0
while [ $elapsed -lt $TIMEOUT ]; do
  status=$(docker inspect --format='{{.State.Health.Status}}' "$(${COMPOSE} ps -q app)" 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then
    echo "App is healthy after ${elapsed}s"
    break
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

if [ $elapsed -ge $TIMEOUT ]; then
  echo "FAIL: App did not become healthy within ${TIMEOUT}s"
  echo "--- App logs ---"
  $COMPOSE logs app
  exit 1
fi

# 3. Test /health endpoint
echo "Testing /health endpoint..."
response=$(curl -s -w "\n%{http_code}" "$APP_URL/health")
body=$(echo "$response" | head -1)
http_code=$(echo "$response" | tail -1)

if [ "$http_code" != "200" ]; then
  echo "FAIL: /health returned HTTP $http_code"
  echo "Body: $body"
  exit 1
fi

echo "GET /health -> $http_code"
echo "$body"

# 4. Verify JSON fields
for field in status database redis; do
  if ! echo "$body" | grep -q "\"$field\""; then
    echo "FAIL: /health response missing '$field' field"
    exit 1
  fi
done

echo ""
echo "=== Smoke Test PASSED ==="
