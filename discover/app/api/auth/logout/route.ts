import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  logout,
  sessionIdFromRequest,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await logout(sessionIdFromRequest(req));
  } catch {
    /* still clear cookie */
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
