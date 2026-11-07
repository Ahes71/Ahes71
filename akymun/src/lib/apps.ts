import { sql } from "./db";
import { normalizeEmail } from "./auth";

export type Application = {
  id: string;
  submittedAt: string;
  adSoyad: string;
  dogumTarihi: string;
  email: string;
  telefon: string;
  ingilizce: string;
  turkce: string;
  egitim: string;
  bolum: string;
  munDeneyimi: string;
  basariSertifika: string;
  taahhut: string;
  saglik: string;
  vatandaslik: string;
  kvkk: boolean;
  fotoVideoRiza: string;
  status: string;
  assignedCountry: string;
  commission: string;
  participantRole: string;
  decidedAt: string;
  decidedBy: string;
  allowResubmit: boolean;
};

type Row = {
  id: string;
  submitted_at: string | Date;
  ad_soyad: string;
  dogum_tarihi: string;
  email: string;
  telefon: string;
  ingilizce: string;
  turkce: string;
  egitim: string;
  bolum: string;
  mun_deneyimi: string;
  basari_sertifika: string;
  taahhut: string;
  saglik: string;
  vatandaslik: string;
  kvkk: boolean;
  foto_video_riza: string;
  status: string;
  assigned_country: string;
  commission: string;
  participant_role: string;
  decided_at: string | Date | null;
  decided_by: string;
  allow_resubmit: boolean;
};

function iso(v: string | Date | null | undefined): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export function mapApp(row: Row): Application {
  return {
    id: row.id,
    submittedAt: iso(row.submitted_at),
    adSoyad: row.ad_soyad,
    dogumTarihi: row.dogum_tarihi,
    email: row.email,
    telefon: row.telefon,
    ingilizce: row.ingilizce,
    turkce: row.turkce,
    egitim: row.egitim,
    bolum: row.bolum,
    munDeneyimi: row.mun_deneyimi,
    basariSertifika: row.basari_sertifika,
    taahhut: row.taahhut,
    saglik: row.saglik,
    vatandaslik: row.vatandaslik,
    kvkk: !!row.kvkk,
    fotoVideoRiza: row.foto_video_riza,
    status: row.status,
    assignedCountry: row.assigned_country || "",
    commission: row.commission || "",
    participantRole: row.participant_role || "",
    decidedAt: iso(row.decided_at),
    decidedBy: row.decided_by || "",
    allowResubmit: !!row.allow_resubmit,
  };
}

export async function listApplications(): Promise<Application[]> {
  const rows = await sql<Row>(
    `select * from applications order by submitted_at desc`,
  );
  return rows.map(mapApp);
}

export async function findApplicationByEmail(
  email: string,
): Promise<Application | null> {
  const rows = await sql<Row>(
    `select * from applications where lower(email) = lower($1) limit 1`,
    [normalizeEmail(email)],
  );
  return rows[0] ? mapApp(rows[0]) : null;
}

export async function findApplicationById(
  id: string,
): Promise<Application | null> {
  const rows = await sql<Row>(`select * from applications where id = $1`, [id]);
  return rows[0] ? mapApp(rows[0]) : null;
}
