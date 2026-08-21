# MCP-on-PC Security Redesign — Compile Plan

Author: Alex + ZeroPlus. Design tree CLOSED. This is the executable handoff.

## STATUS — SHIPPED (T2 decommission complete 2026-08-21)

This plan is **fully DONE and verified end-to-end**. The PC companion app
(autonomous repo `pc-access-mcp`, on Windows PC `pc.home` = 10.8.0.9) now hosts
both the OAuth 2.1 Authorization Server and the MCP Resource Server at
`https://10.8.0.9:8123/mcp` over TLS. The old Pi-side gate is completely removed.

- **T1 (Hermes config flip) — DONE.** `mcp_servers.pc_access` set to
  `url: https://10.8.0.9:8123/mcp`, `auth: oauth`,
  `ssl_verify: /home/arch/docker-config/data/certs/root-home.crt`. New gate
  works end-to-end.
- **T2 (decommission old Pi-side gate) — DONE.** `pc-access` compose service +
  `pc-gate-keys` volume removed from `docker-compose.yaml`; container, named
  volume `docker-config_pc-gate-keys`, build-context `data/pc-gate/` (incl.
  `staging/`) and image `pc-access:0.1.0` deleted; `ssh-approval` Hermes plugin
  removed via `hermes plugins remove` + `hermes config unset`. The old gate key
  is gone entirely — intended/final (the old ssh gate no longer exists). Verified
  on server.home: no `pc-access` container/volume/image remains,
  `docker compose config -q` passes, no `ssh-approval` in `hermes plugins` or
  config.yaml. Committed + pushed.
- **T3 (companion app) — DONE.** Single-process PyInstaller companion on the PC
  hosting the AS + Resource Server over WG `10.8.0.9:8123`, per-command modal
  approval + OAuth login. Verified working end-to-end.
- **T4 (transfer compat) — DONE/absorbed.** `transfer(src,dst,direction)`
  single-file contract preserved on the new companion; existing callers
  unchanged.

## Locked decisions
- MCP server moves OFF the Pi, ONTO Windows PC (pc.home = 10.8.0.9).
- Companion app (Windows 10/11) hosts BOTH the OAuth 2.1 Authorization Server AND the MCP Resource Server (`/mcp`, Streamable HTTP), bound to the WG interface, TLS from the home root CA.
- Two independent gates, BOTH on the PC:
  1. OAuth 2.1 login (`auth: oauth`) — identity layer, "this Hermes process may submit."
  2. Per-command MODAL approval dialog — authorization: exact command string, Windows GUI, Hermes cannot programmatically click.
- TLS: home root CA already issues `*.home` leaf covering `pc.home` (verified: `data/certs/root-home.crt` = Root Home, CN=Root Home, valid 2035; `home.crt` = `*.home` SAN incl pc.home, valid 2036). Use existing leaf or issue a `pc.home`-scoped leaf signed by root-home.
- Port: 8123 (matches old gate).
- PC runtime: PyInstaller .exe (no Python install required on PC).
- Decommission Pi-side `pc-access` service, gate-key volume, and `ssh-approval` plugin entirely.

## Target topology
```
[Hermes CLI, SSH-into-Pi] --OAuth2.1+PKCE over https://10.8.0.9:8123/mcp--> [PC companion app]
   - Pi holds NO private key. No ssh into Windows at all.
   - Tokens persist ~/.hermes/mcp-tokens/pc_access.json, auto-refresh.
   - Login = loopback-paste: approve in PC browser -> copy http://127.0.0.1:<port>/callback URL -> paste into SSH Hermes prompt (callback is loopback-bound, mcp_oauth.py:988).
   - Every execute/transfer tool call -> PC modal dialog (approve/deny). Dialog is the ONLY executor gate; a valid OAuth token grants submit, never execute.
```

## Tasks

