"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { UserTable, UserRow } from "@/components/UserTable";

export default function UsersPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ username: string; role: string } | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const meRes = await fetch("/api/me");
    if (meRes.status === 401) {
      router.replace("/login?next=/users");
      return;
    }
    const meBody = await meRes.json();
    setMe(meBody);
    if (meBody.role !== "admin") {
      setError("Admin role required");
      return;
    }
    const res = await fetch("/api/users");
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Failed to load users");
      return;
    }
    setUsers(body.users);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-5">
      <AppHeader username={me?.username} role={me?.role} active="users" />
      <section className="rounded-xl border border-ink-200/70 bg-white/60 p-5 shadow-panel">
        <h2 className="font-display text-lg font-semibold text-ink-950">
          Users
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-600">
          Manage Discover accounts stored in Couchbase.
        </p>
        {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
        {me ? (
          <UserTable
            users={users}
            currentUsername={me.username}
            onCreate={async (input) => {
              const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(input),
              });
              const body = await res.json();
              if (!res.ok) throw new Error(body.error || "Create failed");
              await load();
            }}
            onUpdateRole={async (username, role) => {
              const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role }),
              });
              const body = await res.json();
              if (!res.ok) throw new Error(body.error || "Update failed");
              await load();
            }}
            onSetDisabled={async (username, disabled) => {
              const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ disabled }),
              });
              const body = await res.json();
              if (!res.ok) throw new Error(body.error || "Update failed");
              await load();
            }}
            onDelete={async (username) => {
              const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
                method: "DELETE",
              });
              const body = await res.json();
              if (!res.ok) throw new Error(body.error || "Delete failed");
              await load();
            }}
          />
        ) : null}
      </section>
    </div>
  );
}
