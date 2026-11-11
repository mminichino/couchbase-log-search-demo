import { NextRequest, NextResponse } from "next/server";
import { isAuthUser, requireApiUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (!isAuthUser(auth)) return auth;
  return NextResponse.json({
    username: auth.username,
    role: auth.role,
  });
}
