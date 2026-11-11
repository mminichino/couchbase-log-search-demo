"use client";

import Link from "next/link";
import type { SearchHit } from "@/lib/search-request";
import { isSortableField } from "@/lib/fields";
import { HighlightedText } from "./HighlightedText";

type Props = {
  hits: SearchHit[];
  columns: string[];
  sort: string;
  selectedId: string | null;
  onSelect: (hit: SearchHit) => void;
  onSort: (sort: string) => void;
  canLoadMore: boolean;
  onLoadMore: () => void;
  loadingMore?: boolean;
};

export function DocTable({
  hits,
  columns,
  sort,
  selectedId,
  onSelect,
  onSort,
  canLoadMore,
  onLoadMore,
  loadingMore,
}: Props) {
  const sortField = sort.startsWith("-") ? sort.slice(1) : sort;
  const sortDesc = sort.startsWith("-");

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-[1] bg-[color:var(--panel-bg)] text-[11px] uppercase tracking-wide text-ink-500">
            <tr className="border-b border-ink-200">
              {columns.map((col) => {
                const sortable = isSortableField(col);
                const active = sortField === col;
                return (
                  <th key={col} className="px-2 py-2 font-medium">
                    {sortable ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-ink-800"
                        onClick={() => {
                          if (active && sortDesc) onSort(col);
                          else onSort(`-${col}`);
                        }}
                      >
                        {col}
                        <span className="font-mono text-[10px] text-ink-400">
                          {active ? (sortDesc ? "↓" : "↑") : "↕"}
                        </span>
                      </button>
                    ) : (
                      col
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {hits.map((hit) => (
              <tr
                key={hit.id}
                onClick={() => onSelect(hit)}
                className={`cursor-pointer border-b border-ink-100/80 ${
                  selectedId === hit.id
                    ? "bg-accent-soft/70"
                    : "hover:bg-ink-50/80"
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col}
                    className={`px-2 py-1.5 ${
                      col === "message"
                        ? "max-w-[48rem] truncate text-ink-900"
                        : "whitespace-nowrap font-mono text-[12px] text-ink-700"
                    }`}
                  >
                    <CellValue hit={hit} field={col} />
                  </td>
                ))}
              </tr>
            ))}
            {!hits.length ? (
              <tr>
                <td
                  colSpan={Math.max(columns.length, 1)}
                  className="px-2 py-8 text-center text-sm text-ink-500"
                >
                  No matching documents in this time range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {canLoadMore ? (
        <div className="border-t border-ink-100 px-2 py-3">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-800 hover:bg-ink-50 disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CellValue({ hit, field }: { hit: SearchHit; field: string }) {
  const f = hit.fields;
  if (field === "message") {
    const messageHtml =
      hit.highlight?.message?.[0] ?? String(f.message ?? "");
    const hasMark = /<mark>/i.test(messageHtml);
    return (
      <>
        {hasMark ? <HighlightedText html={messageHtml} /> : messageHtml}
        {f.trace_id ? (
          <Link
            href={`/trace/${encodeURIComponent(String(f.trace_id))}`}
            className="ml-2 text-[11px] text-accent hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            trace
          </Link>
        ) : null}
      </>
    );
  }
  if (field === "level") {
    return <LevelBadge level={String(f.level ?? "")} />;
  }
  if (field === "ts") {
    return (
      <span className="text-ink-600">{formatTs(String(f.ts ?? ""))}</span>
    );
  }
  const v = f[field];
  if (v === undefined || v === null || v === "") return "—";
  return <>{String(v)}</>;
}

function LevelBadge({ level }: { level: string }) {
  const tone =
    level === "ERROR" || level === "FATAL"
      ? "bg-red-100 text-danger"
      : level === "WARN"
        ? "bg-amber-100 text-warn"
        : level === "INFO"
          ? "bg-sky-100 text-sky-800"
          : "bg-ink-100 text-ink-700";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${tone}`}
    >
      {level || "—"}
    </span>
  );
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}
