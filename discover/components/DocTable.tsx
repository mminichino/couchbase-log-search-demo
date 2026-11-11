"use client";

import Link from "next/link";
import type { SearchHit } from "@/lib/search-request";
import { HighlightedText } from "./HighlightedText";

type Props = {
  hits: SearchHit[];
  selectedId: string | null;
  onSelect: (hit: SearchHit) => void;
  canLoadMore: boolean;
  onLoadMore: () => void;
  loadingMore?: boolean;
};

export function DocTable({
  hits,
  selectedId,
  onSelect,
  canLoadMore,
  onLoadMore,
  loadingMore,
}: Props) {
  return (
    <div className="min-w-0">
      <div className="overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-[1] bg-[color:var(--panel-bg)] text-[11px] uppercase tracking-wide text-ink-500">
            <tr className="border-b border-ink-200">
              <th className="px-2 py-2 font-medium">Time</th>
              <th className="px-2 py-2 font-medium">Level</th>
              <th className="px-2 py-2 font-medium">Service</th>
              <th className="px-2 py-2 font-medium">Message</th>
            </tr>
          </thead>
          <tbody>
            {hits.map((hit) => {
              const f = hit.fields;
              const level = String(f.level ?? "");
              const messageHtml =
                hit.highlight?.message?.[0] ?? String(f.message ?? "");
              const hasMark = /<mark>/i.test(messageHtml);
              return (
                <tr
                  key={hit.id}
                  onClick={() => onSelect(hit)}
                  className={`cursor-pointer border-b border-ink-100/80 ${
                    selectedId === hit.id
                      ? "bg-accent-soft/70"
                      : "hover:bg-ink-50/80"
                  }`}
                >
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] text-ink-600">
                    {formatTs(String(f.ts ?? ""))}
                  </td>
                  <td className="px-2 py-1.5">
                    <LevelBadge level={level} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[12px] text-ink-700">
                    {String(f.service ?? "")}
                  </td>
                  <td className="max-w-[48rem] truncate px-2 py-1.5 text-ink-900">
                    {hasMark ? (
                      <HighlightedText html={messageHtml} />
                    ) : (
                      messageHtml
                    )}
                    {f.trace_id ? (
                      <Link
                        href={`/trace/${encodeURIComponent(String(f.trace_id))}`}
                        className="ml-2 text-[11px] text-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        trace
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!hits.length ? (
              <tr>
                <td
                  colSpan={4}
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