### T1 (on Pi — Hermes config flip)
`~/.hermes/config.yaml`, server `pc_access` (currently line 318-324):
```yaml
  pc_access:
    enabled: true
    url: https://10.8.0.9:8123/mcp
    auth: oauth
    ssl_verify: /home/arch/docker-config/data/certs/root-home.crt
```
Remove the old `http://127.0.0.1:8123/mcp` line. Then `/reload-mcp` (or restart). First invocation triggers the loopback-paste OAuth flow.

### T2 — on Pi — decommission old service
From `docker-compose.yaml` (lines 436-458), remove the entire `pc-access:` block. Remove the `pc-gate-keys:` volumes entry (line 459-460). Then:
```
cd /home/arch/docker-config && docker stop pc-access && docker compose up -d --prune-containers --prune
docker rm -f docker-config_pc-gate-keys   # or the actual volume name
rm -rf data/pc-gate
```
Remove the `ssh-approval` plugin: `hermes plugins disable ssh-approval` (and/or delete `~/.hermes/plugins/ssh-approval/`). `/reset` Hermes to unload it.

### T3 — on PC — companion app (apply when PC is online)
Build a single-process companion (PyInstaller .exe) that:
1. Terminates a TLS listener on WG interface `10.8.0.9:8123` (cert = full chain home.crt + home.key; trust = root-home in PC store).
2. Hosts a Streamable-HTTP `/mcp` endpoint from the MCP Python SDK with 2 tools: `execute(command)` and `transfer(src,dst,direction)`.
3. Self-hosts the MCP OAuth 2.1 Authorization Server (RFC 7591 DCR + PKCE; client_id of Hermes CIMD). Metadata endpoints: `/.well-known/oauth-protected-resource-metadata`, `/.well-known/oauth-authorization-server`, `/authorize`, `/token`. Advertise `client_id_metadata_document_supported: false` (force DCR, since Hermes' CIMD loops is loopback-only and this AS is cross-host).
4. On every OAuth grant AND every tool call, raises a MODAL Windows dialog (win32 msg box / Tkinter) showing the exact command. Approve executes; AEOENY aborts with `"error: denied by user"`.
5. Append-only approval log: `%LOCALAPPDATA%/pc-companion/approvals.log` (time, command, caller, approve/deny), even on deny.
6. Autostart in interactive session via `Startup` folder (Startup script/shortcut to the .exe) — MUST the interactive session so the dialog displays.

### T4 — on Pi — transfer semantics (compat)
Ensure `transfer` tool on the new companion uses the same staging dir contract (`direction: push` = file lands in `C:\Users\mihai\...` staging; `pull` = Pi pulls). Preserve the old `src`/`dst`/`direction` single-file contract so existing callers don't need rewriting.

## Verify (acceptance)
- On PC: `.exe` starts, listener on `10.8.0.9:8123` (TLS), modal shows on a test tool call, approval log written, deny path aborts without state changes.
- On Pi: `/reload-mcp` discovers `execute`/`transfer` via `https://10.8.0.9:8123/mcp`; first call triggers OAuth paste flow; token persists; subsequent calls auto-refresh; AEOUT = `"denied by user"`.
- Old path is dead: `ssh -i ~/.ssh/id_ed25519 ...` and `mcp__pc_access__*` over the OLD url both fail. No gate-key volume, no ssh-approval plugin.

## Notes / gotchas
- The OAuth callback is hard-bound to `127.0.0.1` in Hermes client — the paste dance is REQUIRED for cross-host login. Verify `auth: oauth` works before touching the dialog.
- Windows session-0: the modal dialog REQUIRES the companion app to run in the interactive session (autologon/logon-start), NOT as an `sc create` service. Confirm with Alex if they want wiring as a tray app vs. modal.
- The PC is currently OFFLINE. T1/T2 are safe now on the Pi; T3 needs the PC up. Sequence: T1+T2 now, T3 when PC is online, then the acceptance loop.