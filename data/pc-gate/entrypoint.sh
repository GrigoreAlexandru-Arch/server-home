#!/bin/bash
# pc-gate entrypoint: initialize the gate key on first boot, then run the
# FastMCP HTTP server. Env (PORT, PC_HOST, GATE_KEY, STAGING_DIR) comes from compose.
set -e

/app/init_keys.sh
exec python3 /app/server.py