"use client";

import { useState } from "react";

export type UserRow = {
  username: string;
  role: "admin" | "viewer";
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  users: UserRow[];
  currentUsername: string;
  onCreate: (input: {
    username: string;
    password: string;
    role: "admin" | "viewer";
  }) => Promise<void>;
  onUpdateRole: (username: string, role: "admin" | "viewer") => Promise<void>;
  onSetDisabled: (username: string, disabled: boolean) => Promise<void>;
  onDelete: (username: string) => Promise<void>;
};

export function UserTable({
  users,
  currentUsername,
  onCreate,
  onUpdateRole,
  onSetDisabled,
  onDelete,
}: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onCreate({ username, password, role });
            setUsername("");
            setPassword("");
            setRole("viewer");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Create failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-ink-600">
          Username
          <input
            className="rounded-md border border-ink-200 px-2 py-1.5 text-sm"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-600">
          Password
          <input
            type="password"
            className="rounded-md border border-ink-200 px-2 py-1.5 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-600">
          Role
          <select
            className="rounded-md border border-ink-200 px-2 py-1.5 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "viewer")}
          >
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-ink-900 px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          Add user
        </button>
      </form>
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <table className="w-full border-collapse text-left text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-ink-500">
          <tr className="border-b border-ink-200">
            <th className="px-2 py-2 font-medium">Username</th>
            <th className="px-2 py-2 font-medium">Role</th>
            <th className="px-2 py-2 font-medium">Status</th>
            <th className="px-2 py-2 font-medium">Created</th>
            <th className="px-2 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.username} className="border-b border-ink-100">
              <td className="px-2 py-2 font-mono text-ink-900">{u.username}</td>
              <td className="px-2 py-2">
                <select
                  className="rounded border border-ink-200 px-2 py-1 text-sm"
                  value={u.role}
                  onChange={(e) =>
                    onUpdateRole(u.username, e.target.value as "admin" | "viewer")
                  }
                >
                  <option value="viewer">viewer</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td className="px-2 py-2">
                <span
                  className={
                    u.disabled ? "text-danger" : "text-accent-muted"
                  }
                >
                  {u.disabled ? "disabled" : "active"}
                </span>
              </td>
              <td className="px-2 py-2 text-ink-600">
                {new Date(u.createdAt).toLocaleString()}
              </td>
              <td className="space-x-2 px-2 py-2">
                <button
                  type="button"
                  disabled={u.username === "admin"}
                  className="rounded px-2 py-1 text-xs text-ink-800 hover:bg-ink-50 disabled:opacity-40"
                  onClick={() => onSetDisabled(u.username, !u.disabled)}
                >
                  {u.disabled ? "Enable" : "Disable"}
                </button>
                <button
                  type="button"
                  disabled={u.username === currentUsername || u.username === "admin"}
                  className="rounded px-2 py-1 text-xs text-danger hover:bg-red-50 disabled:opacity-40"
                  onClick={() => onDelete(u.username)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
