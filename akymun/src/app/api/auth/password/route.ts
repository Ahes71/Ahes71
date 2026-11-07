import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSessionUser } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    current?: string;
    next?: string;
  } | null;
  const current = String(body?.current || "");
  const next = String(body?.next || "");
  if (next.length < 4) {
    return NextResponse.json({ error: "Şifre çok kısa." }, { status: 400 });
  }
  const rows = await sql<{ password_hash: string }>(
    `select password_hash from users where id = $1`,
    [user.id],
  );
  const row = rows[0];
  if (!row || !(await bcrypt.compare(current, row.password_hash))) {
    return NextResponse.json({ error: "Mevcut şifre hatalı." }, { status: 400 });
  }
  const hash = await bcrypt.hash(next, 10);
  await sql(`update users set password_hash = $2 where id = $1`, [
    user.id,
    hash,
  ]);
  return NextResponse.json({ ok: true });
}
