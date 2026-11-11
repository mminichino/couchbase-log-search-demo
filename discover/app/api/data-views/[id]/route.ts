import { NextRequest, NextResponse } from "next/server";
import { isAuthUser, requireApiUser } from "@/lib/auth";
import {
  deleteDataView,
  getDataView,
  updateDataView,
} from "@/lib/data-views";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireApiUser(req);
  if (!isAuthUser(auth)) return auth;
  const { id } = await ctx.params;
  try {
    const dataView = await getDataView(id);
    if (!dataView) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ dataView });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get data view";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireApiUser(req);
  if (!isAuthUser(auth)) return auth;
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      title?: string;
      description?: string;
      defaultColumns?: string[];
    };
    const dataView = await updateDataView(
      id,
      body,
      auth.username,
      auth.role === "admin",
    );
    return NextResponse.json({ dataView });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update data view";
    const status =
      message === "Not found" || message.includes("not found")
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
    await deleteDataView(id, auth.username, auth.role === "admin");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete data view";
    const status =
      message.includes("not found")
        ? 404
        : message === "Forbidden" || message.includes("Cannot delete")
          ? 403
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
