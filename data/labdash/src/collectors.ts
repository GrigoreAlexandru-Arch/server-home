import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { HostStats, ServiceRow, State } from './types.js';

const T = Number(process.env.PROBE_TIMEOUT_MS ?? 4500);

const env = {
  user: process.env.USER_ACCOUNT ?? '',
  pass: process.env.PASSWORD ?? '',
  syncthing: process.env.SYNCTHING_APIKEY ?? '',
  jellyfin: process.env.JELLYFIN_TOKEN ?? '',
  duplicati: process.env.DUPLICATI_PASSWORD ?? '',
  vm: process.env.VM_URL ?? 'http://victoria-metrics:8428',
  wgClients: process.env.WGUI_CLIENTS_DIR ?? '/wg/clients',
};

/* ------------------------------------------------------------------ utils */

export async function getJSON<T>(url: string, init: RequestInit = {}, ms = T): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function reachable(url: string, ms = T): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'manual' });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const basic = () => 'Basic ' + Buffer.from(`${env.user}:${env.pass}`).toString('base64');

/* ------------------------------------------------------- docker (socket) */

interface DockerContainer {
  Names: string[];
  State: string;
  Status: string;
  Labels: Record<string, string>;
}

function dockerGet<T>(p: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: '/var/run/docker.sock', path: p, method: 'GET', timeout: T },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 300) return reject(new Error(`docker ${res.statusCode}`));
          try {
            resolve(JSON.parse(body) as T);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('docker timeout')));
    req.on('error', reject);
    req.end();
  });
}

export async function dockerSummary() {
  const list = await dockerGet<DockerContainer[]>('/containers/json?all=1');
  const running = list.filter((c) => c.State === 'running');
  const unhealthy = running.filter((c) => /\(unhealthy\)/.test(c.Status));
  const paused = list.filter((c) => c.State === 'paused');
  return { total: list.length, running: running.length, unhealthy: unhealthy.length, paused: paused.length };
}

/* -------------------------------------------------------------- victoria */

type VmResult = { status: string; data: { result: { metric: Record<string, string>; value: [number, string] }[] } };

async function vmQuery(q: string): Promise<number | null> {
  try {
    const r = await getJSON<VmResult>(`${env.vm}/api/v1/query?query=${encodeURIComponent(q)}`, {}, 3500);
    const v = r.data.result[0]?.value[1];
    return v === undefined ? null : Number(v);
  } catch {
    return null;
  }
}

const gb = (b: number | null) => (b === null ? '—' : (b / 1024 ** 3).toFixed(1));
const tb = (b: number | null) => (b === null ? '—' : (b / 1024 ** 4).toFixed(2));

