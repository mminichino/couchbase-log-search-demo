"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type Props = {
  username?: string;
  role?: string;
  active?: "discover" | "account" | "users" | "trace";
};

export function AppHeader({ username, role, active = "discover" }: Props) {
  const router = useRouter();

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200/80 pb-3">
      <div className="flex items-baseline gap-4">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-ink-950">
          Discover
        </Link>
        <nav className="flex gap-3 text-sm text-ink-600">
          <Link
            href="/"
            className={active === "discover" ? "text-accent" : "hover:text-ink-900"}
          >
            Search
          </Link>
          <Link
            href="/account"
            className={active === "account" ? "text-accent" : "hover:text-ink-900"}
          >
            Account
          </Link>
          {role === "admin" ? (
            <Link
              href="/users"
              className={active === "users" ? "text-accent" : "hover:text-ink-900"}
            >
              Users
            </Link>
          ) : null}
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm text-ink-600">
        {username ? (
          <span className="font-mono text-xs">
            {username}
            <span className="text-ink-400"> · {role}</span>
          </span>
        ) : null}
        {username ? (
          <button
            type="button"
            className="rounded-md border border-ink-200 bg-white px-2.5 py-1 text-xs text-ink-700 hover:bg-ink-50"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.replace("/login");
            }}
          >
            Log out
          </button>
        ) : null}
      </div>
    </header>
  );
}
