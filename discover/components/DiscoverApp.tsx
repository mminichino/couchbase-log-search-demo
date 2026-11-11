"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Facets, SearchHit, SearchResponse } from "@/lib/search-request";
import { RelativeWindow, resolveRange, toIso } from "@/lib/time";
import { AppHeader } from "./AppHeader";
import { DocDetail } from "./DocDetail";
import { DocTable } from "./DocTable";
import { FieldSidebar } from "./FieldSidebar";
import { Histogram } from "./Histogram";
import { InspectPanel } from "./InspectPanel";
import { QueryBar } from "./QueryBar";
import { TimePicker } from "./TimePicker";

type Me = { username: string; role: string };

export function DiscoverApp() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const qParam = searchParams.get("q") ?? "";
  const fromParam = searchParams.get("from") ?? "now-15m";
  const toParam = searchParams.get("to") ?? "now";
  const refreshParam = (searchParams.get("refresh") as "off" | "5" | "10" | "30") || "off";
  const filters = searchParams.getAll("filter");
  const inspectOpen = searchParams.get("inspect") === "1";

  const range = useMemo(
    () => resolveRange(fromParam, toParam),
    [fromParam, toParam],
  );

  const [draftQ, setDraftQ] = useState(qParam);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const [skip, setSkip] = useState(0);

  useEffect(() => {
    setDraftQ(qParam);
  }, [qParam]);

  const replaceParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/me");
      if (res.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(pathname + (searchParams.toString() ? `?${searchParams}` : ""))}`);
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as Me;
      if (!cancelled) setMe(body);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams]);

  const runSearch = useCallback(
    async (opts?: { append?: boolean; nextSkip?: number }) => {
      const append = opts?.append ?? false;
      const nextSkip = opts?.nextSkip ?? 0;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("q", qParam);
      params.set("from", fromParam);
      params.set("to", toParam);
      params.set("skip", String(nextSkip));
      params.set("limit", "50");
      for (const f of filters) params.append("filter", f);

      try {
        const res = await fetch(`/api/search?${params.toString()}`);
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body.error || "Search failed");
        }
        const result = body as SearchResponse;
        setData(result);
        setSkip(nextSkip);
        setHits((prev) => (append ? [...prev, ...result.hits] : result.hits));
        if (!append) setSelected(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        if (!append) {
          setData(null);
          setHits([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters, fromParam, qParam, router, toParam],
  );

  useEffect(() => {
    void runSearch({ append: false, nextSkip: 0 });
  }, [runSearch]);

  useEffect(() => {
    if (refreshParam === "off") return;
    const ms = Number(refreshParam) * 1000;
    if (!Number.isFinite(ms) || ms <= 0) return;
    const id = window.setInterval(() => {
      void runSearch({ append: false, nextSkip: 0 });
    }, ms);
    return () => window.clearInterval(id);
  }, [refreshParam, runSearch]);

  const canLoadMore =
    hits.length > 0 &&
    hits.length < 500 &&
    (data?.total ?? 0) > hits.length &&
    skip + 50 < 500;

  const facets: Facets = data?.facets ?? {};

  return (
    <div className="flex min-h-screen flex-col gap-3 p-4 md:p-5">
      <AppHeader username={me?.username} role={me?.role} active="discover" />

      <section className="space-y-3 rounded-xl border border-ink-200/70 bg-white/55 p-3 shadow-panel backdrop-blur-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <QueryBar
            value={draftQ}
            onChange={setDraftQ}
            loading={loading}
            onSubmit={() =>
              replaceParams((p) => {
                if (draftQ) p.set("q", draftQ);
                else p.delete("q");
              })
            }
          />
          <button
            type="button"
            className={`self-start rounded-md border px-3 py-2 text-xs ${
              inspectOpen
                ? "border-accent bg-accent-soft text-accent"
                : "border-ink-200 bg-white text-ink-700"
            }`}
            onClick={() =>
              replaceParams((p) => {
                if (inspectOpen) p.delete("inspect");
                else p.set("inspect", "1");
              })
            }
          >
            Inspect
          </button>
        </div>

        <TimePicker
          relative={range.relative}
          from={toIso(range.from)}
          to={toIso(range.to)}
          refresh={refreshParam}
          onRelative={(id: RelativeWindow) =>
            replaceParams((p) => {
              p.set("from", `now-${id}`);
              p.set("to", "now");
            })
          }
          onAbsolute={(from, to) =>
            replaceParams((p) => {
              p.set("from", from);
              p.set("to", to);
            })
          }
          onRefresh={(value) =>
            replaceParams((p) => {
              if (value === "off") p.delete("refresh");
              else p.set("refresh", value);
            })
          }
        />

        {filters.length ? (
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                className="rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 font-mono text-[11px] text-ink-700 hover:bg-ink-100"
                onClick={() =>
                  replaceParams((p) => {
                    const all = p.getAll("filter").filter((x) => x !== f);
                    p.delete("filter");
                    for (const x of all) p.append("filter", x);
                  })
                }
                title="Remove filter"
              >
                {f} ×
              </button>
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <Histogram
          buckets={data?.histogram.buckets ?? []}
          intervalMs={data?.histogram.intervalMs ?? 60_000}
          onZoom={(from, to) =>
            replaceParams((p) => {
              p.set("from", from);
              p.set("to", to);
            })
          }
        />
      </section>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)_minmax(280px,360px)]">
        <div
          className="min-h-[240px] rounded-xl border border-ink-200/70 bg-white/55 p-3 shadow-panel"
          style={{ ["--panel-bg" as string]: "rgba(255,255,255,0.92)" }}
        >
          <FieldSidebar
            facets={facets}
            activeFilters={filters}
            onFilterFor={(field, value) =>
              replaceParams((p) => {
                const token = `${field}:${value}`;
                const all = p.getAll("filter").filter((x) => x !== token && x !== `-${token}`);
                p.delete("filter");
                for (const x of all) p.append("filter", x);
                p.append("filter", token);
              })
            }
            onFilterOut={(field, value) =>
              replaceParams((p) => {
                const token = `-${field}:${value}`;
                const positive = `${field}:${value}`;
                const all = p
                  .getAll("filter")
                  .filter((x) => x !== token && x !== positive);
                p.delete("filter");
                for (const x of all) p.append("filter", x);
                p.append("filter", token);
              })
            }
          />
        </div>

        <div
          className="min-h-[320px] overflow-hidden rounded-xl border border-ink-200/70 bg-white/55 shadow-panel"
          style={{ ["--panel-bg" as string]: "rgba(255,255,255,0.95)" }}
        >
          <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2 text-xs text-ink-500">
            <span>
              {loading ? "Searching…" : `${(data?.total ?? 0).toLocaleString()} hits`}
              {data ? ` · ${data.tookMs} ms` : ""}
            </span>
            <span className="tabular-nums">
              showing {hits.length}
              {hits.length >= 500 ? " (max 500)" : ""}
            </span>
          </div>
          <DocTable
            hits={hits}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            canLoadMore={canLoadMore}
            loadingMore={loadingMore}
            onLoadMore={() => runSearch({ append: true, nextSkip: skip + 50 })}
          />
        </div>

        <div className="min-h-[320px] overflow-hidden rounded-xl border border-ink-200/70 bg-white/55 shadow-panel">
          <DocDetail
            hit={selected}
            onClose={() => setSelected(null)}
            onFilterFor={(field, value) =>
              replaceParams((p) => {
                const token = `${field}:${value}`;
                const all = p.getAll("filter").filter((x) => x !== token && x !== `-${token}`);
                p.delete("filter");
                for (const x of all) p.append("filter", x);
                p.append("filter", token);
              })
            }
            onFilterOut={(field, value) =>
              replaceParams((p) => {
                const token = `-${field}:${value}`;
                const positive = `${field}:${value}`;
                const all = p
                  .getAll("filter")
                  .filter((x) => x !== token && x !== positive);
                p.delete("filter");
                for (const x of all) p.append("filter", x);
                p.append("filter", token);
              })
            }
          />
        </div>
      </section>

      <InspectPanel
        open={inspectOpen}
        onClose={() =>
          replaceParams((p) => {
            p.delete("inspect");
          })
        }
        request={data?.request}
        total={data?.total ?? 0}
        tookMs={data?.tookMs ?? 0}
      />
    </div>
  );
}
