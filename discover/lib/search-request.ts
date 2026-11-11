import type { SearchQuery as SearchQueryType, SearchFacet as SearchFacetType, SearchRequest as SearchRequestType } from "couchbase";
import {
  HighlightStyle,
  SearchFacet,
  SearchQuery,
  SearchRequest,
} from "./cb-sdk";
import { getCouchbase, searchIndexName } from "./couchbase";
import { DEFAULT_SORT, parseSort } from "./fields";
import { buildHistogramBuckets, toIso } from "./time";

export { parseSort, DEFAULT_SORT } from "./fields";

export const FILTER_FIELDS = [
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
] as const;

export type FilterField = (typeof FILTER_FIELDS)[number];

export type SearchFilter = {
  field: FilterField;
  value: string;
  exclude: boolean;
};

export type SearchParams = {
  q: string;
  from: Date;
  to: Date;
  filters: SearchFilter[];
  skip: number;
  limit: number;
  /** Couchbase Search sort token, e.g. `-ts` or `service`. */
  sort: string;
};

export type FacetBucket = { key: string; count: number };
export type Facets = Record<string, FacetBucket[]>;

export type HistogramBucket = {
  key: string;
  from: string;
  to: string;
  count: number;
};

export type SearchHit = {
  id: string;
  score: number;
  fields: Record<string, unknown>;
  highlight?: Record<string, string[]>;
};

export type SearchResponse = {
  total: number;
  tookMs: number;
  hits: SearchHit[];
  histogram: {
    intervalMs: number;
    buckets: HistogramBucket[];
  };
  facets: Facets;
  request: unknown;
};

const TERM_FACET_FIELDS = [
  "service",
  "level",
  "region",
  "host",
  "version",
  "scenario",
  "exception_class",
  "http_path",
  "client_ip",
] as const;

const HTTP_STATUS_RANGES: { name: string; min: number; max: number }[] = [
  { name: "2xx", min: 200, max: 300 },
  { name: "3xx", min: 300, max: 400 },
  { name: "4xx", min: 400, max: 500 },
  { name: "5xx", min: 500, max: 600 },
];

export class SearchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchValidationError";
  }
}

export function parseFilters(
  raw: string[] | string | null | undefined,
): SearchFilter[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const filters: SearchFilter[] = [];
  for (const entry of values) {
    if (!entry) continue;
    const exclude = entry.startsWith("-");
    const body = exclude ? entry.slice(1) : entry;
    const idx = body.indexOf(":");
    if (idx <= 0) {
      throw new SearchValidationError(`Invalid filter: ${entry}`);
    }
    const field = body.slice(0, idx);
    const value = body.slice(idx + 1);
    if (!(FILTER_FIELDS as readonly string[]).includes(field)) {
      throw new SearchValidationError(`Filter field not allowed: ${field}`);
    }
    if (!value) {
      throw new SearchValidationError(`Empty filter value for ${field}`);
    }
    filters.push({ field: field as FilterField, value, exclude });
  }
  return filters;
}

export function parsePaging(skipRaw: string | null, limitRaw: string | null): {
  skip: number;
  limit: number;
} {
  const skip = Number(skipRaw ?? "0");
  const limit = Number(limitRaw ?? "50");
  if (!Number.isInteger(skip) || skip < 0) {
    throw new SearchValidationError("skip must be a non-negative integer");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new SearchValidationError("limit must be an integer between 1 and 50");
  }
  if (skip + limit > 500) {
    throw new SearchValidationError("skip + limit must be <= 500");
  }
  return { skip, limit };
}

function httpStatusQuery(value: string): SearchQueryType {
  const range = HTTP_STATUS_RANGES.find((r) => r.name === value);
  if (range) {
    return SearchQuery.numericRange()
      .field("http_status")
      .min(range.min, true)
      .max(range.max, false);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new SearchValidationError(`Invalid http_status filter: ${value}`);
  }
  return SearchQuery.numericRange()
    .field("http_status")
    .min(n, true)
    .max(n, true);
}

