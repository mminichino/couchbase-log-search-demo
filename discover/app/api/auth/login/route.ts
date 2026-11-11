import { NextRequest, NextResponse } from "next/server";
import { login, setSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    const username = body.username?.trim() ?? "";
    const password = body.password ?? "";
    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 },
      );
    }
    const user = await login(username, password);
    const res = NextResponse.json({
      username: user.username,
      role: user.role,
    });
    setSessionCookie(res, user.sessionId);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    const status = message.includes("Invalid") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
