#!/bin/bash

# =============================================================
# ModelLink Production Deploy Script
# Usage: bash deploy.sh
# =============================================================

set -e

# --------------------------------------------------------------
# 1. AppArmor Profiles
# Copies profiles from the repo into the system and loads them.
# This runs on every deploy to ensure profiles are always current.
# --------------------------------------------------------------
echo "[1/3] Loading AppArmor profiles..."
sudo mkdir -p /etc/apparmor.d/
sudo cp apparmor/modellink-restrict-db       /etc/apparmor.d/modellink-restrict-db
sudo cp apparmor/modellink-restrict-pgadmin  /etc/apparmor.d/modellink-restrict-pgadmin
sudo cp apparmor/modellink-restrict-nginx    /etc/apparmor.d/modellink-restrict-nginx
sudo apparmor_parser -r -W /etc/apparmor.d/modellink-restrict-db
sudo apparmor_parser -r -W /etc/apparmor.d/modellink-restrict-pgadmin
sudo apparmor_parser -r -W /etc/apparmor.d/modellink-restrict-nginx
echo "  ✅ AppArmor profiles loaded:"
sudo aa-status | grep modellink-restrict

# --------------------------------------------------------------
# 2. Docker Network
# --------------------------------------------------------------
echo ""
echo "[2/3] Checking Docker network..."
# Check if the network exists
if ! docker network ls | grep -q "modelink-network"; then
  echo "🌐 Creating docker network 'modelink-network'..."
  docker network create modelink-network
else
  echo "✅ Docker network 'modelink-network' already exists."
fi

# Boot the containers
echo "🚀 Starting Docker Compose (Production)..."
MAX_RETRIES=3
RETRY_COUNT=0
SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if docker compose up -d --build; then
    SUCCESS=true
    break
  else
    echo "⚠️ Docker Compose failed. Retrying in 10 seconds... ($((RETRY_COUNT + 1))/$MAX_RETRIES)"
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 10
  fi
done

if [ "$SUCCESS" = false ]; then
  echo "❌ Docker Compose failed after $MAX_RETRIES attempts. Stopping deployment."
  exit 1
fi

echo "🔄 Reloading Nginx configuration..."
docker compose exec -T nginx nginx -s reload || true

echo "✅ Production Deployment running!"

echo ""
echo "⏳ Waiting for backend to be ready..."
# Nginx on 8080 maps to backend internally
HEALTH_URL="http://localhost:8080/api/health"
MAX_WAIT=90
WAITED=0
until curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" | grep -q "200"; do
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "⚠️  Backend did not respond in ${MAX_WAIT}s — skipping cache warm"
    exit 0
  fi
  sleep 2
  WAITED=$((WAITED + 2))
done
echo "✅ Backend is ready (after ${WAITED}s)"

echo "⏳ Waiting 5 seconds for backend bootstrap to finish..."
sleep 5

# Run the cache warmer
bash ./scripts/warm-cache.sh
