# AKYMUN'26

Zonguldak Model United Nations başvuru ve organizasyon paneli.

Veriler Cursor Postgres veritabanında tutulur (`cursor-app.json` + `migrations/`).
Yerelde `DATABASE_URL` yokken PGlite kullanılır.

Yönetici ilk hesabı: kullanıcı adı `admin`, şifre `ADMIN_PASSWORD` secret değeri
(yerelde yoksa `change-me-local`).
