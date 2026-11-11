"use client";

import { useMemo, useState } from "react";
import type { Facets } from "@/lib/search-request";
import { AVAILABLE_FIELDS } from "@/lib/fields";

type Props = {
  facets: Facets;
  columns: string[];
  availableFields?: string[];
  activeFilters: string[];
  onAddColumn: (field: string) => void;
  onRemoveColumn: (field: string) => void;
  onFilterFor: (field: string, value: string) => void;
  onFilterOut: (field: string, value: string) => void;
};

export function FieldSidebar({
  facets,
  columns,
  availableFields = [...AVAILABLE_FIELDS],
  activeFilters,
  onAddColumn,
  onRemoveColumn,
  onFilterFor,
  onFilterOut,
}: Props) {
  const [q, setQ] = useState("");
  const selected = columns;
  const available = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return availableFields.filter((f) => {
      if (selected.includes(f)) return false;
      if (!needle) return true;
      return f.toLowerCase().includes(needle);
    });
  }, [availableFields, q, selected]);

  const selectedFiltered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return selected;
    return selected.filter((f) => f.toLowerCase().includes(needle));
  }, [q, selected]);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-auto border-r border-ink-200/80 bg-white/40 pr-2">
      <div className="sticky top-0 z-10 space-y-2 bg-[color:var(--panel-bg)] pb-2 pt-1">
        <h2 className="font-display text-sm font-semibold text-ink-900">
          Fields
        </h2>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search field names"
          className="w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-xs text-ink-800"
        />
      </div>

      <section className="mb-4">
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-600">
          Selected fields ({selected.length})
        </h3>
        <ul className="space-y-0.5">
          {selectedFiltered.map((field) => (
            <li
              key={field}
              className="group flex items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-ink-50"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-ink-800">
                {field}
              </span>
              <button
                type="button"
                className="rounded px-1 text-ink-500 hover:bg-ink-100"
                title="Remove from table"
                onClick={() => onRemoveColumn(field)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-4">
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-600">
          Available fields ({available.length})
        </h3>
        <ul className="space-y-0.5">
          {available.map((field) => (
            <li
              key={field}
              className="group flex items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-ink-50"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-ink-800">
                {field}
              </span>
              <button
                type="button"
                className="rounded px-1 text-ink-500 hover:bg-ink-100"
                title="Add to table"
                onClick={() => onAddColumn(field)}
              >
                +
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-4 border-t border-ink-100 pt-3 pb-4">
        <p className="text-[11px] text-ink-500">Top terms · click to filter</p>
        {AVAILABLE_FIELDS.filter((f) => (facets[f] ?? []).length > 0).map(
          (field) => {
            const buckets = facets[field] ?? [];
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
          },
        )}
      </div>
    </aside>
  );
}
