"use client";

import { RELATIVE_WINDOWS, RelativeWindow } from "@/lib/time";

type Props = {
  relative: RelativeWindow | null;
  from: string;
  to: string;
  refresh: "off" | "5" | "10" | "30";
  onRelative: (id: RelativeWindow) => void;
  onAbsolute: (from: string, to: string) => void;
  onRefresh: (value: "off" | "5" | "10" | "30") => void;
};

export function TimePicker({
  relative,
  from,
  to,
  refresh,
  onRelative,
  onAbsolute,
  onRefresh,
}: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-1">
        {RELATIVE_WINDOWS.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => onRelative(w.id)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
              relative === w.id
                ? "bg-accent text-white"
                : "bg-ink-100 text-ink-700 hover:bg-ink-200"
            }`}
          >
            {w.id}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-ink-500">
          From
          <input
            type="datetime-local"
            className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-sm text-ink-800"
            value={toLocalInput(from)}
            onChange={(e) =>
              onAbsolute(fromLocalInput(e.target.value), to)
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-ink-500">
          To
          <input
            type="datetime-local"
            className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-sm text-ink-800"
            value={toLocalInput(to)}
            onChange={(e) =>
              onAbsolute(from, fromLocalInput(e.target.value))
            }
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-ink-500">
        Auto-refresh
        <select
          className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-sm text-ink-800"
          value={refresh}
          onChange={(e) =>
            onRefresh(e.target.value as "off" | "5" | "10" | "30")
          }
        >
          <option value="off">Off</option>
          <option value="5">5s</option>
          <option value="10">10s</option>
          <option value="30">30s</option>
        </select>
      </label>
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
