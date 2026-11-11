import { randomUUID } from "crypto";
import { DocumentNotFoundError } from "./cb-sdk";
import { getCouchbase } from "./couchbase";
import {
  DEFAULT_COLUMNS,
  DEFAULT_DATA_VIEW_ID,
  DEFAULT_SORT,
  parseColumns,
  parseSort,
} from "./fields";

export type SavedSearchRecord = {
  id: string;
  title: string;
  description: string;
  dataViewId: string;
  q: string;
  filters: string[];
  columns: string[];
  sort: string;
  from: string;
  to: string;
  refresh: "off" | "5" | "10" | "30";
  owner: string;
  createdAt: string;
  updatedAt: string;
};

function savedKey(id: string): string {
  return `saved::${id}`;
}

function normalizeRefresh(
  value: string | undefined,
): "off" | "5" | "10" | "30" {
  if (value === "5" || value === "10" || value === "30") return value;
  return "off";
}

export async function listSavedSearches(
  username: string,
  isAdmin: boolean,
): Promise<SavedSearchRecord[]> {
  const { cluster } = await getCouchbase();
  if (isAdmin) {
    const result = await cluster.query(
      "SELECT s.* FROM `logs`.`discover`.`saved_searches` AS s ORDER BY s.updatedAt DESC",
    );
    return result.rows as SavedSearchRecord[];
  }
  const result = await cluster.query(
    "SELECT s.* FROM `logs`.`discover`.`saved_searches` AS s WHERE s.owner = $owner ORDER BY s.updatedAt DESC",
    { parameters: { owner: username } },
  );
  return result.rows as SavedSearchRecord[];
}

export async function getSavedSearch(
  id: string,
): Promise<SavedSearchRecord | null> {
  const { savedSearches } = await getCouchbase();
  try {
    const result = await savedSearches.get(savedKey(id));
    return result.content as SavedSearchRecord;
  } catch (err) {
    if (err instanceof DocumentNotFoundError) return null;
    throw err;
  }
}

export async function createSavedSearch(
  input: {
    title: string;
    description?: string;
    dataViewId?: string;
    q?: string;
    filters?: string[];
    columns?: string[];
    sort?: string;
    from?: string;
    to?: string;
    refresh?: string;
  },
  username: string,
): Promise<SavedSearchRecord> {
  const title = input.title?.trim();
  if (!title || title.length > 128) {
    throw new Error("title is required (max 128 characters)");
  }
  let sort = DEFAULT_SORT;
  try {
    sort = parseSort(input.sort);
  } catch {
    sort = DEFAULT_SORT;
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const doc: SavedSearchRecord = {
    id,
    title,
    description: (input.description ?? "").trim().slice(0, 500),
    dataViewId: input.dataViewId?.trim() || DEFAULT_DATA_VIEW_ID,
    q: input.q ?? "",
    filters: Array.isArray(input.filters) ? input.filters : [],
    columns: parseColumns(input.columns),
    sort,
    from: input.from || "now-15m",
    to: input.to || "now",
    refresh: normalizeRefresh(input.refresh),
    owner: username,
    createdAt: now,
    updatedAt: now,
  };
  const { savedSearches } = await getCouchbase();
  await savedSearches.insert(savedKey(id), doc);
  return doc;
}

export async function updateSavedSearch(
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    dataViewId: string;
    q: string;
    filters: string[];
    columns: string[];
    sort: string;
    from: string;
    to: string;
    refresh: string;
  }>,
  username: string,
  isAdmin: boolean,
): Promise<SavedSearchRecord> {
  const existing = await getSavedSearch(id);
  if (!existing) throw new Error("Saved search not found");
  if (!isAdmin && existing.owner !== username) {
    throw new Error("Forbidden");
  }
  let sort = existing.sort;
  if (typeof patch.sort === "string") {
    sort = parseSort(patch.sort);
  }
  const next: SavedSearchRecord = {
    ...existing,
    title: patch.title?.trim() || existing.title,
    description:
      typeof patch.description === "string"
        ? patch.description.trim().slice(0, 500)
        : existing.description,
    dataViewId: patch.dataViewId?.trim() || existing.dataViewId,
    q: typeof patch.q === "string" ? patch.q : existing.q,
    filters: Array.isArray(patch.filters) ? patch.filters : existing.filters,
    columns: patch.columns ? parseColumns(patch.columns) : existing.columns,
    sort,
    from: patch.from || existing.from,
    to: patch.to || existing.to,
    refresh: patch.refresh
      ? normalizeRefresh(patch.refresh)
      : existing.refresh,
    updatedAt: new Date().toISOString(),
  };
  const { savedSearches } = await getCouchbase();
  await savedSearches.replace(savedKey(id), next);
  return next;
}

export async function deleteSavedSearch(
  id: string,
  username: string,
  isAdmin: boolean,
): Promise<void> {
  const existing = await getSavedSearch(id);
  if (!existing) throw new Error("Saved search not found");
  if (!isAdmin && existing.owner !== username) {
    throw new Error("Forbidden");
  }
  const { savedSearches } = await getCouchbase();
  await savedSearches.remove(savedKey(id));
}

export { DEFAULT_COLUMNS, DEFAULT_SORT };
