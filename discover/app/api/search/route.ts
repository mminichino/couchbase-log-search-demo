import { NextRequest, NextResponse } from "next/server";
import { isAuthUser, requireApiUser } from "@/lib/auth";
import {
  parseFilters,
  parsePaging,
  runSearch,
  SearchValidationError,
} from "@/lib/search-request";
import { resolveRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!isAuthUser(auth)) return auth;

  try {
    const url = req.nextUrl;
    const q = url.searchParams.get("q") ?? "";
    const { from, to } = resolveRange(
      url.searchParams.get("from"),
      url.searchParams.get("to"),
    );
    const filters = parseFilters(url.searchParams.getAll("filter"));
    const { skip, limit } = parsePaging(
      url.searchParams.get("skip"),
      url.searchParams.get("limit"),
    );

    const result = await runSearch({ q, from, to, filters, skip, limit });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SearchValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
