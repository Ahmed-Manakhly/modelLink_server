#!/usr/bin/env bash

# Usage: bash warm-cache.sh (defaults to localhost/127.0.0.1)
# Usage: bash warm-cache.sh www.modellink.com (for prod Nginx)
# nginx expects Host: ????? — must match server_name in nginx.conf
SERVER_HOST="${1:-127.0.0.1}"

# Helper to read values from .env safely without sourcing
get_env_val() {
    local key="$1"
    local default_val="$2"
    local val=""
    if [ -f ".env" ]; then
        # Matches key="value", key='value', or key=value
        val=$(grep -E "^${key}=" .env | cut -d'=' -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
    fi
    if [ -z "$val" ]; then
        echo "$default_val"
    else
        echo "$val"
    fi
}

ADMIN_EMAIL=$(get_env_val "ADMIN_EMAIL" "admin@modellink.com")
ADMIN_PASSWORD=$(get_env_val "ADMIN_PASSWORD" "A@1234567891a")
PORT=$(get_env_val "PORT" "8080")

# Hitting localhost:PORT allows bypassing VPN hairpin issues while injecting the Host header for Nginx
BASE_URL="http://localhost:${PORT}/api"

TOTAL=0
FAILED=0

# Warm one URL — silent output, tracks success/fail
warm() {
    local label="$1"
    local url="$2"
    local token="$3"
    local status

    if [ -n "$token" ]; then
        status=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Host: ${SERVER_HOST}" \
            -H "Authorization: Bearer ${token}" \
            "$url")
    else
        status=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Host: ${SERVER_HOST}" \
            "$url")
    fi

    TOTAL=$((TOTAL + 1))
    if [[ "$status" == "200" || "$status" == "204" ]]; then
        echo "  ✅ [$status] $label"
    else
        echo "  ❌ [$status] $label — $url"
        FAILED=$((FAILED + 1))
    fi
}

echo ""
echo "🔥 ModelLink Cache Warmer — $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════════════════"

# ─────────────────────────────────────────────
# 1. AI Models (Frontend UI Queries)
# ─────────────────────────────────────────────
echo ""
echo "📦 Public Marketplace Endpoints"
warm "all_models_base"        "$BASE_URL/aiModel"
warm "models_latest"          "$BASE_URL/aiModel?sort=-createdAt&limit=12"
warm "models_nlp"             "$BASE_URL/aiModel?category=NLP&limit=12"
warm "models_cv"              "$BASE_URL/aiModel?category=Computer%20Vision&limit=12"
warm "models_generative"      "$BASE_URL/aiModel?category=Generative%20AI&limit=12"

# ─────────────────────────────────────────────
# 2. Taxonomies & UI Metadata
# ─────────────────────────────────────────────
echo ""
echo "🏷️ Taxonomies & Metadata"
warm "categories_all"         "$BASE_URL/taxonomy/categories"
warm "tags_all"               "$BASE_URL/taxonomy/tags"
warm "modalities_all"         "$BASE_URL/taxonomy/modalities"

# ─────────────────────────────────────────────
# 3. Admin Authentication
# ─────────────────────────────────────────────
echo ""
echo "🔑 Requesting Admin Session..."
LOGIN_RES=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "Host: ${SERVER_HOST}" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    "$BASE_URL/auth/login")

ADMIN_TOKEN=$(echo "$LOGIN_RES" | grep -o '"token":"[^"]*' | grep -o '[^"]*$')

if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ]; then
    echo "  ✅ Authenticated successfully as $ADMIN_EMAIL"

    # ─────────────────────────────────────────────
    # 4. Administrative / Staff Endpoints
    # ─────────────────────────────────────────────
    echo ""
    echo "🔐 Warming Restricted Admin/Staff Cache"
    warm "admin_users"          "$BASE_URL/admin/users"          "$ADMIN_TOKEN"
    warm "admin_disputes"       "$BASE_URL/disputes"             "$ADMIN_TOKEN"
    warm "admin_verifications"  "$BASE_URL/verifications"        "$ADMIN_TOKEN"
    warm "admin_payouts"        "$BASE_URL/payouts"              "$ADMIN_TOKEN"
    warm "admin_transactions"   "$BASE_URL/admin/transactions"   "$ADMIN_TOKEN"
    warm "admin_audit_logs"     "$BASE_URL/admin/audit-logs"     "$ADMIN_TOKEN"
    warm "admin_settings"       "$BASE_URL/admin/settings"       "$ADMIN_TOKEN"
    warm "admin_orders"         "$BASE_URL/orders"               "$ADMIN_TOKEN"
else
    echo "  ❌ Failed to obtain admin token. Check admin credentials or server connection."
    echo "  Response was: $LOGIN_RES"
    FAILED=$((FAILED + 1))
fi

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
PASSED=$((TOTAL - FAILED))
if [ $PASSED -lt 0 ]; then
    PASSED=0
fi
echo "✅ Warmed: $PASSED / $TOTAL endpoints"
if [[ $FAILED -gt 0 ]]; then
    echo "❌ Failed: $FAILED endpoints (could include the admin token failure)"
fi
echo "🏁 Done at $(date '+%H:%M:%S') — cache is hot for 5 minutes"
echo ""
