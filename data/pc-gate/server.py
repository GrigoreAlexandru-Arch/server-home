"""pc-gate: minimal authority-gated SSH executor for mihai@pc.home."""
import os
import subprocess
from fastmcp import FastMCP

mcp = FastMCP("pc-gate")

PC = os.environ.get("PC_HOST", "mihai@pc.home")
KEY = os.environ.get("GATE_KEY", "/data/pc-gate/gate_key")
STAGING = os.environ.get("STAGING_DIR", "/transfer")

_SSH_BASE = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
             "-i", KEY, PC]
_SCP_BASE = ["scp", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-i", KEY]


@mcp.tool()
def pc_run_command(command: str) -> str:
    """Run `command` on pc.home and return stdout/stderr."""
    p = subprocess.run(_SSH_BASE + [command], capture_output=True, text=True, timeout=120)
    return f"exit={p.returncode}\n{p.stdout}\n{p.stderr}"


@mcp.tool()
def pc_transfer(src: str, dst: str, direction: str) -> str:
    """Copy a file. direction='push': src is inside the /transfer staging dir, dst is a PC path.
       direction='pull': src is a PC path, dst lands in /transfer."""
    if direction == "push":
        cmd = _SCP_BASE + [f"{STAGING}/{src}", f"{PC}:{dst}"]
    elif direction == "pull":
        cmd = _SCP_BASE + [f"{PC}:{src}", f"{STAGING}/{dst}"]
    else:
        return "error: direction must be push|pull"
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    return f"exit={p.returncode}\n{p.stdout}\n{p.stderr}"


if __name__ == "__main__":
    # Bind 0.0.0.0 INSIDE the container so docker's userland proxy (host
    # 127.0.0.1:8123 -> container eth0) can reach it. The container is not on
    # the LAN bridge and the host port is loopback-only (127.0.0.1:8123:8123),
    # so inbound is host-loopback-only; binding wider inside is safe.
    mcp.run(transport="http", host="0.0.0.0", port=int(os.environ.get("PORT", "8123")))