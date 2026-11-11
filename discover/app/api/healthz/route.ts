import { NextResponse } from "next/server";
import { isClusterReady } from "@/lib/couchbase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ready = await isClusterReady();
    if (!ready.ok) {
      return NextResponse.json(
        { status: "not_ready", detail: ready.detail },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { status: "ok", detail: ready.detail },
      { status: 200 },
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("healthz crashed:", detail);
    return NextResponse.json({ status: "error", detail }, { status: 503 });
  }
}
