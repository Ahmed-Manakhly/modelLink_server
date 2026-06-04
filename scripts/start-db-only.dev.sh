#!/bin/bash

# Create the network if it doesn't exist
if ! docker network ls | grep -q "modelink-network"; then
  echo "🌐 Creating docker network 'modelink-network'..."
  docker network create modelink-network
fi

# Ensure bind mount directories exist with native host permissions before Docker creates them as root
mkdir -p ./public ./logs

echo "🚀 Starting Database Container (Local Native Dev)..."
# Start ONLY the 'db' service from the main compose file
docker compose -f docker-compose.dev.yml up -d db pgadmin

echo "✅ Database is running on localhost:5432"
echo "✅ PgAdmin is running on localhost:5333"
echo "You can now run 'npm start' on your local host machine!"