function filterQuery(filter: SearchFilter): SearchQueryType {
  if (filter.field === "http_status") {
    return httpStatusQuery(filter.value);
  }
  return SearchQuery.term(filter.value).field(filter.field);
}

export function buildSearchQuery(params: SearchParams): SearchQueryType {
  const must: SearchQueryType[] = [];
  const mustNot: SearchQueryType[] = [];

  if (params.q.trim()) {
    must.push(SearchQuery.queryString(params.q.trim()));
  } else {
    must.push(SearchQuery.matchAll());
  }
  must.push(
    SearchQuery.dateRange()
      .field("ts")
      .start(params.from, true)
      .end(params.to, true),
  );

  for (const filter of params.filters) {
    const q = filterQuery(filter);
    if (filter.exclude) mustNot.push(q);
    else must.push(q);
  }

  const bool = SearchQuery.boolean();
  bool.must(SearchQuery.conjuncts(must));
  if (mustNot.length) {
    bool.mustNot(SearchQuery.disjuncts(mustNot));
  }
  return bool;
}

function buildFacets(histogramBuckets: ReturnType<typeof buildHistogramBuckets>) {
  const facets: Record<string, SearchFacetType> = {};
  for (const field of TERM_FACET_FIELDS) {
    facets[field] = SearchFacet.term(field, 10);
  }

  const statusFacet = SearchFacet.numeric("http_status", 4);
  for (const range of HTTP_STATUS_RANGES) {
    statusFacet.addRange(range.name, range.min, range.max);
  }
  facets.http_status = statusFacet;

  const dateFacet = SearchFacet.date("ts", Math.max(1, histogramBuckets.length));
  for (const bucket of histogramBuckets) {
    dateFacet.addRange(bucket.name, bucket.start, bucket.end);
  }
  facets.histogram = dateFacet;

  return facets;
}

function facetBuckets(
  facets: Record<string, any> | undefined,
  name: string,
): FacetBucket[] {
  const facet = facets?.[name];
  if (!facet) return [];
  if (Array.isArray(facet.terms) && facet.terms.length) {
    return facet.terms.map((t: { term: string; count: number }) => ({
      key: t.term,
      count: t.count,
    }));
  }
  if (Array.isArray(facet.numeric_ranges) && facet.numeric_ranges.length) {
    return facet.numeric_ranges.map(
      (t: { name: string; count: number }) => ({
        key: t.name,
        count: t.count,
      }),
    );
  }
  if (Array.isArray(facet.date_ranges) && facet.date_ranges.length) {
    return facet.date_ranges.map((t: { name: string; count: number }) => ({
      key: t.name,
      count: t.count,
    }));
  }
  return [];
}

async function loadDocuments(
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const { events } = await getCouchbase();
  const out = new Map<string, Record<string, unknown>>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const doc = await events.get(id);
        out.set(id, doc.content as Record<string, unknown>);
      } catch {
        /* missing doc after search hit is possible under expiry */
      }
    }),
  );
  return out;
}

