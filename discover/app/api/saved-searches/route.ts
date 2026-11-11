import { NextRequest, NextResponse } from "next/server";
import { isAuthUser, requireApiUser } from "@/lib/auth";
import { createSavedSearch, listSavedSearches } from "@/lib/saved-searches";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!isAuthUser(auth)) return auth;
  try {
    const savedSearches = await listSavedSearches(
      auth.username,
      auth.role === "admin",
    );
    return NextResponse.json({ savedSearches });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list saved searches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!isAuthUser(auth)) return auth;
  try {
    const body = (await req.json()) as {
      title?: string;
      description?: string;
      dataViewId?: string;
      q?: string;
      filters?: string[];
      columns?: string[];
      sort?: string;
      from?: string;
      to?: string;
      refresh?: string;
    };
    const savedSearch = await createSavedSearch(
      { ...body, title: body.title ?? "" },
      auth.username,
    );
    return NextResponse.json({ savedSearch }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create saved search";
    const status =
      message.includes("required") || message.includes("Sort") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
