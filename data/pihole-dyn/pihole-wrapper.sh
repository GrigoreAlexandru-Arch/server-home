#!/bin/bash
# pihole-wrapper.sh — Pi-hole container entrypoint, extended so CNAME records
# can be applied to FTL **live** without restarting the container.
#
# Why: FTL v6 loads all DNS records into memory at daemon start and has no
# runtime CNAME reload; the old design exported FTLCONF_dns_cnameRecords at
# boot, which (a) only worked on restart and (b) env-locked the item so the
# FTL API refused to change it. We now drive cnameRecords via the FTL API
# instead: the wrapper traps SIGUSR1 (sent by docker-gen on cname change) and
# runs apply-cnames.sh. The container is never restarted by the mechanism.
#
# NOTE: no `set -e` here. A trapped SIGUSR1 interrupts `wait`, making it return
# 138; under `set -e` that would fatally exit the container. We instead resume
# the wait while the real entrypoint (start.sh) is still alive.
set -uo pipefail

CNAME_FILE="/cname_output/cname_output"
APPLY="/pihole-dyn/apply-cnames.sh"

ENTRY_PID=0

reconcile() {
    echo "[wrapper] SIGUSR1: reconciling CNAME records"
    if [ -x "$APPLY" ]; then
        "$APPLY" "$CNAME_FILE" || echo "[wrapper] apply-cnames.sh reported an error" >&2
    else
        echo "[wrapper] $APPLY not present (reconcile skipped)" >&2
    fi
}
trap reconcile USR1

# Forward stop signals to the real entrypoint so FTL shuts down cleanly.
fwd() { [ "$ENTRY_PID" -gt 0 ] && kill -s "$1" "$ENTRY_PID" 2>/dev/null || true; }
trap 'fwd TERM' TERM
trap 'fwd INT'  INT
trap 'fwd QUIT' QUIT

# Launch Pi-hole's real entrypoint as a child so this wrapper stays PID 1
# (needed to keep receiving SIGUSR1) and can relay signals for clean shutdown.
start.sh "$@" &
ENTRY_PID=$!

# Re-seed CNAME records once FTL is up after every boot. Records are API-owned
# now (empty at start), so reconcile from /cname_output shortly after FTL is
# ready. Idempotent; also covers a fresh/migrated volume.
( sleep 10; [ -x "$APPLY" ] && "$APPLY" "$CNAME_FILE" ) &

# Wait on the real entrypoint, resuming whenever a handled signal (e.g. the
# SIGUSR1 reconcile trigger) interrupts `wait`. Only exit when start.sh has
# actually terminated.
while :; do
    wait $ENTRY_PID
    code=$?
    if ! kill -0 $ENTRY_PID 2>/dev/null; then
        break
    fi
done
exit "$code"