#!/bin/bash
set -euo pipefail

# Deploy script for viber-chatbot production
# Usage: ./deploy.sh [--build-admin]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Viber Chatbot Deploy ==="

# Check required files
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example and fill in production values."
  exit 1
fi

# Source env for validation
set -a
source .env
set +a

# Validate critical env vars
REQUIRED_VARS=(
  ADMIN_API_TOKEN
  ENCRYPTION_KEY
  WEBHOOK_BASE_URL
  OPENAI_API_KEY
  POSTGRES_USER
  POSTGRES_PASSWORD
  REDIS_PASSWORD
  CHATWOOT_SECRET_KEY_BASE
  CHATWOOT_FRONTEND_URL
  CORS_ORIGIN
)

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var is not set in .env"
    exit 1
  fi
done

# Warn about default values
if [ "$ADMIN_API_TOKEN" = "change-me-in-production" ] || [ "$ADMIN_API_TOKEN" = "your-secret-admin-token-here" ]; then
  echo "ERROR: ADMIN_API_TOKEN is still set to default value. Change it!"
  exit 1
fi

if [ "$ENCRYPTION_KEY" = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" ]; then
  echo "ERROR: ENCRYPTION_KEY is still set to default value."
  echo "  Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
  exit 1
fi

if ! echo "$ENCRYPTION_KEY" | grep -qE '^[0-9a-fA-F]{64}$'; then
  echo "ERROR: ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)."
  exit 1
fi

# Build admin dashboard if requested
if [ "${1:-}" = "--build-admin" ]; then
  echo "--- Building admin dashboard ---"
  cd admin
  npm ci
  npm run build -- --configuration=production
  cd ..
  echo "Admin dashboard built."
fi

# Check SSL certificates
if [ ! -f nginx/ssl/cert.pem ] || [ ! -f nginx/ssl/key.pem ]; then
  echo "WARNING: SSL certificates not found in nginx/ssl/"
  echo "  Place cert.pem and key.pem there, or use certbot."
  echo "  Continuing without SSL (HTTP only)..."
fi

# Pull latest images and rebuild
echo "--- Pulling images and building ---"
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml build app

# Deploy with zero-downtime restart
echo "--- Starting services ---"
docker compose -f docker-compose.prod.yml up -d

# Wait for health check
echo "--- Waiting for app to be healthy ---"
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T app wget -qO- http://localhost:3000/health 2>/dev/null | grep -q '"ok"'; then
    echo "App is healthy!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: App failed to become healthy after 30 attempts."
    docker compose -f docker-compose.prod.yml logs app --tail=50
    exit 1
  fi
  echo "  Waiting... ($i/30)"
  sleep 2
done

# Wait for Chatwoot to be ready
echo "--- Waiting for Chatwoot to be ready ---"
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/auth/sign_in > /dev/null 2>&1; then
    echo "Chatwoot is ready!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "WARNING: Chatwoot did not become ready after 30 attempts."
    echo "  Check logs: docker compose -f docker-compose.prod.yml logs chatwoot-rails --tail=50"
  fi
  echo "  Waiting... ($i/30)"
  sleep 3
done

echo ""
echo "=== Deploy complete ==="
echo "App:      ${WEBHOOK_BASE_URL}/health"
echo "Admin:    ${CORS_ORIGIN}"
echo "Chatwoot: ${CHATWOOT_FRONTEND_URL}"
echo ""
docker compose -f docker-compose.prod.yml ps