function humanUptime(sec: number | null): string {
  if (sec === null) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${String(h).padStart(2, '0')}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

export async function hostStats(): Promise<HostStats | null> {
  const [uptime, load, memTotal, memAvail, rootAvail, rootSize, hddAvail, hddSize, temp] = await Promise.all([
    vmQuery('node_time_seconds - node_boot_time_seconds'),
    vmQuery('node_load1'),
    vmQuery('node_memory_MemTotal_bytes'),
    vmQuery('node_memory_MemAvailable_bytes'),
    vmQuery('node_filesystem_avail_bytes{mountpoint="/"}'),
    vmQuery('node_filesystem_size_bytes{mountpoint="/"}'),
    vmQuery('node_filesystem_avail_bytes{mountpoint="/home/arch/docker-config/external_hdd"}'),
    vmQuery('node_filesystem_size_bytes{mountpoint="/home/arch/docker-config/external_hdd"}'),
    vmQuery('max(node_hwmon_temp_celsius)'),
  ]);
  if (memTotal === null && uptime === null) return null;
  const used = memTotal !== null && memAvail !== null ? memTotal - memAvail : null;
  const rootPct = rootAvail !== null && rootSize !== null && rootSize > 0 ? (1 - rootAvail / rootSize) * 100 : 0;
  const hddPct = hddAvail !== null && hddSize !== null && hddSize > 0 ? (1 - hddAvail / hddSize) * 100 : 0;
  return {
    hostname: 'server.home',
    uptime: humanUptime(uptime),
    load1: load === null ? '—' : load.toFixed(2),
    memUsedGb: gb(used),
    memTotalGb: gb(memTotal),
    memPct: used !== null && memTotal ? (used / memTotal) * 100 : 0,
    rootUsedPct: rootPct,
    hddUsedPct: hddPct,
    hddUsedTb: tb(hddSize !== null && hddAvail !== null ? hddSize - hddAvail : null),
    hddTotalTb: tb(hddSize),
    tempC: temp === null ? null : temp.toFixed(0),
  };
}

/* -------------------------------------------------------------- jellyfin */

interface JfSession {
  NowPlayingItem?: { Name?: string; Type?: string };
  UserName?: string;
  PlayState?: { IsPaused?: boolean };
}

interface JfCounts { MovieCount: number; SeriesCount: number; EpisodeCount: number }

export async function jellyfin(): Promise<Partial<ServiceRow>> {
  const h = { 'X-Emby-Token': env.jellyfin };
  const [sessions, counts] = await Promise.all([
    getJSON<JfSession[]>('http://jellyfin:8096/Sessions?activeWithinSeconds=180', { headers: h }),
    getJSON<JfCounts>('http://jellyfin:8096/Items/Counts', { headers: h }),
  ]);
  const playing = sessions.filter((s) => s.NowPlayingItem);
  const first = playing[0]?.NowPlayingItem?.Name;
  const detail = playing.length
    ? `${playing.length} playing${first ? ' · ' + (first.length > 22 ? first.slice(0, 21) + '…' : first) : ''}`
    : `${counts.MovieCount} movies · ${counts.SeriesCount} shows`;
  return {
    state: 'ok',
    metrics: [{ value: playing.length ? `${playing.length} stream${playing.length > 1 ? 's' : ''}` : 'idle' }],
    series: [playing.length],
    note: detail,
  };
}

/* ---------------------------------------------------------- transmission */

interface TrResponse { result: string; arguments: Record<string, unknown> }

async function transmission(method: string, args: Record<string, unknown> = {}) {
  const auth = basic();
  const url = 'http://transmission:9091/transmission/rpc';
  const body = JSON.stringify({ method, arguments: args });
  const first = await fetch(url, { method: 'POST', headers: { Authorization: auth }, body });
  let sid = first.headers.get('x-transmission-session-id') ?? '';
  if (!sid) {
    if (!first.ok) throw new Error(`transmission ${first.status}`);
    return (await first.json()) as TrResponse;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: auth, 'X-Transmission-Session-Id': sid, 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) throw new Error(`transmission ${res.status}`);
  return (await res.json()) as TrResponse;
}

const rate = (bps: number) => {
  if (!bps) return '0';
  const units = ['B/s', 'kB/s', 'MB/s'];
  let v = bps;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
};

export async function transmissionStats(): Promise<Partial<ServiceRow>> {
  const r = await transmission('session-stats');
  const a = r.arguments as {
    downloadSpeed: number;
    uploadSpeed: number;
    activeTorrentCount: number;
    pausedTorrentCount: number;
    torrentCount: number;
  };
  return {
    state: 'ok',
    metrics: [{ value: `${a.activeTorrentCount} active` }],
    series: [a.downloadSpeed],
    note: `↓ ${rate(a.downloadSpeed)} · ↑ ${rate(a.uploadSpeed)} · ${a.pausedTorrentCount} paused`,
  };
}

/* ------------------------------------------------------------- syncthing */

interface StConnections { connections: Record<string, { connected: boolean }> }
interface StFolder { state: string; needBytes: number; needTotalItems: number; globalBytes: number }

export async function syncthing(): Promise<Partial<ServiceRow>> {
  const h = { 'X-API-Key': env.syncthing };
  const [conns, folder] = await Promise.all([
    getJSON<StConnections>('http://syncthing:8384/rest/system/connections', { headers: h }),
    getJSON<StFolder>('http://syncthing:8384/rest/db/status?folder=obsidian', { headers: h }),
  ]);
  const peers = Object.values(conns.connections).filter((c) => c.connected).length;
  const total = Object.keys(conns.connections).length;
  const synced = folder.state === 'idle' && folder.needBytes === 0;
  return {
    state: synced ? 'ok' : 'warn',
    metrics: [{ value: synced ? `${peers} peer${peers === 1 ? '' : 's'}` : 'syncing' }],
    series: [folder.needBytes],
    note: synced
      ? `${peers}/${total} devices · obsidian up to date`
      : `${folder.needTotalItems} items pending · ${peers}/${total} devices`,
  };
}

/* ---------------------------------------------------------------- pihole */

interface PiholeAuth { session?: { sid?: string; valid?: boolean } }
interface PiholeSummary {
  queries: { total: number; blocked: number; percent_blocked: number; unique_domains: number };
}

/**
 * Pi-hole v6 rate-limits /api/auth (429 after a handful of logins), so the session
 * id is cached for its 30-minute lifetime and only re-fetched on expiry or 401.
 */
let piholeCache: { sid: string; expires: number } | null = null;
let piholeBlockedUntil = 0;

async function piholeSid(force = false): Promise<string> {
  if (!force && piholeCache && Date.now() < piholeCache.expires) return piholeCache.sid;
  if (Date.now() < piholeBlockedUntil) throw new Error('rate limited, backing off');
  try {
    const r = await getJSON<PiholeAuth>('http://pihole:80/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: env.pass }),
    });
    const sid = r.session?.sid;
    if (!sid) throw new Error('pihole auth failed');
    piholeCache = { sid, expires: Date.now() + 25 * 60 * 1000 };
    return sid;
  } catch (err) {
    // FTL bans the client after repeated logins; stop hammering it.
    piholeBlockedUntil = Date.now() + 5 * 60 * 1000;
    throw err;
  }
}

