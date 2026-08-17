#!/bin/bash
# apply-cnames.sh — pushes the docker-gen CNAME output into pihole-FTL **live**,
# without restarting the container. Triggered via SIGUSR1 by the wrapper on a
# docker-gen -notify, or run directly for a one-off re-sync.
#
# Mechanism: FTL v6 refuses to change config items that were set via FTLCONF_*
# env vars ("cannot be changed via the API"). So cnameRecords must NOT be
# env-locked (the wrapper no longer exports FTLCONF_dns_cnameRecords). Once
# un-locked, PATCH /api/config + /api/action/restartdns applies them at runtime.
set -euo pipefail

CNAME_FILE="${1:-/cname_output/cname_output}"
API="http://127.0.0.1/api"
PW="${PIHOLE_API_PASSWORD:?PIHOLE_API_PASSWORD not set}"

log() { echo "[apply-cnames] $*"; }

# 1) Authenticate (session token)
AUTH="$(curl -s -X POST "$API/auth" \
        -H 'Content-Type: application/json' \
        --data "$(jq -nc --arg pw "$PW" '{password:$pw}')")"
SID="$(printf '%s' "$AUTH" | jq -r '.session.sid // empty')"
if [ -z "$SID" ]; then
    log "AUTH FAILED: $AUTH" >&2
    exit 1
fi

# 2) Build the desired cnameRecords array from the docker-gen output.
#    Each line is "name.home,server.home" — pass through verbatim,
#    drop blank lines so a trailing newline doesn't add an empty entry.
if [ -f "$CNAME_FILE" ]; then
    RECORDS="$(jq -Rs '[split("\n") | map(gsub("^[ \t]+|[ \t\r]+$";"")) |.[] | select(length>0)]' "$CNAME_FILE")"
else
    log "cname file missing: $CNAME_FILE" >&2
    exit 1
fi

PAYLOAD="$(jq -nc --argjson rec "$RECORDS" '{config:{dns:{cnameRecords:$rec}}}')"

# 3) PATCH the live config
RESP="$(curl -s -X PATCH "$API/config" \
        -H "X-FTL-SID: $SID" -H 'Content-Type: application/json' \
        --data "$PAYLOAD")"
if printf '%s' "$RESP" | grep -q '"error"'; then
    log "PATCH FAILED: $RESP" >&2
    exit 2
fi
count="$(printf '%s' "$RECORDS" | jq length)"
log "PATCH ok: $count cname records"

# 4) Reload FTL's embedded DNS server in place (NOT a container restart)
curl -s -X POST "$API/action/restartdns" -H "X-FTL-SID: $SID" >/dev/null || true
log "restartdns triggered"