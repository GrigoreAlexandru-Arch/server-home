export type State = 'ok' | 'warn' | 'down' | 'idle';

export interface Metric {
  /** short right-aligned value, e.g. "2 streams" */
  value: string;
}

export interface ServiceRow {
  id: string;
  name: string;
  desc: string;
  url: string;
  icon?: string;
  letter?: string;
  group: string;
  state: State;
  metrics: Metric[];
  series?: number[];
  /** tooltip / detail line */
  note?: string;
}

export interface HostStats {
  hostname: string;
  uptime: string;
  load1: string;
  memUsedGb: string;
  memTotalGb: string;
  memPct: number;
  rootUsedPct: number;
  hddUsedPct: number;
  hddUsedTb: string;
  hddTotalTb: string;
  tempC: string | null;
}

export interface Snapshot {
  host: HostStats | null;
  services: ServiceRow[];
  summary: { total: number; up: number; warn: number; down: number };
  updated: string;
  errors: string[];
}