function parseStoredFields(
  fields: unknown,
): Record<string, unknown> | undefined {
  if (!fields) return undefined;
  if (typeof fields === "object" && !Array.isArray(fields)) {
    return fields as Record<string, unknown>;
  }
  if (typeof fields === "string") {
    try {
      return JSON.parse(fields) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function runSearch(params: SearchParams): Promise<SearchResponse> {
  const { eventsScope } = await getCouchbase();
  const index = searchIndexName();
  const histogramDefs = buildHistogramBuckets(params.from, params.to);
  const query = buildSearchQuery(params);
  const facets = buildFacets(histogramDefs);
  const searchReq = SearchRequest.create(query);

  const sort = params.sort || DEFAULT_SORT;
  const requestJson = {
    index,
    query: (query as { toJSON?: () => unknown }).toJSON?.() ?? query,
    size: params.limit,
    from: params.skip,
    sort: [sort],
    highlight: { style: "html", fields: ["message"] },
    facets: Object.fromEntries(
      Object.entries(facets).map(([k, v]) => [
        k,
        (v as { toJSON?: () => unknown }).toJSON?.() ?? v,
      ]),
    ),
  };

  const started = Date.now();
  let result;
  try {
    result = await eventsScope.search(index, searchReq, {
      limit: params.limit,
      skip: params.skip,
      sort: [sort],
      highlight: {
        style: HighlightStyle.HTML,
        fields: ["message"],
      },
      facets,
      fields: ["*"],
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Search request was rejected";
    throw new SearchValidationError(message);
  }
  const tookMs = Date.now() - started;

  const rows = result.rows ?? [];
  const ids = rows.map((r: { id: string }) => r.id);
  const docs = await loadDocuments(ids);

  const hits: SearchHit[] = rows.map(
    (row: {
      id: string;
      score: number;
      fields?: unknown;
      fragments?: Record<string, string[]>;
    }) => {
      const fields =
        docs.get(row.id) ?? parseStoredFields(row.fields) ?? {};
      return {
        id: row.id,
        score: row.score,
        fields,
        highlight: row.fragments,
      };
    },
  );

  const meta = result.meta as any;
  const rawFacets = meta?.facets as Record<string, any> | undefined;
  const outFacets: Facets = {};
  for (const field of [...TERM_FACET_FIELDS, "http_status"]) {
    outFacets[field] = facetBuckets(rawFacets, field);
  }

  const histCounts = new Map(
    facetBuckets(rawFacets, "histogram").map((b) => [b.key, b.count]),
  );
  const histogramBuckets: HistogramBucket[] = histogramDefs.map((b) => ({
    key: b.name,
    from: toIso(b.start),
    to: toIso(b.end),
    count: histCounts.get(b.name) ?? 0,
  }));

  const total =
    meta?.metrics?.total_rows ??
    meta?.metrics?.totalRows ??
    meta?.totalHits ??
    hits.length;

  return {
    total,
    tookMs,
    hits,
    histogram: {
      intervalMs: histogramDefs[0]?.intervalMs ?? 60_000,
      buckets: histogramBuckets,
    },
    facets: outFacets,
    request: requestJson,
  };
}

export async function runTraceSearch(traceId: string): Promise<SearchResponse> {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60_000);
  const bool = SearchQuery.boolean();
  bool.must(
    SearchQuery.conjuncts([
      SearchQuery.term(traceId).field("trace_id"),
      SearchQuery.dateRange().field("ts").start(from, true).end(to, true),
    ]),
  );

  const { eventsScope } = await getCouchbase();
  const index = searchIndexName();
  const requestJson = {
    index,
    query: (bool as { toJSON?: () => unknown }).toJSON?.() ?? bool,
    size: 200,
    sort: ["ts"],
  };

  const started = Date.now();
  let result;
  try {
    result = await eventsScope.search(index, SearchRequest.create(bool), {
      limit: 200,
      sort: ["ts"],
      fields: ["*"],
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Search request was rejected";
    throw new SearchValidationError(message);
  }
  const tookMs = Date.now() - started;
  const rows = result.rows ?? [];
  const docs = await loadDocuments(rows.map((r: { id: string }) => r.id));

  const hits: SearchHit[] = rows
    .map(
      (row: {
        id: string;
        score: number;
        fields?: unknown;
      }) => ({
        id: row.id,
        score: row.score,
        fields: docs.get(row.id) ?? parseStoredFields(row.fields) ?? {},
      }),
    )
    .sort((a, b) => {
      const ats = String(a.fields.ts ?? "");
      const bts = String(b.fields.ts ?? "");
      return ats.localeCompare(bts);
    });

  const meta = result.meta as any;
  return {
    total: meta?.metrics?.total_rows ?? hits.length,
    tookMs,
    hits,
    histogram: { intervalMs: 0, buckets: [] },
    facets: {},
    request: requestJson,
  };
}
