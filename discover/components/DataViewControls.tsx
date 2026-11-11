"use client";

import { FormEvent, useState } from "react";
export type DataViewOption = {
  id: string;
  title: string;
  description?: string;
  defaultColumns?: string[];
  availableFields?: string[];
};

export type SavedSearchOption = {
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
};

type Props = {
  dataViews: DataViewOption[];
  dataViewId: string;
  savedSearches: SavedSearchOption[];
  onSelectDataView: (id: string) => void;
  onCreateDataView: (title: string, description: string) => Promise<void>;
  onSaveSession: (title: string, description: string) => Promise<void>;
  onOpenSaved: (saved: SavedSearchOption) => void;
  onDeleteSaved: (id: string) => Promise<void>;
};

export function DataViewControls({
  dataViews,
  dataViewId,
  savedSearches,
  onSelectDataView,
  onCreateDataView,
  onSaveSession,
  onOpenSaved,
  onDeleteSaved,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [openList, setOpenList] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreateDataView(title, description);
      setTitle("");
      setDescription("");
      setCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSaveSession(title, description);
      setTitle("");
      setDescription("");
      setSaveOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-xs text-ink-600">
        <span className="uppercase tracking-wide text-ink-500">Data view</span>
        <select
          className="max-w-[16rem] rounded-md border border-ink-200 bg-white px-2 py-1.5 text-sm text-ink-800"
          value={dataViewId}
          onChange={(e) => onSelectDataView(e.target.value)}
        >
          {dataViews.map((dv) => (
            <option key={dv.id} value={dv.id}>
              {dv.title}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="rounded-md border border-ink-200 bg-white px-2 py-1.5 text-sm text-ink-700 hover:bg-ink-50"
        title="Create data view"
        onClick={() => {
          setError(null);
          setTitle("");
          setDescription("");
          setCreateOpen(true);
          setSaveOpen(false);
          setOpenList(false);
        }}
      >
        +
      </button>
      <button
        type="button"
        className="rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-700 hover:bg-ink-50"
        onClick={() => {
          setOpenList((v) => !v);
          setCreateOpen(false);
          setSaveOpen(false);
        }}
      >
        Open
      </button>
      <button
        type="button"
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        onClick={() => {
          setError(null);
          setTitle("");
          setDescription("");
          setSaveOpen(true);
          setCreateOpen(false);
          setOpenList(false);
        }}
      >
        Save
      </button>

      {createOpen ? (
        <form
          onSubmit={submitCreate}
          className="w-full rounded-md border border-ink-200 bg-white p-3 shadow-sm"
        >
          <h3 className="mb-2 text-sm font-semibold text-ink-900">
            Create data view
          </h3>
          <p className="mb-2 text-[11px] text-ink-500">
            Binds to Search index events_fts on logs.app.events (demo default).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="flex-1 rounded-md border border-ink-200 px-2 py-1.5 text-sm"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              className="flex-1 rounded-md border border-ink-200 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-60"
            >
              Create
            </button>
            <button
              type="button"
              className="rounded-md border border-ink-200 px-3 py-1.5 text-sm"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </button>
          </div>
          {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        </form>
      ) : null}

      {saveOpen ? (
        <form
          onSubmit={submitSave}
          className="w-full rounded-md border border-ink-200 bg-white p-3 shadow-sm"
        >
          <h3 className="mb-2 text-sm font-semibold text-ink-900">
            Save Discover session
          </h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="flex-1 rounded-md border border-ink-200 px-2 py-1.5 text-sm"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              className="flex-1 rounded-md border border-ink-200 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-60"
            >
              Save
            </button>
            <button
              type="button"
              className="rounded-md border border-ink-200 px-3 py-1.5 text-sm"
              onClick={() => setSaveOpen(false)}
            >
              Cancel
            </button>
          </div>
          {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        </form>
      ) : null}

      {openList ? (
        <div className="w-full rounded-md border border-ink-200 bg-white p-3 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-ink-900">
            Saved sessions
          </h3>
          {!savedSearches.length ? (
            <p className="text-xs text-ink-500">No saved sessions yet.</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-auto">
              {savedSearches.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-ink-50"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-ink-800"
                    onClick={() => {
                      onOpenSaved(s);
                      setOpenList(false);
                    }}
                  >
                    <span className="font-medium">{s.title}</span>
                    {s.description ? (
                      <span className="ml-2 text-xs text-ink-500">
                        {s.description}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-ink-500 hover:text-danger"
                    onClick={() => void onDeleteSaved(s.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
