import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createSession, ensureOwner } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ROLE_PERMS } from "@/lib/roles";

export const runtime = "nodejs";

export async function POST(request: Request) {
  await ensureOwner();
  const body = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
  } | null;
  const username = String(body?.username || "")
    .trim()
    .toLowerCase();
  const password = String(body?.password || "");
  if (!username || !password) {
    return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
  }

  const rows = await sql<{
    id: string;
    username: string;
    name: string;
    role: string;
    password_hash: string;
    permissions: string[] | string;
  }>(`select * from users where lower(username) = $1 limit 1`, [username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return NextResponse.json(
      { error: "Kullanıcı adı veya şifre hatalı." },
      { status: 401 },
    );
  }

  await createSession(user.id);
  const permissions = Array.isArray(user.permissions)
    ? user.permissions
    : typeof user.permissions === "string"
      ? (JSON.parse(user.permissions) as string[])
      : ROLE_PERMS[user.role] || [];

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      permissions,
    },
  });
}
