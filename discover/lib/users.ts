import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { DocumentExistsError, DocumentNotFoundError } from "./cb-sdk";
import { getCouchbase } from "./couchbase";

export type Role = "admin" | "viewer";

export type UserRecord = {
  username: string;
  role: Role;
  passwordHash: string;
  passwordSalt: string;
  disabled?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = {
  username: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
};

function userKey(username: string): string {
  return `user::${username}`;
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function createPasswordHash(password: string): {
  passwordHash: string;
  passwordSalt: string;
} {
  const passwordSalt = randomBytes(16).toString("hex");
  return { passwordHash: hashPassword(password, passwordSalt), passwordSalt };
}

export function verifyPassword(
  password: string,
  passwordHash: string,
  passwordSalt: string,
): boolean {
  const next = Buffer.from(hashPassword(password, passwordSalt), "hex");
  const prev = Buffer.from(passwordHash, "hex");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    username: user.username,
    role: user.role,
    disabled: Boolean(user.disabled),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function ensureBootstrapAdmin(): Promise<void> {
  const adminPassword = process.env.DISCOVER_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error("Missing required env DISCOVER_ADMIN_PASSWORD");
  }
  const { users } = await getCouchbase();
  const now = new Date().toISOString();
  const { passwordHash, passwordSalt } = createPasswordHash(adminPassword);
  const doc: UserRecord = {
    username: "admin",
    role: "admin",
    passwordHash,
    passwordSalt,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await users.insert(userKey("admin"), doc);
  } catch (err) {
    if (err instanceof DocumentExistsError) return;
    throw err;
  }
}

export async function getUser(username: string): Promise<UserRecord | null> {
  const { users } = await getCouchbase();
  try {
    const result = await users.get(userKey(username));
    return result.content as UserRecord;
  } catch (err) {
    if (err instanceof DocumentNotFoundError) return null;
    throw err;
  }
}

export async function listUsers(): Promise<PublicUser[]> {
  const { cluster } = await getCouchbase();
  // `role` is a reserved word in SQL++ — always backtick it.
  const result = await cluster.query(
    "SELECT u.username, u.`role`, IFMISSINGORNULL(u.disabled, false) AS disabled, u.createdAt, u.updatedAt FROM `logs`.`discover`.`users` AS u ORDER BY u.username",
  );
  return (result.rows as PublicUser[]).map((u) => ({
    ...u,
    disabled: Boolean(u.disabled),
  }));
}

export async function createUser(
  username: string,
  password: string,
  role: Role,
): Promise<PublicUser> {
  if (!/^[a-zA-Z0-9._-]{2,64}$/.test(username)) {
    throw new Error("Invalid username");
  }
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  if (role !== "admin" && role !== "viewer") {
    throw new Error("Invalid role");
  }
  const { users } = await getCouchbase();
  const now = new Date().toISOString();
  const { passwordHash, passwordSalt } = createPasswordHash(password);
  const doc: UserRecord = {
    username,
    role,
    passwordHash,
    passwordSalt,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await users.insert(userKey(username), doc);
  } catch (err) {
    if (err instanceof DocumentExistsError) {
      throw new Error("User already exists");
    }
    throw err;
  }
  return toPublicUser(doc);
}

export async function updateUser(
  username: string,
  patch: { role?: Role; password?: string; disabled?: boolean },
): Promise<PublicUser> {
  const existing = await getUser(username);
  if (!existing) throw new Error("User not found");
  if (username === "admin" && patch.disabled === true) {
    throw new Error("Cannot disable the bootstrap admin user");
  }
  if (patch.role && patch.role !== "admin" && patch.role !== "viewer") {
    throw new Error("Invalid role");
  }
  if (patch.password && patch.password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const next: UserRecord = {
    ...existing,
    role: patch.role ?? existing.role,
    disabled:
      typeof patch.disabled === "boolean" ? patch.disabled : existing.disabled,
    updatedAt: new Date().toISOString(),
  };
  if (patch.password) {
    const hashed = createPasswordHash(patch.password);
    next.passwordHash = hashed.passwordHash;
    next.passwordSalt = hashed.passwordSalt;
  }

  const { users } = await getCouchbase();
  await users.replace(userKey(username), next);
  return toPublicUser(next);
}

export async function deleteUser(username: string): Promise<void> {
  if (username === "admin") {
    throw new Error("Cannot delete the bootstrap admin user");
  }
  const { users } = await getCouchbase();
  try {
    await users.remove(userKey(username));
  } catch (err) {
    if (err instanceof DocumentNotFoundError) {
      throw new Error("User not found");
    }
    throw err;
  }
}

export async function changeOwnPassword(
  username: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await getUser(username);
  if (!user) throw new Error("User not found");
  if (!verifyPassword(currentPassword, user.passwordHash, user.passwordSalt)) {
    throw new Error("Current password is incorrect");
  }
  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  await updateUser(username, { password: newPassword });
}

export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
