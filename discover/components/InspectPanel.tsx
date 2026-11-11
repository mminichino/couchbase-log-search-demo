"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  request: unknown;
  total: number;
  tookMs: number;
};

export function InspectPanel({ open, onClose, request, total, tookMs }: Props) {
  if (!open) return null;
  return (
    <div className="border-t border-ink-200 bg-ink-950 text-ink-100">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="font-display text-sm font-semibold">
          Inspect · {total.toLocaleString()} hits · {tookMs} ms
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-ink-300 hover:bg-white/10"
        >
          Close
        </button>
      </div>
      <pre className="max-h-64 overflow-auto px-3 pb-3 font-mono text-[11px] leading-relaxed text-emerald-100/90">
        {JSON.stringify(request, null, 2)}
      </pre>
    </div>
  );
}
