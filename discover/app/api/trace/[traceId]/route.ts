import { NextRequest, NextResponse } from "next/server";
import { isAuthUser, requireApiUser } from "@/lib/auth";
import { runTraceSearch, SearchValidationError } from "@/lib/search-request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ traceId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireApiUser(req);
  if (!isAuthUser(auth)) return auth;

  const { traceId } = await ctx.params;
  if (!traceId) {
    return NextResponse.json({ error: "traceId is required" }, { status: 400 });
  }

  try {
    const result = await runTraceSearch(decodeURIComponent(traceId));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SearchValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Trace search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
