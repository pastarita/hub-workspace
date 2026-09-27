#!/usr/bin/env bash
# 3PT · Tier 1: put Cloudflare Access (Zero Trust) in front of the hub, over the API.
#
# Creates one self-hosted Access application covering 3pt.pages.dev AND *.3pt.pages.dev (so PR
# previews are gated by the same app and AUD), with one Allow policy for the principals, then
# writes ACCESS_TEAM_DOMAIN + ACCESS_AUD into the Pages project (Production and Preview) so
# functions/_middleware.js can verify the assertion. Idempotent: re-running updates the same app.
#
# Needs an API token — the wrangler OAuth login has no Zero Trust scope. Create one at
#   https://dash.cloudflare.com/profile/api-tokens  →  Create Token  →  Custom token
#   Permissions (Account):  Access: Apps and Policies · Edit
#                           Access: Organizations, Identity Providers, and Groups · Read
#   Account resources:      Include · <your account>
# and save it to ~/.config/3pt/CF_API_TOKEN (chmod 600). Never commit it.
#
# Usage:  CF_ACCOUNT_ID=<id> ACCESS_DOMAIN=example.com \
#         ACCESS_EMAILS="you@example.com,collaborator@gmail.com" tools/access-setup.sh
set -euo pipefail
ACCOUNT="${CF_ACCOUNT_ID:?set CF_ACCOUNT_ID (wrangler whoami prints it)}"
PROJECT="${PAGES_PROJECT:-3pt}"
APP_NAME="${ACCESS_APP_NAME:-3PT hub}"
EMAILS="${ACCESS_EMAILS:?set ACCESS_EMAILS to the principals' login addresses, comma-separated}"
DOMAIN="${ACCESS_DOMAIN:-}"
TOKEN="${CF_API_TOKEN:-$(cat ~/.config/3pt/CF_API_TOKEN 2>/dev/null || true)}"
[ -n "$TOKEN" ] || { echo "FAIL: no API token. Put one in ~/.config/3pt/CF_API_TOKEN (see header)." >&2; exit 1; }
command -v jq >/dev/null || { echo "FAIL: jq is required (brew install jq)" >&2; exit 1; }
API="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT"
cf() { curl -sS -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$@"; }
ok() { jq -e '.success' >/dev/null 2>&1; }

# 1. team domain (the Zero Trust organization)
ORG="$(cf "$API/access/organizations")"
echo "$ORG" | ok || { echo "FAIL: cannot read the Zero Trust organization — token scope, or no Zero Trust org yet (create one once in the dashboard: Zero Trust → choose a team name)." >&2; echo "$ORG" | jq -r '.errors[]?.message' >&2; exit 1; }
TEAM="$(echo "$ORG" | jq -r '.result.auth_domain')"
echo "team domain: $TEAM"

# 2. policy include rules: every email in ACCESS_EMAILS, plus the ACCESS_DOMAIN domain if set
INCLUDE="$(printf '%s' "$EMAILS" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep . | jq -R '{email:{email:.}}' | jq -s --arg d "$DOMAIN" 'if $d == "" then . else . + [{email_domain:{domain:$d}}] end')"
BODY="$(jq -n --arg name "$APP_NAME" --arg dom "$PROJECT.pages.dev" --arg wild "*.$PROJECT.pages.dev" --argjson inc "$INCLUDE" '{
  name: $name, type: "self_hosted", domain: $dom, self_hosted_domains: [$dom, $wild],
  session_duration: "24h", app_launcher_visible: true, auto_redirect_to_identity: false,
  http_only_cookie_attribute: true, same_site_cookie_attribute: "lax",
  policies: [{ name: "3PT principals", decision: "allow", precedence: 1, include: $inc }]
}')"

# 3. create or update the app (idempotent on name)
EXISTING="$(cf "$API/access/apps?per_page=100" | jq -r --arg n "$APP_NAME" '.result[]? | select(.name==$n) | .id' | head -1)"
if [ -n "$EXISTING" ]; then
  RES="$(cf -X PUT "$API/access/apps/$EXISTING" --data "$BODY")"; echo "updated app $EXISTING"
else
  RES="$(cf -X POST "$API/access/apps" --data "$BODY")"; echo "created app"
fi
echo "$RES" | ok || { echo "FAIL:" >&2; echo "$RES" | jq '.errors' >&2; exit 1; }
AUD="$(echo "$RES" | jq -r '.result.aud')"
echo "aud: $AUD"

# 4. hand the verifier what it needs, in both Pages environments
HUB="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HUB"
for ENV in "" "--env preview"; do
  printf '%s' "$TEAM" | npx wrangler pages secret put ACCESS_TEAM_DOMAIN --project-name="$PROJECT" $ENV >/dev/null
  printf '%s' "$AUD"  | npx wrangler pages secret put ACCESS_AUD         --project-name="$PROJECT" $ENV >/dev/null
done
echo "ACCESS_TEAM_DOMAIN + ACCESS_AUD set (production + preview). Redeploy: make deploy, then make verify."
