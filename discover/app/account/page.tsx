"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ username: string; role: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/me");
      if (res.status === 401) {
        router.replace("/login?next=/account");
        return;
      }
      if (res.ok) setMe(await res.json());
    })();
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Update failed");
      setMessage("Password updated");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-5">
      <AppHeader username={me?.username} role={me?.role} active="account" />
      <section className="rounded-xl border border-ink-200/70 bg-white/60 p-5 shadow-panel">
        <h2 className="font-display text-lg font-semibold text-ink-950">
          Change password
        </h2>
        <p className="mt-1 text-sm text-ink-600">
          Updates your Discover account in <code>logs.discover.users</code>.
        </p>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block space-y-1 text-sm">
            Current password
            <input
              type="password"
              className="w-full rounded-md border border-ink-200 px-3 py-2"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1 text-sm">
            New password
            <input
              type="password"
              className="w-full rounded-md border border-ink-200 px-3 py-2"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? <p className="text-sm text-accent">{message}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-ink-900 px-3 py-2 text-sm text-white disabled:opacity-60"
          >
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      </section>
    </div>
  );
}
