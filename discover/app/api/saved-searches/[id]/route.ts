import { NextRequest, NextResponse } from "next/server";
import { isAuthUser, requireApiUser } from "@/lib/auth";
import {
  deleteSavedSearch,
  getSavedSearch,
  updateSavedSearch,
} from "@/lib/saved-searches";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireApiUser(req);
  if (!isAuthUser(auth)) return auth;
  const { id } = await ctx.params;
  try {
    const savedSearch = await getSavedSearch(id);
    if (!savedSearch) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (auth.role !== "admin" && savedSearch.owner !== auth.username) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ savedSearch });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get saved search";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireApiUser(req);
  if (!isAuthUser(auth)) return auth;
  const { id } = await ctx.params;
  try {
    const body = await req.json();
    const savedSearch = await updateSavedSearch(
      id,
      body,
      auth.username,
      auth.role === "admin",
    );
    return NextResponse.json({ savedSearch });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update saved search";
    const status =
      message.includes("not found")
        ? 404
        : message === "Forbidden"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireApiUser(req);
  if (!isAuthUser(auth)) return auth;
  const { id } = await ctx.params;
  try {
    await deleteSavedSearch(id, auth.username, auth.role === "admin");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete saved search";
    const status =
      message.includes("not found")
        ? 404
        : message === "Forbidden"
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
