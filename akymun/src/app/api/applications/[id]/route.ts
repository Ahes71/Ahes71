import { NextResponse } from "next/server";
import { findApplicationById } from "@/lib/apps";
import { getSessionUser, requirePerm } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

const ALLOWED = new Set(["bekliyor", "kabul", "red"]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const existing = await findApplicationById(id);
  if (!existing) {
    return NextResponse.json({ error: "Bulunamadı" }, { status: 404 });
  }

  if (typeof body.status === "string") {
    if (!requirePerm(user, "manage_applications")) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }
    if (!ALLOWED.has(body.status)) {
      return NextResponse.json({ error: "Geçersiz durum" }, { status: 400 });
    }
    const status = body.status;
    const prev = existing.status;
    let assignedCountry = existing.assignedCountry;
    let commission = existing.commission;
    let participantRole = existing.participantRole;
    let allowResubmit = existing.allowResubmit;

    if (status !== "kabul") {
      assignedCountry = "";
      commission = "";
      participantRole = "";
      if (prev === "kabul" || status === "red") allowResubmit = true;
    } else {
      allowResubmit = false;
    }

    await sql(
      `update applications set
        status = $2,
        decided_at = now(),
        decided_by = $3,
        assigned_country = $4,
        commission = $5,
        participant_role = $6,
        allow_resubmit = $7
       where id = $1`,
      [
        id,
        status,
        user?.username || "",
        assignedCountry,
        commission,
        participantRole,
        allowResubmit,
      ],
    );
  }

  if (
    body.assignedCountry !== undefined ||
    body.commission !== undefined ||
    body.participantRole !== undefined
  ) {
    if (!requirePerm(user, "assign_delegate")) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }
    const current = (await findApplicationById(id))!;
    if (current.status !== "kabul") {
      return NextResponse.json(
        { error: "Sadece kabul edilenlere atama yapılabilir" },
        { status: 400 },
      );
    }
    const country = String(body.assignedCountry ?? current.assignedCountry);
    const commission = String(body.commission ?? current.commission);
    const role = String(body.participantRole ?? current.participantRole);
    if (!country || !commission || !role) {
      return NextResponse.json(
        { error: "Ülke, komisyon ve rol zorunludur." },
        { status: 400 },
      );
    }
    await sql(
      `update applications set assigned_country = $2, commission = $3, participant_role = $4 where id = $1`,
      [id, country, commission, role],
    );
  }

  return NextResponse.json({ application: await findApplicationById(id) });
}
