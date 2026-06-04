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
# 2. Companies / Orgs
# ─────────────────────────────────────────────
echo ""
echo "🏢 Companies"
warm "company_all"            "$BASE_URL/company"

# ─────────────────────────────────────────────
# 3. Gigs
# ─────────────────────────────────────────────
echo ""
echo "🔗 Gigs / Services"
warm "gigs_all"               "$BASE_URL/gigs"

# ─────────────────────────────────────────────
# 4. Global Configurations
# ─────────────────────────────────────────────
echo ""
echo "📄 System Modules & Targets"
warm "modules_all"            "$BASE_URL/module"
warm "targets_all"            "$BASE_URL/target"
warm "rules_all"              "$BASE_URL/rule"

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
