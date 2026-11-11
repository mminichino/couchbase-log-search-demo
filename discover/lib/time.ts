export type RelativeWindow =
  | "15m"
  | "1h"
  | "4h"
  | "24h"
  | "48h"
  | "7d";

export const RELATIVE_WINDOWS: { id: RelativeWindow; label: string; ms: number }[] =
  [
    { id: "15m", label: "Last 15 minutes", ms: 15 * 60_000 },
    { id: "1h", label: "Last 1 hour", ms: 60 * 60_000 },
    { id: "4h", label: "Last 4 hours", ms: 4 * 60 * 60_000 },
    { id: "24h", label: "Last 24 hours", ms: 24 * 60 * 60_000 },
    { id: "48h", label: "Last 48 hours", ms: 48 * 60 * 60_000 },
    { id: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60_000 },
  ];

const RELATIVE_MS: Record<string, number> = Object.fromEntries(
  RELATIVE_WINDOWS.map((w) => [w.id, w.ms]),
);

const INTERVAL_LADDER_MS = [
  1_000,
  5_000,
  10_000,
  30_000,
  60_000,
  5 * 60_000,
  10 * 60_000,
  30 * 60_000,
  60 * 60_000,
  3 * 60 * 60_000,
  12 * 60 * 60_000,
  24 * 60 * 60_000,
] as const;

export function parseTimeInput(
  value: string | null | undefined,
  fallback: Date,
): Date {
  if (!value || value === "now") return fallback;
  if (value.startsWith("now-")) {
    const rel = value.slice(4);
    const ms = RELATIVE_MS[rel];
    if (ms != null) return new Date(fallback.getTime() - ms);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

export function resolveRange(
  fromParam: string | null | undefined,
  toParam: string | null | undefined,
  now = new Date(),
): { from: Date; to: Date; relative: RelativeWindow | null } {
  const to = parseTimeInput(toParam ?? "now", now);
  let from: Date;
  let relative: RelativeWindow | null = null;

  if (!fromParam || fromParam === "now-15m") {
    from = new Date(to.getTime() - RELATIVE_MS["15m"]);
    relative = "15m";
  } else if (fromParam.startsWith("now-") && RELATIVE_MS[fromParam.slice(4)]) {
    const id = fromParam.slice(4) as RelativeWindow;
    from = new Date(to.getTime() - RELATIVE_MS[id]);
    relative = id;
  } else {
    from = parseTimeInput(fromParam, new Date(to.getTime() - RELATIVE_MS["15m"]));
  }

  if (from.getTime() > to.getTime()) {
    return { from: to, to: from, relative: null };
  }
  return { from, to, relative };
}

export function chooseHistogramIntervalMs(from: Date, to: Date): number {
  const span = Math.max(1, to.getTime() - from.getTime());
  for (const step of INTERVAL_LADDER_MS) {
    if (span / step <= 60) return step;
  }
  return INTERVAL_LADDER_MS[INTERVAL_LADDER_MS.length - 1];
}

export function buildHistogramBuckets(
  from: Date,
  to: Date,
): { name: string; start: Date; end: Date; intervalMs: number }[] {
  const intervalMs = chooseHistogramIntervalMs(from, to);
  const startMs = Math.floor(from.getTime() / intervalMs) * intervalMs;
  const endMs = to.getTime();
  const buckets: { name: string; start: Date; end: Date; intervalMs: number }[] =
    [];

  for (let t = startMs; t < endMs && buckets.length < 60; t += intervalMs) {
    const start = new Date(t);
    const end = new Date(Math.min(t + intervalMs, endMs));
    buckets.push({
      name: start.toISOString(),
      start,
      end,
      intervalMs,
    });
  }
  return buckets;
}

export function formatIntervalLabel(ms: number): string {
  if (ms < 60_000) return `${ms / 1000}s`;
  if (ms < 3_600_000) return `${ms / 60_000}m`;
  if (ms < 86_400_000) return `${ms / 3_600_000}h`;
  return `${ms / 86_400_000}d`;
}

export function toIso(d: Date): string {
  return d.toISOString();
}
