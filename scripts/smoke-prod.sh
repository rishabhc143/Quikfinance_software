#!/usr/bin/env bash
# Quikfinance production smoke test.
#
# Run end-of-day (or after any prod deploy) to confirm the canonical
# URL is up, key auth-gated routes redirect cleanly to /login, key
# public routes return 200, and the latest Vercel deploy is Ready.
#
# Usage:
#   pnpm smoke:prod                          # uses canonical URL
#   PROD_URL=https://preview.example bash scripts/smoke-prod.sh
#
# Exit codes:
#   0 — all checks passed
#   1 — at least one check failed (details printed)
#
# What this DOESN'T check (intentionally):
#   - Anything that requires auth (would need session cookies)
#   - Anthropic API health (we don't burn credits on smoke)
#   - Database state (would need DATABASE_URL we don't have locally)
# Those are CI Playwright + manual login tests.

set -u
PROD_URL="${PROD_URL:-https://quikfinance-software.vercel.app}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
RESET='\033[0m'

pass=0
fail=0
total=0

# Test runner — fetches a URL and asserts the status code.
#   check "label" "url" "expected_status"
check() {
  local label="$1"
  local url="$2"
  local expected="$3"
  total=$((total + 1))
  local got
  # No -L: we want curl to REPORT the redirect status without following.
  # Without -L, curl returns exit 0 even on 3xx so we can capture cleanly.
  got=$(curl -sS -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
  [ -z "$got" ] && got="ERR"
  if [ "$got" = "$expected" ]; then
    printf "  ${GREEN}✓${RESET} %-45s  %s\n" "$label" "$got"
    pass=$((pass + 1))
  else
    printf "  ${RED}✗${RESET} %-45s  expected=%s got=%s\n" "$label" "$expected" "$got"
    fail=$((fail + 1))
  fi
}

echo ""
echo "Quikfinance production smoke test"
echo "  Target: $PROD_URL"
echo "  Time:   $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

echo "── Public routes (should 200) ────────────────────────────"
check "Login page"          "$PROD_URL/login"           "200"
check "Signup page"         "$PROD_URL/signup"          "200"
check "Help center"         "$PROD_URL/help"            "200"
check "API ping"            "$PROD_URL/api/ping"        "200"

echo ""
echo "── Auth-gated routes (should redirect 307 to /login) ─────"
check "Dashboard"                       "$PROD_URL/"                                      "307"
check "Sales > Invoices"                "$PROD_URL/sales/invoices"                        "307"
check "Purchases > Bills"               "$PROD_URL/purchases/bills"                       "307"
check "Banking"                         "$PROD_URL/banking"                               "307"
check "Documents"                       "$PROD_URL/documents"                             "307"
check "Reports"                         "$PROD_URL/reports"                               "307"
check "Cashflow > Forecast"             "$PROD_URL/cashflow/forecast"                     "307"
check "Cashflow > CFO Copilot"          "$PROD_URL/cashflow/copilot"                      "307"
check "Cashflow > Alerts"               "$PROD_URL/cashflow/alerts"                       "307"
check "Settings > Data > Tally"         "$PROD_URL/settings/data/tally-companion"         "307"
check "Settings > AI Usage"             "$PROD_URL/settings/ai-usage"                     "307"
check "Settings home"                   "$PROD_URL/settings"                              "307"

echo ""
echo "── API protection (should reject without auth) ───────────"
check "Admin migrate (no key)"          "$PROD_URL/api/admin/migrate"                     "405"
check "Cron anomaly (no bearer)"        "$PROD_URL/api/cron/anomaly-detect"               "401"

echo ""
echo "── Vercel deploy status ──────────────────────────────────"
if command -v vercel >/dev/null 2>&1; then
  # Vercel CLI prints the detailed table to STDERR; only the
  # deployment URLs go to stdout. So we combine 2>&1 to get the
  # full table, then grep the Production row + extract status.
  status=$(vercel ls --prod 2>&1 | grep -E "Production[[:space:]]+[0-9]" | head -1 | grep -oE "(Ready|Building|Error|Queued|Canceled)" || echo "UNKNOWN")
  if [ "$status" = "Ready" ]; then
    printf "  ${GREEN}✓${RESET} %-45s  %s\n" "Latest production deploy"  "$status"
    pass=$((pass + 1))
  else
    printf "  ${YELLOW}!${RESET} %-45s  %s\n" "Latest production deploy"  "$status"
  fi
  total=$((total + 1))
else
  echo "  - vercel CLI not installed locally; skipping deploy check"
fi

echo ""
echo "──────────────────────────────────────────────────────────"
if [ "$fail" -eq 0 ]; then
  printf "${GREEN}✓ All %d checks passed${RESET}\n" "$pass"
  exit 0
else
  printf "${RED}✗ %d failed${RESET}, %d passed (of %d total)\n" "$fail" "$pass" "$total"
  exit 1
fi
