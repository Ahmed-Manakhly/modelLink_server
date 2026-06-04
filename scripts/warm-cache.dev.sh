SERVER_HOST="${1:-192.168.0.89}"
BASE_URL="http://localhost:8000/api"
TOTAL=0
FAILED=0

# Warm one URL — silent output, just track success/fail
warm() {
    local label="$1"
    local url="$2"
    local status
    # Pass Host header so nginx server_name matching works from localhost
    status=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: ${SERVER_HOST}" "$url")
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
# 1. AI Models
# ─────────────────────────────────────────────
echo ""
echo "📦 AI Models"
warm "aiModels_all"           "$BASE_URL/aiModel"

# ─────────────────────────────────────────────
# 3. Global Configurations
# ─────────────────────────────────────────────
echo ""
echo "🔐 Admin Authentication (Pending Implementation)"
# TODO: Add admin auth curl request here once endpoint is finalized
# e.g., ADMIN_TOKEN=$(curl -s -X POST $BASE_URL/auth/login -d '{"email":"admin@mod.com","password":"..."}' | jq -r .token)
# Note: Legacy DICOM configuration endpoints (module, target, rule) have been deprecated.

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
PASSED=$((TOTAL - FAILED))
echo "✅ Warmed: $PASSED / $TOTAL endpoints"
if [[ $FAILED -gt 0 ]]; then
    echo "❌ Failed: $FAILED endpoints (check backend logs)"
fi
echo "🏁 Done at $(date '+%H:%M:%S') — cache is hot for 5 minutes"
echo ""
