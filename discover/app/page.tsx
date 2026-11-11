import { Suspense } from "react";
import { DiscoverApp } from "@/components/DiscoverApp";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-ink-500">
          Loading Discover…
        </div>
      }
    >
      <DiscoverApp />
    </Suspense>
  );
}
