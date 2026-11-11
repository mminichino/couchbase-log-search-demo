"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import type { SearchHit } from "@/lib/search-request";

export default function TracePage() {
  const params = useParams<{ traceId: string }>();
  const router = useRouter();
  const traceId = decodeURIComponent(params.traceId);
  const [me, setMe] = useState<{ username: string; role: string } | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [tookMs, setTookMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const meRes = await fetch("/api/me");
      if (meRes.status === 401) {
        router.replace(`/login?next=/trace/${encodeURIComponent(traceId)}`);
        return;
      }
      if (meRes.ok) setMe(await meRes.json());

      const res = await fetch(`/api/trace/${encodeURIComponent(traceId)}`);
      const body = await res.json();
      setLoading(false);
      if (!res.ok) {
        setError(body.error || "Trace lookup failed");
        return;
      }
      setHits(body.hits ?? []);
      setTookMs(body.tookMs ?? 0);
    })();
  }, [router, traceId]);

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-5">
      <AppHeader username={me?.username} role={me?.role} active="trace" />
      <section className="rounded-xl border border-ink-200/70 bg-white/60 p-5 shadow-panel">
        <h1 className="font-display text-xl font-semibold text-ink-950">
          Trace
        </h1>
        <p className="mt-1 font-mono text-sm text-ink-600">{traceId}</p>
        <p className="mt-2 text-xs text-ink-500">
          {loading
            ? "Loading…"
            : `${hits.length} events · ${tookMs} ms · oldest first`}
        </p>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <ol className="mt-4 space-y-3">
          {hits.map((hit, idx) => {
            const f = hit.fields;
            return (
              <li
                key={hit.id}
                className="relative border-l-2 border-accent/40 pl-4"
              >
                <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-accent" />
                <div className="flex flex-wrap items-baseline gap-2 text-xs text-ink-500">
                  <span className="font-mono">{String(f.ts ?? "")}</span>
                  <span className="font-mono text-ink-700">
                    {String(f.service ?? "")}
                  </span>
                  <span className="font-mono">{String(f.level ?? "")}</span>
                  <span className="text-ink-400">#{idx + 1}</span>
                </div>
                <div className="mt-1 text-sm text-ink-900">
                  {String(f.message ?? "")}
                </div>
                {f.http_path ? (
                  <div className="mt-1 font-mono text-[11px] text-ink-500">
                    {String(f.http_method ?? "")} {String(f.http_path)}{" "}
                    {f.http_status != null ? `→ ${f.http_status}` : ""}
                    {f.duration_ms != null ? ` · ${f.duration_ms}ms` : ""}
                  </div>
                ) : null}
                {f.stack_trace ? (
                  <pre className="mt-2 overflow-auto rounded bg-ink-950 p-2 font-mono text-[11px] text-ink-100">
                    {String(f.stack_trace)}
                  </pre>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
