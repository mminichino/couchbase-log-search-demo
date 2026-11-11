import { NextRequest, NextResponse } from "next/server";
import { isAuthUser, requireApiUser } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!isAuthUser(auth)) return auth;

  try {
    const body = (await req.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!body.currentPassword || !body.newPassword) {
      return NextResponse.json(
        { error: "currentPassword and newPassword are required" },
        { status: 400 },
      );
    }
    await changeOwnPassword(
      auth.username,
      body.currentPassword,
      body.newPassword,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Password change failed";
    const status =
      message.includes("incorrect") || message.includes("at least")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