export async function pihole(): Promise<Partial<ServiceRow>> {
  let sid = await piholeSid();
  let s: PiholeSummary;
  try {
    s = await getJSON<PiholeSummary>('http://pihole:80/api/stats/summary', { headers: { 'X-FTL-SID': sid } });
  } catch (err) {
    if (!(err instanceof Error) || !/^401/.test(err.message)) throw err;
    piholeCache = null;
    sid = await piholeSid(true);
    s = await getJSON<PiholeSummary>('http://pihole:80/api/stats/summary', { headers: { 'X-FTL-SID': sid } });
  }
  const pct = s.queries.percent_blocked;
  return {
    state: 'ok',
    metrics: [{ value: `${pct.toFixed(1)}% blocked` }],
    series: [pct],
    note: `${s.queries.total.toLocaleString('en-US')} queries · ${s.queries.blocked.toLocaleString('en-US')} blocked · ${s.queries.unique_domains} domains`,
  };
}

/* ------------------------------------------------------------- duplicati */

/**
 * Duplicati enforces a Host allowlist (webservice-allowed-hostnames) and undici's
 * fetch silently drops a caller-supplied Host header, so these calls go over
 * node:http where the header can actually be set.
 */
function dupRequest<T>(method: 'GET' | 'POST', p: string, body?: unknown, token?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string | number> = { Host: 'duplicati.home' };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = http.request({ host: 'duplicati', port: 8200, path: p, method, headers, timeout: T }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (!res.statusCode || res.statusCode >= 300) return reject(new Error(`duplicati ${res.statusCode}`));
        try {
          resolve(JSON.parse(data) as T);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('duplicati timeout')));
    req.on('error', reject);
    req.end(payload);
  });
}

interface DupLogin { AccessToken?: string }
interface DupBackup { Backup?: { Metadata?: { LastBackupDate?: string; LastBackupDuration?: string; LastErrorDate?: string } } }

