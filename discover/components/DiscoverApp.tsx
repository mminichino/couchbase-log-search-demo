"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_COLUMNS,
  DEFAULT_DATA_VIEW_ID,
  DEFAULT_SORT,
  parseColumns,
} from "@/lib/fields";
import type { Facets, SearchHit, SearchResponse } from "@/lib/search-request";
import { RelativeWindow, resolveRange, toIso } from "@/lib/time";
import { AppHeader } from "./AppHeader";
import {
  DataViewControls,
  type DataViewOption,
  type SavedSearchOption,
} from "./DataViewControls";
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

  const paramKey = searchParams.toString();
  const qParam = searchParams.get("q") ?? "";
  const fromParam = searchParams.get("from") ?? "now-15m";
  const toParam = searchParams.get("to") ?? "now";
  const refreshParam =
    (searchParams.get("refresh") as "off" | "5" | "10" | "30") || "off";
  const sortParam = searchParams.get("sort") || DEFAULT_SORT;
  const dataViewParam = searchParams.get("dataView") || DEFAULT_DATA_VIEW_ID;
  const inspectOpen = searchParams.get("inspect") === "1";

  // Stabilize array deps — getAll()/parseColumns return new refs every render and
  // would retrigger search in a tight loop (looks like live scroll).
  const filters = useMemo(
    () => searchParams.getAll("filter"),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by full query string
    [paramKey],
  );
  const columnsParam = useMemo(
    () => parseColumns(searchParams.get("columns")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paramKey],
  );

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
  const [dataViews, setDataViews] = useState<DataViewOption[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearchOption[]>([]);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
  }, [selected]);

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

  const loadMeta = useCallback(async () => {
    const [dvRes, ssRes] = await Promise.all([
      fetch("/api/data-views"),
      fetch("/api/saved-searches"),
    ]);
    if (dvRes.ok) {
      const body = (await dvRes.json()) as { dataViews: DataViewOption[] };
      setDataViews(body.dataViews ?? []);
    }
    if (ssRes.ok) {
      const body = (await ssRes.json()) as {
        savedSearches: SavedSearchOption[];
      };
      setSavedSearches(body.savedSearches ?? []);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/me");
      if (res.status === 401) {
        const next = pathname + (paramKey ? `?${paramKey}` : "");
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as Me;
      if (!cancelled) {
        setMe(body);
        await loadMeta();
      }
    })();
    return () => {
      cancelled = true;
    };
    // Auth/bootstrap once per mount (and if path changes), not on every URL tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMeta, pathname, router]);

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
      params.set("sort", sortParam);
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
        if (!append) {
          const keepId = selectedIdRef.current;
          if (keepId) {
            const found = result.hits.find((h) => h.id === keepId);
            if (found) setSelected(found);
          }
        }
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
    [filters, fromParam, qParam, router, sortParam, toParam],
  );

  // Search when query URL inputs change — not on unrelated renders.
  const searchKey = [
    qParam,
    fromParam,
    toParam,
    sortParam,
    filters.join("\0"),
  ].join("|");

  useEffect(() => {
    void runSearch({ append: false, nextSkip: 0 });
    // runSearch identity follows searchKey inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  useEffect(() => {
    if (refreshParam === "off") return;
    const ms = Number(refreshParam) * 1000;
    if (!Number.isFinite(ms) || ms <= 0) return;
    const id = window.setInterval(() => {
      void runSearch({ append: false, nextSkip: 0 });
    }, ms);
    return () => window.clearInterval(id);
  }, [refreshParam, runSearch]);

  const activeDataView =
    dataViews.find((d) => d.id === dataViewParam) ?? dataViews[0];
  const columns = columnsParam.length
    ? columnsParam
    : activeDataView?.defaultColumns ?? [...DEFAULT_COLUMNS];

  const canLoadMore =
    hits.length > 0 &&
    hits.length < 500 &&
    (data?.total ?? 0) > hits.length &&
    skip + 50 < 500;

  const facets: Facets = data?.facets ?? {};

  function setColumns(next: string[]) {
    replaceParams((p) => {
      if (!next.length || next.join(",") === DEFAULT_COLUMNS.join(",")) {
        p.delete("columns");
      } else {
        p.set("columns", next.join(","));
      }
    });
  }

  return (
    <div className="flex min-h-screen flex-col gap-3 p-4 md:p-5">
      <AppHeader username={me?.username} role={me?.role} active="discover" />

      <section className="space-y-3 rounded-xl border border-ink-200/70 bg-white/55 p-3 shadow-panel backdrop-blur-sm">
        <DataViewControls
          dataViews={dataViews}
          dataViewId={activeDataView?.id ?? dataViewParam}
          savedSearches={savedSearches}
          onSelectDataView={(id) => {
            const dv = dataViews.find((d) => d.id === id);
            replaceParams((p) => {
              p.set("dataView", id);
              if (dv?.defaultColumns?.length) {
                p.set("columns", dv.defaultColumns.join(","));
              }
            });
          }}
          onCreateDataView={async (title, description) => {
            const res = await fetch("/api/data-views", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title,
                description,
                defaultColumns: columns,
              }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || "Create failed");
            await loadMeta();
            replaceParams((p) => {
              p.set("dataView", body.dataView.id);
            });
          }}
          onSaveSession={async (title, description) => {
            const res = await fetch("/api/saved-searches", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title,
                description,
                dataViewId: activeDataView?.id ?? dataViewParam,
                q: qParam,
                filters,
                columns,
                sort: sortParam,
                from: fromParam,
                to: toParam,
                refresh: refreshParam,
              }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || "Save failed");
            await loadMeta();
          }}
          onOpenSaved={(s) => {
            replaceParams((p) => {
              p.set("dataView", s.dataViewId);
              if (s.q) p.set("q", s.q);
              else p.delete("q");
              p.set("from", s.from);
              p.set("to", s.to);
              p.set("sort", s.sort);
              p.set("columns", s.columns.join(","));
              if (s.refresh === "off") p.delete("refresh");
              else p.set("refresh", s.refresh);
              p.delete("filter");
              for (const f of s.filters) p.append("filter", f);
            });
          }}
          onDeleteSaved={async (id) => {
            const res = await fetch(`/api/saved-searches/${id}`, {
              method: "DELETE",
            });
            if (!res.ok) {
              const body = await res.json();
              throw new Error(body.error || "Delete failed");
            }
            await loadMeta();
          }}
        />

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
          onManualRefresh={() => void runSearch({ append: false, nextSkip: 0 })}
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

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[240px_minmax(0,1fr)_minmax(280px,360px)]">
        <div
          className="min-h-[240px] rounded-xl border border-ink-200/70 bg-white/55 p-3 shadow-panel"
          style={{ ["--panel-bg" as string]: "rgba(255,255,255,0.92)" }}
        >
          <FieldSidebar
            facets={facets}
            columns={columns}
            availableFields={
              activeDataView?.availableFields ?? undefined
            }
            activeFilters={filters}
            onAddColumn={(field) => {
              if (columns.includes(field)) return;
              setColumns([...columns, field]);
            }}
            onRemoveColumn={(field) => {
              if (columns.length <= 1) return;
              setColumns(columns.filter((c) => c !== field));
            }}
            onFilterFor={(field, value) =>
              replaceParams((p) => {
                const token = `${field}:${value}`;
                const all = p
                  .getAll("filter")
                  .filter((x) => x !== token && x !== `-${token}`);
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
          className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-ink-200/70 bg-white/55 shadow-panel"
          style={{ ["--panel-bg" as string]: "rgba(255,255,255,0.95)" }}
        >
          <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2 text-xs text-ink-500">
            <span>
              Documents
              {loading
                ? " · Searching…"
                : ` · ${(data?.total ?? 0).toLocaleString()} hits`}
              {data ? ` · ${data.tookMs} ms` : ""}
            </span>
            <span className="tabular-nums">
              showing {hits.length}
              {hits.length >= 500 ? " (max 500)" : ""}
            </span>
          </div>
          <DocTable
            hits={hits}
            columns={columns}
            sort={sortParam}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onSort={(sort) =>
              replaceParams((p) => {
                if (sort === DEFAULT_SORT) p.delete("sort");
                else p.set("sort", sort);
              })
            }
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
                const all = p
                  .getAll("filter")
                  .filter((x) => x !== token && x !== `-${token}`);
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
