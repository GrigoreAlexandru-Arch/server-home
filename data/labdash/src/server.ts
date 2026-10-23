import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServiceRow, Snapshot, State } from './types.js';
import * as C from './collectors.js';

const PORT = Number(process.env.PORT ?? 8080);
const POLL_MS = Number(process.env.POLL_MS ?? 10000);
const SERIES_LEN = 24;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

type Collector = () => Promise<Partial<ServiceRow>>;

interface Def {
  id: string;
  name: string;
  desc: string;
  url: string;
  icon?: string;
  letter?: string;
  group: string;
}

const DEFS: (Def & { collect: Collector })[] = [
  { id: 'jellyfin', name: 'Jellyfin', desc: 'media server', url: 'https://jellyfin.home', icon: 'jellyfin.svg', group: 'Media & files', collect: C.jellyfin },
  { id: 'transmission', name: 'Transmission', desc: 'torrent client', url: 'https://transmission.home', icon: 'transmission.svg', group: 'Media & files', collect: C.transmissionStats },
  { id: 'filebrowser', name: 'FileBrowser', desc: 'file transfer', url: 'https://files.home', icon: 'filebrowser.svg', group: 'Media & files', collect: C.filebrowser },
  { id: 'syncthing', name: 'Syncthing', desc: 'file sync', url: 'https://syncthing.home', icon: 'syncthing.svg', group: 'Media & files', collect: C.syncthing },
  { id: 'vaultwarden', name: 'Vaultwarden', desc: 'password manager', url: 'https://vaultwarden.home', icon: 'vaultwarden.svg', group: 'Security & network', collect: C.vaultwarden },
  { id: 'pihole', name: 'Pi-hole', desc: 'ad blocker · DNS', url: 'https://pihole.home/admin', icon: 'pihole.svg', group: 'Security & network', collect: C.pihole },
  { id: 'wgui', name: 'WireGuard UI', desc: 'VPN management', url: 'https://wgui.home', icon: 'wireguard.svg', group: 'Security & network', collect: C.wireguard },
  { id: 'portainer', name: 'Portainer', desc: 'container management', url: 'https://portainer.home', icon: 'portainer.svg', group: 'Admin & tools', collect: C.portainer },
  { id: 'duplicati', name: 'Duplicati', desc: 'backups', url: 'https://duplicati.home', icon: 'duplicati.svg', group: 'Admin & tools', collect: C.duplicati },
  { id: 'grafana', name: 'Grafana', desc: 'logs · traces · metrics', url: 'https://grafana.home', letter: 'G', group: 'Admin & tools', collect: C.grafana },
  { id: 'hermes', name: 'Hermes', desc: 'agent dashboard', url: 'https://hermes.home', icon: 'hermes.svg', group: 'Admin & tools', collect: C.hermes },
  { id: 'docker', name: 'Docker', desc: 'container runtime', url: 'https://portainer.home', letter: 'D', group: 'Admin & tools', collect: async () => {
      const d = await C.dockerSummary();
      return {
        state: (d.unhealthy > 0 ? 'warn' : d.running > 0 ? 'ok' : 'down') as State,
        metrics: [{ value: `${d.running}/${d.total}` }],
        series: [d.running],
        note: `${d.running} running · ${d.total} defined${d.unhealthy ? ` · ${d.unhealthy} unhealthy` : ''}`,
      };
    } },
];

const series = new Map<string, number[]>();
const lastGood = new Map<string, Partial<ServiceRow>>();

function pushSeries(id: string, value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return;
  const arr = series.get(id) ?? [];
  arr.push(value);
  if (arr.length > SERIES_LEN) arr.shift();
  series.set(id, arr);
}

async function collectOne(def: Def & { collect: Collector }): Promise<{ row: ServiceRow; error?: string }> {
  const base: ServiceRow = {
    id: def.id,
    name: def.name,
    desc: def.desc,
    url: def.url,
    icon: def.icon,
    letter: def.letter,
    group: def.group,
    state: 'down',
    metrics: [{ value: '—' }],
  };
  try {
    const r = await def.collect();
    pushSeries(def.id, r.series?.[0]);
    lastGood.set(def.id, r);
    return {
      row: {
        ...base,
        ...r,
        state: (r.state ?? 'ok') as State,
        metrics: r.metrics ?? [{ value: '—' }],
        series: series.get(def.id) ?? [],
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stale = lastGood.get(def.id);
    return {
      row: {
        ...base,
        state: 'down',
        metrics: [{ value: 'unreachable' }],
        series: series.get(def.id) ?? [],
        note: msg.slice(0, 90),
        ...(stale ? {} : {}),
      },
      error: `${def.id}: ${msg}`,
    };
  }
}

let snapshot: Snapshot = { host: null, services: [], summary: { total: 0, up: 0, warn: 0, down: 0 }, updated: new Date().toISOString(), errors: [] };

async function poll() {
  const errors: string[] = [];
  const results = await Promise.all(DEFS.map((d) => collectOne(d)));
  const services = results.map((r) => r.row);
  for (const r of results) if (r.error) errors.push(r.error);
  const host = await C.hostStats().catch(() => null);
  snapshot = {
    host,
    services,
    summary: {
      total: services.length,
      up: services.filter((s) => s.state === 'ok').length,
      warn: services.filter((s) => s.state === 'warn').length,
      down: services.filter((s) => s.state === 'down').length,
    },
    updated: new Date().toISOString(),
    errors,
  };
  if (errors.length) console.warn('[poll]', errors.join(' | '));
}

/* ------------------------------------------------------------------ http */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/api/state') {
    const body = JSON.stringify(snapshot);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, services: snapshot.services.length }));
    return;
  }

  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const data = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  }
});

await poll();
setInterval(() => {
  void poll();
}, POLL_MS);

server.listen(PORT, () => {
  console.log(`labdash listening on :${PORT}, polling every ${POLL_MS}ms`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}

void fs; // keep import for future use