/** Duplicati emits timestamps as 20261023T134619Z, not ISO-8601. */
function parseDupDate(s?: string): number | null {
  if (!s) return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(s.trim());
  if (m) {
    const [, y, mo, d, h, mi, se] = m;
    return Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

function ageLabel(ms: number | null): string {
  if (ms === null) return 'never';
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export async function duplicati(): Promise<Partial<ServiceRow>> {
  const login = await dupRequest<DupLogin>('POST', '/api/v1/auth/login', { Password: env.duplicati });
  if (!login.AccessToken) throw new Error('duplicati auth failed');
  const job = await dupRequest<DupBackup>('GET', '/api/v1/backup/1', undefined, login.AccessToken);
  const meta = job.Backup?.Metadata;
  const last = parseDupDate(meta?.LastBackupDate);
  const lastErr = parseDupDate(meta?.LastErrorDate);
  const failed = lastErr !== null && (last === null || lastErr > last);
  const ageMin = last === null ? Infinity : (Date.now() - last) / 60000;
  return {
    state: failed ? 'warn' : ageMin > 36 * 60 ? 'warn' : 'ok',
    metrics: [{ value: ageLabel(last) }],
    series: [Number.isFinite(ageMin) ? Math.min(ageMin, 2880) : 2880],
    note: failed
      ? 'last run reported an error'
      : `daily · ${(meta?.LastBackupDuration ?? '').split('.')[0] || '—'} last run`,
  };
}

/* -------------------------------------------------------------- portainer */

interface PtLogin { jwt?: string }
interface PtEndpoint { Id: number; Name: string }
interface PtContainer { State: string }

export async function portainer(): Promise<Partial<ServiceRow>> {
  const auth = await getJSON<PtLogin>('http://portainer:9000/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: env.user, Password: env.pass }),
  });
  if (!auth.jwt) throw new Error('portainer auth failed');
  const eps = await getJSON<PtEndpoint[]>('http://portainer:9000/api/endpoints', {
    headers: { Authorization: `Bearer ${auth.jwt}` },
  });
  const ep = eps[0];
  if (!ep) throw new Error('no portainer endpoint');
  const containers = await getJSON<PtContainer[]>(
    `http://portainer:9000/api/endpoints/${ep.Id}/docker/containers/json`,
    { headers: { Authorization: `Bearer ${auth.jwt}` } },
  );
  return {
    state: 'ok',
    metrics: [{ value: `${containers.length} up` }],
    series: [containers.length],
    note: `endpoint ${ep.Name} · portainer api`,
  };
}

/* ---------------------------------------------------------------- others */

export async function grafana(): Promise<Partial<ServiceRow>> {
  const h = await getJSON<{ database: string; version: string }>('http://grafana:3000/api/health');
  return {
    state: h.database === 'ok' ? 'ok' : 'warn',
    metrics: [{ value: `v${h.version}` }],
    series: [1],
    note: `database ${h.database} · single observability pane`,
  };
}

export async function vaultwarden(): Promise<Partial<ServiceRow>> {
  const alive = await reachable('http://vaultwarden:80/alive');
  return {
    state: alive ? 'ok' : 'down',
    metrics: [{ value: alive ? 'alive' : 'down' }],
    series: [alive ? 1 : 0],
    note: alive ? 'vault reachable · sync healthy' : 'vault endpoint unreachable',
  };
}

export async function filebrowser(): Promise<Partial<ServiceRow>> {
  const ok = await reachable('http://filebrowser:80/');
  return {
    state: ok ? 'ok' : 'down',
    metrics: [{ value: ok ? 'serving' : 'down' }],
    series: [ok ? 1 : 0],
    note: ok ? 'web file browser up' : 'web root unreachable',
  };
}

export async function wireguard(): Promise<Partial<ServiceRow>> {
  try {
    const files = await fs.readdir(env.wgClients);
    let enabled = 0;
    let readable = 0;
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(env.wgClients, f), 'utf8');
        const j = JSON.parse(raw) as { enabled?: boolean };
        readable++;
        if (j.enabled !== false) enabled++;
      } catch {
        // a client file the container cannot read is skipped, not fatal
      }
    }
    if (!readable) throw new Error('no readable client files');
    return {
      state: 'ok',
      metrics: [{ value: `${enabled} peers` }],
      series: [enabled],
      note: `${enabled} configured peers · wg0`,
    };
  } catch {
    const ok = await reachable('http://wgui:5000/');
    return { state: ok ? 'ok' : 'down', metrics: [{ value: ok ? 'up' : 'down' }], note: 'peer store unreadable' };
  }
}

export async function hermes(): Promise<Partial<ServiceRow>> {
  const ok = await reachable('http://hermes-proxy:80/');
  return {
    state: ok ? 'ok' : 'warn',
    metrics: [{ value: ok ? 'running' : 'down' }],
    series: [ok ? 1 : 0],
    note: ok ? 'agent dashboard behind proxy' : 'proxy unreachable',
  };
}

/* --------------------------------------------------------------- helpers */

export const stateFromDocker = (name: string, summary: { running: number }): State => (summary.running > 0 ? 'ok' : 'down');
