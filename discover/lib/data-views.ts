import { randomUUID } from "crypto";
import { DocumentExistsError, DocumentNotFoundError } from "./cb-sdk";
import { getCouchbase, searchIndexName } from "./couchbase";
import {
  AVAILABLE_FIELDS,
  DEFAULT_COLUMNS,
  DEFAULT_DATA_VIEW_ID,
} from "./fields";

export { DEFAULT_DATA_VIEW_ID };

export type DataViewRecord = {
  id: string;
  title: string;
  description: string;
  searchIndex: string;
  bucket: string;
  scope: string;
  collection: string;
  timeField: string;
  defaultColumns: string[];
  availableFields: string[];
  bootstrap?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

function dataViewKey(id: string): string {
  return `dataview::${id}`;
}

export async function ensureBootstrapDataView(): Promise<void> {
  const { dataViews } = await getCouchbase();
  const now = new Date().toISOString();
  const doc: DataViewRecord = {
    id: DEFAULT_DATA_VIEW_ID,
    title: "logs.app.events",
    description: "Application log events (Search index events_fts)",
    searchIndex: searchIndexName(),
    bucket: process.env.CB_BUCKET || "logs",
    scope: process.env.CB_SCOPE || "app",
    collection: process.env.CB_COLLECTION || "events",
    timeField: "ts",
    defaultColumns: [...DEFAULT_COLUMNS],
    availableFields: [...AVAILABLE_FIELDS],
    bootstrap: true,
    createdBy: "system",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await dataViews.insert(dataViewKey(DEFAULT_DATA_VIEW_ID), doc);
  } catch (err) {
    if (err instanceof DocumentExistsError) return;
    throw err;
  }
}

export async function listDataViews(): Promise<DataViewRecord[]> {
  await ensureBootstrapDataView();
  const { cluster } = await getCouchbase();
  try {
    const result = await cluster.query(
      "SELECT d.* FROM `logs`.`discover`.`data_views` AS d ORDER BY d.title",
    );
    const rows = result.rows as DataViewRecord[];
    if (rows.length) return rows;
  } catch {
    /* index may still be building — fall through to KV */
  }
  const bootstrap = await getDataView(DEFAULT_DATA_VIEW_ID);
  return bootstrap ? [bootstrap] : [];
}

export async function getDataView(id: string): Promise<DataViewRecord | null> {
  await ensureBootstrapDataView();
  const { dataViews } = await getCouchbase();
  try {
    const result = await dataViews.get(dataViewKey(id));
    return result.content as DataViewRecord;
  } catch (err) {
    if (err instanceof DocumentNotFoundError) return null;
    throw err;
  }
}

export async function createDataView(
  input: {
    title: string;
    description?: string;
    defaultColumns?: string[];
  },
  username: string,
): Promise<DataViewRecord> {
  const title = input.title?.trim();
  if (!title || title.length > 128) {
    throw new Error("title is required (max 128 characters)");
  }
  const cols =
    input.defaultColumns?.filter((c) =>
      (AVAILABLE_FIELDS as readonly string[]).includes(c),
    ) ?? [...DEFAULT_COLUMNS];
  const id = randomUUID();
  const now = new Date().toISOString();
  const doc: DataViewRecord = {
    id,
    title,
    description: (input.description ?? "").trim().slice(0, 500),
    searchIndex: searchIndexName(),
    bucket: process.env.CB_BUCKET || "logs",
    scope: process.env.CB_SCOPE || "app",
    collection: process.env.CB_COLLECTION || "events",
    timeField: "ts",
    defaultColumns: cols.length ? cols : [...DEFAULT_COLUMNS],
    availableFields: [...AVAILABLE_FIELDS],
    createdBy: username,
    createdAt: now,
    updatedAt: now,
  };
  const { dataViews } = await getCouchbase();
  await dataViews.insert(dataViewKey(id), doc);
  return doc;
}

export async function updateDataView(
  id: string,
  patch: {
    title?: string;
    description?: string;
    defaultColumns?: string[];
  },
  username: string,
  isAdmin: boolean,
): Promise<DataViewRecord> {
  const existing = await getDataView(id);
  if (!existing) throw new Error("Data view not found");
  if (!isAdmin && existing.createdBy !== username && !existing.bootstrap) {
    throw new Error("Forbidden");
  }
  const next: DataViewRecord = {
    ...existing,
    title: patch.title?.trim() || existing.title,
    description:
      typeof patch.description === "string"
        ? patch.description.trim().slice(0, 500)
        : existing.description,
    defaultColumns: patch.defaultColumns?.length
      ? patch.defaultColumns.filter((c) =>
          (AVAILABLE_FIELDS as readonly string[]).includes(c),
        )
      : existing.defaultColumns,
    updatedAt: new Date().toISOString(),
  };
  const { dataViews } = await getCouchbase();
  await dataViews.replace(dataViewKey(id), next);
  return next;
}

export async function deleteDataView(
  id: string,
  username: string,
  isAdmin: boolean,
): Promise<void> {
  const existing = await getDataView(id);
  if (!existing) throw new Error("Data view not found");
  if (existing.bootstrap || existing.id === DEFAULT_DATA_VIEW_ID) {
    throw new Error("Cannot delete the bootstrap data view");
  }
  if (!isAdmin && existing.createdBy !== username) {
    throw new Error("Forbidden");
  }
  const { dataViews } = await getCouchbase();
  await dataViews.remove(dataViewKey(id));
}
