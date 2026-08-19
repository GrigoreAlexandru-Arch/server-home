"""pc-access: minimal authority-gated SSH executor for mihai@pc.home.

Offline handling: every tool first probes the PC's SSH port (TCP 22, short
timeout). If unreachable we return an explicit OFFLINE message instead of
letting the ssh connect hang and burn the full subprocess timeout. ssh/scp
also get a ConnectTimeout so they fail fast even if the pre-check slips.
"""
import os
import socket
import subprocess
from fastmcp import FastMCP

mcp = FastMCP("pc-access")

PC = os.environ.get("PC_HOST", "mihai@pc.home")
KEY = os.environ.get("GATE_KEY", "/data/pc-gate/gate_key")
STAGING = os.environ.get("STAGING_DIR", "/transfer")

# Aliased so tests can inject a fake; production = socket.create_connection.
_create_connection = socket.create_connection

_SSH_BASE = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
             "-o", "ConnectTimeout=5", "-i", KEY, PC]
_SCP_BASE = ["scp", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
             "-o", "ConnectTimeout=5", "-i", KEY]

_OFFLINE_MSG = ("error: pc.home is OFFLINE (TCP port 22 unreachable). "
                "PC is powered off or the WireGuard link is down; nothing was run.")

# How long to let a single ssh/scp attempt run (connect + command). The
# pre-check + ConnectTimeout make real cases fail fast; this bounds the worst case.
_RUN_TIMEOUT = 60


def _pc_host() -> str:
    # PC is "mihai@pc.home" -> use only the host part for the socket probe.
    return PC.rsplit("@", 1)[-1]


def _pc_online(timeout: float = 2.0) -> bool:
    """True if the PC answers on SSH port 22 within `timeout` seconds."""
    try:
        with _create_connection((_pc_host(), 22), timeout=timeout):
            return True
    except OSError:
        return False


def _run(cmd):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=_RUN_TIMEOUT)
        return f"exit={p.returncode}\n{p.stdout}\n{p.stderr}"
    except subprocess.TimeoutExpired:
        return "error: command timed out (pc.home did not answer in time)"


@mcp.tool()
def execute(command: str) -> str:
    """Run `command` on pc.home and return stdout/stderr. Fails fast (no 120s hang) if the PC is offline."""
    if not _pc_online():
        return _OFFLINE_MSG
    return _run(_SSH_BASE + [command])


@mcp.tool()
def transfer(src: str, dst: str, direction: str) -> str:
    """Copy a file. direction='push': src is inside the /transfer staging dir, dst is a PC path.
       direction='pull': src is a PC path, dst lands in /transfer. Fails fast if the PC is offline."""
    if direction == "push":
        cmd = _SCP_BASE + [f"{STAGING}/{src}", f"{PC}:{dst}"]
    elif direction == "pull":
        cmd = _SCP_BASE + [f"{PC}:{src}", f"{STAGING}/{dst}"]
    else:
        return "error: direction must be push|pull"
    if not _pc_online():
        return _OFFLINE_MSG
    return _run(cmd)


if __name__ == "__main__":
    # Bind 0.0.0.0 INSIDE the container so docker's userland proxy (host
    # 127.0.0.1:8123 -> container eth0) can reach it. The container is not on
    # the LAN bridge and the host port is loopback-only (127.0.0.1:8123:8123),
    # so inbound is host-loopback-only; binding wider inside is safe.
    mcp.run(transport="http", host="0.0.0.0", port=int(os.environ.get("PORT", "8123")))
