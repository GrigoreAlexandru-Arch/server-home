#!/bin/bash
# pc-gate: generate the gate's dedicated ed25519 keypair on first boot and
# push the public key out. The host never sees the private key.
set -euo pipefail

KEY="/data/pc-gate/gate_key"
PUB="${KEY}.pub"

# Idempotent: if the private key already exists, do nothing.
if [ -f "$KEY" ]; then
  echo "gate key already exists at $KEY; nothing to do."
  exit 0
fi

ssh-keygen -t ed25519 -N "" -f "$KEY" -C "pc-gate@server.home"
# Ensure the .pub file is present and readable by the host without exposing the private key.
ssh-keygen -y -f "$KEY" > "$PUB"
chmod 600 "$KEY"
chmod 644 "$PUB"
echo "generated ed25519 gate keypair: $KEY (private, 600) / $PUB (public, 644)"