import { NextResponse } from "next/server";
import {
  findApplicationByEmail,
  listApplications,
} from "@/lib/apps";
import {
  ensureOwner,
  getSessionUser,
  normalizeEmail,
  requirePerm,
  uid,
} from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

function canVisitorSeeForm(app: {
  status: string;
  allowResubmit: boolean;
} | null): boolean {
  if (!app) return true;
  if (app.status === "kabul") return false;
  if (app.status === "red") return true;
  return !!app.allowResubmit;
}

function validateApp(data: Record<string, unknown>): string | null {
  if (!data.adSoyad) return "Ad-soyad zorunludur.";
  if (!data.dogumTarihi) return "Doğum tarihi zorunludur.";
  if (
    !data.email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email))
  ) {
    return "Geçerli bir e-posta giriniz.";
  }
  if (!data.telefon) return "Telefon numarası zorunludur.";
  if (!data.ingilizce) return "İngilizce seviyesi seçiniz.";
  if (!data.turkce) return "Türkçe seviyesi seçiniz.";
  if (!data.egitim) return "Eğitim bilgisi seçiniz.";
  if (!data.bolum) return "Bölüm bilgisi zorunludur.";
  if (!data.munDeneyimi) return "MUN deneyimi sorusunu yanıtlayınız.";
  if (!data.basariSertifika) return "Başarı/sertifika alanını doldurunuz.";
  if (!data.taahhut) return "Taahhüt sorusunu yanıtlayınız.";
  if (!data.saglik) return "Sağlık bilgisi alanını doldurunuz.";
  if (!data.vatandaslik) return "Vatandaşlık bilgisini giriniz.";
  if (!data.kvkk) return "KVKK aydınlatma metnini onaylamanız gerekir.";
  if (!data.fotoVideoRiza) {
    return "Fotoğraf/video açık rıza seçeneğini işaretleyiniz.";
  }
  return null;
}

export async function GET(request: Request) {
  await ensureOwner();
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  if (email) {
    const app = await findApplicationByEmail(email);
    return NextResponse.json({ application: app });
  }

  const user = await getSessionUser();
  if (!requirePerm(user, "view_applications")) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  return NextResponse.json({ applications: await listApplications() });
}

export async function POST(request: Request) {
  await ensureOwner();
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const data = {
    adSoyad: String(body.adSoyad || "").trim(),
    dogumTarihi: String(body.dogumTarihi || ""),
    email: normalizeEmail(String(body.email || "")),
    telefon: String(body.telefon || "").trim(),
    ingilizce: String(body.ingilizce || ""),
    turkce: String(body.turkce || ""),
    egitim: String(body.egitim || ""),
    bolum: String(body.bolum || "").trim(),
    munDeneyimi: String(body.munDeneyimi || ""),
    basariSertifika: String(body.basariSertifika || "").trim(),
    taahhut: String(body.taahhut || ""),
    saglik: String(body.saglik || "").trim(),
    vatandaslik: String(body.vatandaslik || "").trim(),
    kvkk: body.kvkk === true || body.kvkk === "on",
    fotoVideoRiza: String(body.fotoVideoRiza || ""),
  };

  const err = validateApp(data);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const existing = await findApplicationByEmail(data.email);
  if (existing && !canVisitorSeeForm(existing)) {
    return NextResponse.json(
      {
        error:
          "Bu e-posta ile başvurunuz zaten alınmıştır. Form yeniden doldurulamaz.",
        application: existing,
      },
      { status: 409 },
    );
  }

  if (existing) {
    await sql(
      `update applications set
        submitted_at = now(),
        ad_soyad = $2,
        dogum_tarihi = $3,
        telefon = $4,
        ingilizce = $5,
        turkce = $6,
        egitim = $7,
        bolum = $8,
        mun_deneyimi = $9,
        basari_sertifika = $10,
        taahhut = $11,
        saglik = $12,
        vatandaslik = $13,
        kvkk = $14,
        foto_video_riza = $15,
        status = 'bekliyor',
        allow_resubmit = false,
        assigned_country = '',
        commission = '',
        participant_role = '',
        decided_at = null,
        decided_by = ''
       where id = $1`,
      [
        existing.id,
        data.adSoyad,
        data.dogumTarihi,
        data.telefon,
        data.ingilizce,
        data.turkce,
        data.egitim,
        data.bolum,
        data.munDeneyimi,
        data.basariSertifika,
        data.taahhut,
        data.saglik,
        data.vatandaslik,
        data.kvkk,
        data.fotoVideoRiza,
      ],
    );
    const updated = await findApplicationByEmail(data.email);
    return NextResponse.json({ application: updated });
  }

  const id = uid("app");
  await sql(
    `insert into applications (
      id, ad_soyad, dogum_tarihi, email, telefon, ingilizce, turkce, egitim, bolum,
      mun_deneyimi, basari_sertifika, taahhut, saglik, vatandaslik, kvkk, foto_video_riza, status
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'bekliyor')`,
    [
      id,
      data.adSoyad,
      data.dogumTarihi,
      data.email,
      data.telefon,
      data.ingilizce,
      data.turkce,
      data.egitim,
      data.bolum,
      data.munDeneyimi,
      data.basariSertifika,
      data.taahhut,
      data.saglik,
      data.vatandaslik,
      data.kvkk,
      data.fotoVideoRiza,
    ],
  );
  const created = await findApplicationByEmail(data.email);
  return NextResponse.json({ application: created }, { status: 201 });
}
