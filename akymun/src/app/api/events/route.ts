import { NextResponse } from "next/server";
import { ensureOwner, getSessionUser, requirePerm, uid } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

type EventRow = {
  id: string;
  title: string;
  description: string;
  when_text: string;
};

function mapEvent(row: EventRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    when: row.when_text,
  };
}

export async function GET() {
  await ensureOwner();
  const rows = await sql<EventRow>(
    `select id, title, description, when_text from events order by created_at asc`,
  );
  return NextResponse.json({ events: rows.map(mapEvent) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!requirePerm(user, "manage_applications")) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    title?: string;
    description?: string;
    when?: string;
  } | null;
  const title = String(body?.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "Başlık gerekli" }, { status: 400 });
  }
  const id = uid("ev");
  await sql(
    `insert into events (id, title, description, when_text) values ($1,$2,$3,$4)`,
    [id, title, String(body?.description || ""), String(body?.when || "")],
  );
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
