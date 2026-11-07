import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSessionUser, requirePerm, uid } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ROLE_PERMS } from "@/lib/roles";

export const runtime = "nodejs";

type UserRow = {
  id: string;
  username: string;
  name: string;
  role: string;
  permissions: string[] | string;
  created_at: string | Date;
};

function mapUser(row: UserRow) {
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
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!requirePerm(user, "manage_users")) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const rows = await sql<UserRow>(
    `select id, username, name, role, permissions, created_at from users order by created_at asc`,
  );
  return NextResponse.json({ users: rows.map(mapUser) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!requirePerm(user, "manage_users")) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    username?: string;
    password?: string;
    role?: string;
  } | null;
  const name = String(body?.name || "").trim();
  const username = String(body?.username || "")
    .trim()
    .toLowerCase();
  const password = String(body?.password || "");
  const role = String(body?.role || "editor");
  if (!name || !username || password.length < 4) {
    return NextResponse.json({ error: "Eksik veya kısa şifre" }, { status: 400 });
  }
  if (!ROLE_PERMS[role] || role === "owner") {
    return NextResponse.json({ error: "Geçersiz rol" }, { status: 400 });
  }
  const exists = await sql(
    `select id from users where lower(username) = $1`,
    [username],
  );
  if (exists.length) {
    return NextResponse.json({ error: "Bu kullanıcı adı zaten var." }, { status: 409 });
  }
  const id = uid("u");
  const hash = await bcrypt.hash(password, 10);
  await sql(
    `insert into users (id, username, password_hash, name, role, permissions)
     values ($1,$2,$3,$4,$5,$6::jsonb)`,
    [id, username, hash, name, role, JSON.stringify(ROLE_PERMS[role])],
  );
  return NextResponse.json({ ok: true, id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!requirePerm(user, "manage_users")) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  }
  const rows = await sql<{ role: string }>(
    `select role from users where id = $1`,
    [id],
  );
  if (!rows[0]) {
    return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
  }
  if (rows[0].role === "owner") {
    return NextResponse.json({ error: "Owner silinemez" }, { status: 400 });
  }
  await sql(`delete from users where id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
