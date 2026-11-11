/** Schema fields for the default events data view / Search index. */

export const DEFAULT_DATA_VIEW_ID = "logs-app-events";

export const DEFAULT_COLUMNS = ["ts", "level", "service", "message"] as const;

export const AVAILABLE_FIELDS = [
  "ts",
  "level",
  "service",
  "message",
  "region",
  "host",
  "version",
  "scenario",
  "exception_class",
  "http_path",
  "http_status",
  "duration_ms",
  "client_ip",
  "trace_id",
  "user_id",
  "http_method",
  "env",
  "logger",
] as const;

export type AvailableField = (typeof AVAILABLE_FIELDS)[number];

/** Fields that Couchbase Search can sort on for events_fts. */
export const SORTABLE_FIELDS = [
  "ts",
  "level",
  "service",
  "region",
  "host",
  "version",
  "scenario",
  "exception_class",
  "http_path",
  "http_status",
  "duration_ms",
  "client_ip",
  "trace_id",
] as const;

export type SortableField = (typeof SORTABLE_FIELDS)[number];

export const DEFAULT_SORT = "-ts";

export function isSortableField(field: string): field is SortableField {
  return (SORTABLE_FIELDS as readonly string[]).includes(field);
}

export function parseSort(raw: string | null | undefined): string {
  const value = (raw ?? DEFAULT_SORT).trim() || DEFAULT_SORT;
  const desc = value.startsWith("-");
  const field = desc ? value.slice(1) : value;
  if (!isSortableField(field)) {
    throw new Error(`Sort field not allowed: ${field}`);
  }
  return desc ? `-${field}` : field;
}

export function parseColumns(
  raw: string | string[] | null | undefined,
): string[] {
  const parts = Array.isArray(raw)
    ? raw.flatMap((s) => s.split(","))
    : (raw ?? "").split(",");
  const cols = parts.map((c) => c.trim()).filter(Boolean);
  if (!cols.length) return [...DEFAULT_COLUMNS];
  const allowed = new Set<string>(AVAILABLE_FIELDS);
  const out: string[] = [];
  for (const c of cols) {
    if (!allowed.has(c)) continue;
    if (!out.includes(c)) out.push(c);
  }
  return out.length ? out : [...DEFAULT_COLUMNS];
}
