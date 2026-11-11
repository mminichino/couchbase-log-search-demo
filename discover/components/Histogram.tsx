"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceArea,
} from "recharts";
import { formatIntervalLabel } from "@/lib/time";

export type HistBucket = {
  key: string;
  from: string;
  to: string;
  count: number;
};

type Props = {
  buckets: HistBucket[];
  intervalMs: number;
  onZoom: (from: string, to: string) => void;
};

export function Histogram({ buckets, intervalMs, onZoom }: Props) {
  const data = useMemo(
    () =>
      buckets.map((b) => ({
        ...b,
        label: shortTime(b.from),
      })),
    [buckets],
  );
  const [refLeft, setRefLeft] = useState<string | null>(null);
  const [refRight, setRefRight] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <div className="w-full">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <div className="text-xs text-ink-500">
          Hit histogram · {formatIntervalLabel(intervalMs)} buckets · {total.toLocaleString()} in view
        </div>
        <div className="text-[11px] text-ink-400">Drag across bars to zoom</div>
      </div>
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            onMouseDown={(state) => {
              if (!state?.activeLabel) return;
              setRefLeft(String(state.activeLabel));
              setRefRight(String(state.activeLabel));
              setDragging(true);
            }}
            onMouseMove={(state) => {
              if (!dragging || !state?.activeLabel) return;
              setRefRight(String(state.activeLabel));
            }}
            onMouseUp={() => {
              if (!dragging || !refLeft || !refRight) {
                setDragging(false);
                setRefLeft(null);
                setRefRight(null);
                return;
              }
              const leftIdx = data.findIndex((d) => d.label === refLeft);
              const rightIdx = data.findIndex((d) => d.label === refRight);
              setDragging(false);
              setRefLeft(null);
              setRefRight(null);
              if (leftIdx < 0 || rightIdx < 0) return;
              const a = Math.min(leftIdx, rightIdx);
              const b = Math.max(leftIdx, rightIdx);
              if (a === b) return;
              onZoom(data[a].from, data[b].to);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#d5dde6" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#6a849c" }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              width={36}
              tick={{ fontSize: 10, fill: "#6a849c" }}
            />
            <Tooltip
              cursor={{ fill: "rgba(15,122,108,0.08)" }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid #c9d3de",
              }}
              formatter={(value: number) => [value, "hits"]}
            />
            <Bar dataKey="count" fill="#0f7a6c" radius={[2, 2, 0, 0]} />
            {refLeft && refRight ? (
              <ReferenceArea
                x1={refLeft}
                x2={refRight}
                strokeOpacity={0.3}
                fill="#0f7a6c"
                fillOpacity={0.12}
              />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
