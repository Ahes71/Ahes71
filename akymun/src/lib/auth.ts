import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { sql } from "./db";
import { ROLE_PERMS, type SessionUser } from "./roles";

const COOKIE = "akymun_session";
const SESSION_DAYS = 14;

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function normalizeEmail(email: string): string {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export async function ensureOwner(): Promise<void> {
  const existing = await sql<{ id: string }>("select id from users limit 1");
  if (existing.length) return;

  const hasDb = Boolean(process.env.DATABASE_URL?.trim());
  const password =
    process.env.ADMIN_PASSWORD?.trim() ||
    (hasDb ? "" : "change-me-local");
  if (!password) return;

  const hash = await bcrypt.hash(password, 10);
  await sql(
    `insert into users (id, username, password_hash, name, role, permissions)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      uid("u"),
      "admin",
      hash,
      "Süper Yetkili",
      "owner",
      JSON.stringify(ROLE_PERMS.owner),
    ],
  );
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sql(
    `insert into sessions (token, user_id, expires_at) values ($1, $2, $3)`,
    [hashToken(token), userId, expires.toISOString()],
  );
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await sql(`delete from sessions where token = $1`, [hashToken(token)]);
  }
  jar.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  await ensureOwner();
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const rows = await sql<{
    id: string;
    username: string;
    name: string;
    role: string;
    permissions: string[] | string;
  }>(
    `select u.id, u.username, u.name, u.role, u.permissions
     from sessions s
     join users u on u.id = s.user_id
     where s.token = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;
  const permissions = Array.isArray(row.permissions)
    ? row.permissions
    : typeof row.permissions === "string"
      ? (JSON.parse(row.permissions) as string[])
      : ROLE_PERMS[row.role] || [];
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    permissions,
  };
}

export function requirePerm(user: SessionUser | null, perm: string): boolean {
  return !!user && Array.isArray(user.permissions) && user.permissions.includes(perm);
}
