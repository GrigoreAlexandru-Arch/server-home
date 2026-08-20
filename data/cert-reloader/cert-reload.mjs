import Docker from "dockerode";
import fs from "node:fs";

// cert-reloader: when data/certs/home.crt is rewritten, fire `nginx -s reload`
// into reverse-proxy (nginx-proxy). nginx-proxy's own docker-gen only reloads
// on container connect/disconnect, so a cert-only (SAN) rewrite never
// propagates without this push.
//
// Mechanism: dockerode's container.exec() only CREATES the exec resource; the
// command does not run until exec.start() drives the session to completion.
// That is the entire reason bare exec() appeared to do nothing.

const CERT = "/certs/home.crt";
const TARGET = "reverse-proxy";
const POLL_MS = 1000;
const SETTLE_MS = 800;        // let openssl finish writing before reloading
const MIN_GAP_MS = 4000;      // never reload more than ~1x / 4s

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

let lastMtime = 0;
let lastReload = 0;

function mtime() {
  try {
    return fs.statSync(CERT).mtimeMs;
  } catch {
    return null; // cert not present yet -> no change signal
  }
}

async function reload() {
  const now = Date.now();
  if (now - lastReload < MIN_GAP_MS) return;
  try {
    const container = docker.getContainer(TARGET);
    const exec = await container.exec({ Cmd: ["nginx", "-s", "reload"] });
    // exec is a resource; START it so the command actually runs.
    try {
      await exec.start({ detach: true });
    } catch (startErr) {
      // start() streams; a serialization error here is benign — the exec is
      // already dispatched. Only surface true failures.
      const msg = String(startErr.message || "");
      if (!/circular|socket|stdin/i.test(msg)) {
        console.error(`[reload] start note: ${msg}`);
      }
    }
    lastReload = Date.now();
    console.log(`[reload] ${TARGET} <- cert mtime ${lastMtime} (exec ${exec.id.slice(0, 8)})`);
  } catch (err) {
    console.error(`[reload] FAILED for ${TARGET}:`, err.message);
  }
}

console.log(`[cert-reloader] watching ${CERT} every ${POLL_MS}ms; start mtime=${lastMtime}`);

// Startup-race guard (option 2): if a cert modification landed while we were
// still coming up (e.g. certs-generator regenerating home.crt during a compose
// rebuild that also restarted us), the first poll would baseline lastMtime to that
// NEW mtime and silently swallow the very rewrite we exist to propagate. So fire
// one unconditional reload after the settle delay on the first pass whenever the
// cert file exists — extra nginx -s reload at boot is harmless; a swallowed cert
// rotation is not.
let firstPass = true;

while (true) {
  const before = mtime();
  if (before !== null && lastMtime === 0) lastMtime = before; // baseline still important here
  await new Promise((r) => setTimeout(r, POLL_MS));
  const current = mtime();
  const changed = current !== null && current > lastMtime + 5;
  if (firstPass && current !== null) {
    // Guaranteed startup reload after clearing the initial baseline, so a rewrite
    // that happened before/at boot is never missed. Skip only if the cert vanished.
    firstPass = false;
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    console.log('[cert-reloader] startup: forcing initial reload');
    await reload();
    await new Promise((r) => setTimeout(r, POLL_MS));
    continue; // let the normal change-detection path re-establish the new mtime baseline
  }
  if (changed) {
    lastMtime = current;
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    await reload();
  }
}