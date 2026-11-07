create table if not exists users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  name text not null,
  role text not null,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists applications (
  id text primary key,
  submitted_at timestamptz not null default now(),
  ad_soyad text not null,
  dogum_tarihi text not null,
  email text not null,
  telefon text not null,
  ingilizce text not null,
  turkce text not null,
  egitim text not null,
  bolum text not null,
  mun_deneyimi text not null,
  basari_sertifika text not null,
  taahhut text not null,
  saglik text not null,
  vatandaslik text not null,
  kvkk boolean not null default false,
  foto_video_riza text not null,
  status text not null default 'bekliyor',
  assigned_country text not null default '',
  commission text not null default '',
  participant_role text not null default '',
  decided_at timestamptz,
  decided_by text not null default '',
  allow_resubmit boolean not null default false
);

create unique index if not exists applications_email_unique on applications (lower(email));

create table if not exists events (
  id text primary key,
  title text not null,
  description text not null default '',
  when_text text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
