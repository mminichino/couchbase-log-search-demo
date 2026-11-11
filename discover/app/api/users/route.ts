import { NextRequest, NextResponse } from "next/server";
import { isAuthUser, requireApiUser } from "@/lib/auth";
import { createUser, listUsers, Role } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req, { admin: true });
  if (!isAuthUser(auth)) return auth;
  try {
    const users = await listUsers();
    return NextResponse.json({ users });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list users";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser(req, { admin: true });
  if (!isAuthUser(auth)) return auth;
  try {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
      role?: Role;
    };
    if (!body.username || !body.password || !body.role) {
      return NextResponse.json(
        { error: "username, password, and role are required" },
        { status: 400 },
      );
    }
    const user = await createUser(body.username, body.password, body.role);
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create user";
    const status =
      message.includes("already") ||
      message.includes("Invalid") ||
      message.includes("at least")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
