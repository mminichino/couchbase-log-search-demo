import { NextRequest, NextResponse } from "next/server";
import { isAuthUser, requireApiUser } from "@/lib/auth";
import { deleteUser, Role, updateUser } from "@/lib/users";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ username: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireApiUser(req, { admin: true });
  if (!isAuthUser(auth)) return auth;
  const { username } = await ctx.params;
  try {
    const body = (await req.json()) as {
      role?: Role;
      password?: string;
      disabled?: boolean;
    };
    const user = await updateUser(username, body);
    return NextResponse.json({ user });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update user";
    const status =
      message.includes("not found")
        ? 404
        : message.includes("Invalid") || message.includes("at least")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireApiUser(req, { admin: true });
  if (!isAuthUser(auth)) return auth;
  const { username } = await ctx.params;
  if (username === auth.username) {
    return NextResponse.json(
      { error: "Cannot delete your own account" },
      { status: 400 },
    );
  }
  try {
    await deleteUser(username);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete user";
    const status =
      message.includes("not found")
        ? 404
        : message.includes("Cannot delete")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
