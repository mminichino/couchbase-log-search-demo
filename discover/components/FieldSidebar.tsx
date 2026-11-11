"use client";

import type { Facets } from "@/lib/search-request";

type Props = {
  facets: Facets;
  activeFilters: string[];
  onFilterFor: (field: string, value: string) => void;
  onFilterOut: (field: string, value: string) => void;
};

const FIELD_ORDER = [
  "service",
  "level",
  "region",
  "host",
  "version",
  "scenario",
  "exception_class",
  "http_path",
  "client_ip",
  "http_status",
];

export function FieldSidebar({
  facets,
  activeFilters,
  onFilterFor,
  onFilterOut,
}: Props) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-auto border-r border-ink-200/80 bg-white/40 pr-2">
      <div className="sticky top-0 z-10 bg-[color:var(--panel-bg)] pb-2 pt-1">
        <h2 className="font-display text-sm font-semibold text-ink-900">
          Fields
        </h2>
        <p className="text-[11px] text-ink-500">Top terms · click to filter</p>
      </div>
      <div className="space-y-4 pb-4">
        {FIELD_ORDER.map((field) => {
          const buckets = facets[field] ?? [];
          if (!buckets.length) return null;
          return (
            <section key={field}>
              <h3 className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                {field}
              </h3>
              <ul className="space-y-0.5">
                {buckets.map((b) => {
                  const token = `${field}:${b.key}`;
                  const active =
                    activeFilters.includes(token) ||
                    activeFilters.includes(`-${token}`);
                  return (
                    <li
                      key={b.key}
                      className={`group flex items-center gap-1 rounded px-1 py-0.5 text-xs ${
                        active ? "bg-accent-soft" : "hover:bg-ink-50"
                      }`}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-ink-800"
                        title={b.key}
                        onClick={() => onFilterFor(field, b.key)}
                      >
                        {b.key || "(empty)"}
                      </button>
                      <span className="tabular-nums text-ink-400">
                        {b.count.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        className="hidden rounded px-1 text-ink-500 group-hover:inline hover:bg-ink-100"
                        title="Filter for"
                        onClick={() => onFilterFor(field, b.key)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="hidden rounded px-1 text-ink-500 group-hover:inline hover:bg-ink-100"
                        title="Filter out"
                        onClick={() => onFilterOut(field, b.key)}
                      >
                        −
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
