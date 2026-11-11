"use client";

import Link from "next/link";
import type { SearchHit } from "@/lib/search-request";
import { HighlightedText } from "./HighlightedText";

type Props = {
  hit: SearchHit | null;
  onClose: () => void;
  onFilterFor: (field: string, value: string) => void;
  onFilterOut: (field: string, value: string) => void;
};

const PRIORITY_FIELDS = [
  "ts",
  "level",
  "service",
  "message",
  "host",
  "region",
  "version",
  "env",
  "trace_id",
  "span_id",
  "http_method",
  "http_path",
  "http_status",
  "duration_ms",
  "client_ip",
  "user_id",
  "exception_class",
  "stack_trace",
  "scenario",
  "logger",
  "thread",
  "event_id",
];

export function DocDetail({ hit, onClose, onFilterFor, onFilterOut }: Props) {
  if (!hit) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-ink-500">
        Select a document to inspect fields.
      </div>
    );
  }

  const fields = hit.fields;
  const keys = orderedKeys(fields);
  const messageHighlight = hit.highlight?.message?.[0];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-ink-200 px-3 py-2">
        <div>
          <div className="font-display text-sm font-semibold text-ink-900">
            Document
          </div>
          <div className="font-mono text-[11px] text-ink-500">{hit.id}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-ink-600 hover:bg-ink-100"
        >
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
        <dl className="space-y-3">
          {keys.map((key) => {
            const value = fields[key];
            const display =
              value == null
                ? ""
                : typeof value === "string"
                  ? value
                  : JSON.stringify(value);
            const filterable = canFilter(key, display);
            return (
              <div key={key}>
                <dt className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-ink-500">
                  <span>{key}</span>
                  {filterable ? (
                    <span className="flex gap-1 normal-case tracking-normal">
                      <button
                        type="button"
                        className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-700 hover:bg-ink-200"
                        onClick={() => onFilterFor(key, display)}
                      >
                        filter for
                      </button>
                      <button
                        type="button"
                        className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-700 hover:bg-ink-200"
                        onClick={() => onFilterOut(key, display)}
                      >
                        filter out
                      </button>
                    </span>
                  ) : null}
                  {key === "trace_id" && display ? (
                    <Link
                      href={`/trace/${encodeURIComponent(display)}`}
                      className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent hover:underline"
                    >
                      open trace
                    </Link>
                  ) : null}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap break-words font-mono text-[12px] text-ink-900">
                  {key === "message" && messageHighlight ? (
                    <HighlightedText html={messageHighlight} />
                  ) : (
                    display
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
        <div className="mt-6">
          <h3 className="mb-2 font-display text-sm font-semibold text-ink-900">
            Raw JSON
          </h3>
          <pre className="overflow-auto rounded-md bg-ink-950 p-3 font-mono text-[11px] leading-relaxed text-ink-100">
            {JSON.stringify(fields, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

function orderedKeys(fields: Record<string, unknown>): string[] {
  const present = new Set(Object.keys(fields));
  const ordered = PRIORITY_FIELDS.filter((k) => present.has(k));
  const rest = [...present].filter((k) => !PRIORITY_FIELDS.includes(k)).sort();
  return [...ordered, ...rest];
}

function canFilter(field: string, value: string): boolean {
  if (!value) return false;
  return [
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
    "trace_id",
  ].includes(field);
}
