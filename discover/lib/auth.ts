import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { DocumentNotFoundError } from "./cb-sdk";
import { getCouchbase } from "./couchbase";
import {
  ensureBootstrapAdmin,
  getUser,
  PublicUser,
  Role,
  toPublicUser,
  verifyPassword,
} from "./users";

export const SESSION_COOKIE = "discover_session";
const SESSION_TTL_MS = 12 * 60 * 60_000;

export type SessionRecord = {
  sessionId: string;
  username: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
};

export type AuthUser = PublicUser & { sessionId: string };

function sessionKey(sessionId: string): string {
  return `session::${sessionId}`;
}

export async function login(
  username: string,
  password: string,
): Promise<AuthUser> {
  await ensureBootstrapAdmin();
  const user = await getUser(username);
  if (
    !user ||
    user.disabled ||
    !verifyPassword(password, user.passwordHash, user.passwordSalt)
  ) {
    throw new Error("Invalid username or password");
  }

  const sessionId = randomUUID();
  const now = Date.now();
  const record: SessionRecord = {
    sessionId,
    username: user.username,
    role: user.role,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };

  const { sessions } = await getCouchbase();
  await sessions.insert(sessionKey(sessionId), record, {
    expiry: Math.floor(SESSION_TTL_MS / 1000),
  });

  return { ...toPublicUser(user), sessionId };
}

export async function logout(sessionId: string | undefined): Promise<void> {
  if (!sessionId) return;
  const { sessions } = await getCouchbase();
  try {
    await sessions.remove(sessionKey(sessionId));
  } catch (err) {
    if (!(err instanceof DocumentNotFoundError)) throw err;
  }
}

export async function getSessionUser(
  sessionId: string | undefined,
): Promise<AuthUser | null> {
  if (!sessionId) return null;
  await ensureBootstrapAdmin();
  const { sessions } = await getCouchbase();
  try {
    const result = await sessions.get(sessionKey(sessionId));
    const session = result.content as SessionRecord;
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      try {
        await sessions.remove(sessionKey(sessionId));
      } catch {
        /* ignore */
      }
      return null;
    }
    const user = await getUser(session.username);
    if (!user || user.disabled) {
      try {
        await sessions.remove(sessionKey(sessionId));
      } catch {
        /* ignore */
      }
      return null;
    }
    return { ...toPublicUser(user), sessionId };
  } catch (err) {
    if (err instanceof DocumentNotFoundError) return null;
    throw err;
  }
}

export async function readSessionIdFromCookies(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}

export async function currentUser(): Promise<AuthUser | null> {
  return getSessionUser(await readSessionIdFromCookies());
}

function cookieSecure(): boolean {
  // Phase 10 serves HTTP via ClusterIP/port-forward; Phase 11 Ingress TLS can set DISCOVER_COOKIE_SECURE=true.
  return process.env.DISCOVER_COOKIE_SECURE === "true";
}

export function setSessionCookie(res: NextResponse, sessionId: string): void {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: sessionId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: cookieSecure(),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: cookieSecure(),
    maxAge: 0,
  });
}

export function sessionIdFromRequest(req: NextRequest): string | undefined {
  return req.cookies.get(SESSION_COOKIE)?.value;
}

export async function requireApiUser(
  req: NextRequest,
  opts?: { admin?: boolean },
): Promise<AuthUser | NextResponse> {
  try {
    const user = await getSessionUser(sessionIdFromRequest(req));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (opts?.admin && user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return user;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Auth error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export function isAuthUser(
  value: AuthUser | NextResponse,
): value is AuthUser {
  return !(value instanceof NextResponse);
}
