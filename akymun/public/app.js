/**
 * AKYMUN'26 — başvuru, kabul/red, ülke-rol atama, etkinlik alanı, yetkili paneli
 */

const STORAGE = {
  visitorEmail: 'akymun26_visitor_email',
  participantEmail: 'akymun26_participant_email',
};

const cache = {
  apps: [],
  users: [],
  events: [],
  session: null,
  ready: false,
};

const ROLE_PERMS = {
  viewer: ['view_applications'],
  editor: ['view_applications', 'export', 'manage_applications', 'assign_delegate'],
  admin: ['view_applications', 'export', 'manage_applications', 'assign_delegate', 'manage_users'],
  owner: ['view_applications', 'export', 'manage_applications', 'assign_delegate', 'manage_users'],
};

const ROLE_LABELS = {
  viewer: 'Görüntüleyici',
  editor: 'Editör',
  admin: 'Admin',
  owner: 'Süper Yetkili',
};

const STATUS = {
  pending: 'bekliyor',
  accepted: 'kabul',
  rejected: 'red',
};

const STATUS_LABELS = {
  bekliyor: 'Bekliyor',
  kabul: 'Kabul edildi',
  red: 'Reddedildi',
};

const DELEGATE_ROLES = [
  'Delegasyon',
  'Başkan',
  'Başkan Yardımcısı',
  'Raportör',
  'Gözlemci',
  'Basın Ekibi',
  'Kriz Ekibi',
];

const COUNTRIES = [
  'Türkiye', 'Almanya', 'Amerika Birleşik Devletleri', 'Arjantin', 'Avustralya', 'Avusturya',
  'Belçika', 'Brezilya', 'Birleşik Krallık', 'Çin', 'Danimarka', 'Finlandiya', 'Fransa',
  'Güney Afrika', 'Güney Kore', 'Hindistan', 'Hollanda', 'İspanya', 'İsveç', 'İsviçre',
  'İtalya', 'Japonya', 'Kanada', 'Meksika', 'Mısır', 'Norveç', 'Polonya', 'Portekiz',
  'Rusya', 'Suudi Arabistan', 'Ukrayna', 'Birleşmiş Arap Emirlikleri', 'Yunanistan',
];

const COMMISSIONS = [
  'Birleşmiş Milletler Genel Kurulu (GA)',
  'Güvenlik Konseyi (UNSC)',
  'Ekonomik ve Sosyal Konsey (ECOSOC)',
  'İnsan Hakları Konseyi (UNHRC)',
  'Uluslararası Adalet Divanı (ICJ)',
  'UNESCO',
  'WHO',
  'Kriz Komitesi',
];


function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function api(path, opts = {}) {
  const init = {
    credentials: 'same-origin',
    headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
    method: opts.method || (opts.body ? 'POST' : 'GET'),
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'İstek başarısız');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function bootstrap() {
  const me = await api('/api/auth/me');
  cache.session = me.user || null;
  const ev = await api('/api/events');
  cache.events = ev.events || [];
  if (cache.session) {
    try {
      const apps = await api('/api/applications');
      cache.apps = apps.applications || [];
    } catch {
      cache.apps = [];
    }
    if (hasPerm('manage_users')) {
      try {
        const users = await api('/api/users');
        cache.users = users.users || [];
      } catch {
        cache.users = [];
      }
    }
  }
  cache.ready = true;
}

async function refreshApps() {
  if (!cache.session) return;
  const apps = await api('/api/applications');
  cache.apps = apps.applications || [];
}

async function refreshUsers() {
  if (!hasPerm('manage_users')) return;
  const users = await api('/api/users');
  cache.users = users.users || [];
}

function getApps() {
  return cache.apps;
}

function getUsers() {
  return cache.users;
}

function getEvents() {
  return cache.events;
}

function getSession() {
  return cache.session;
}

function setSession(user) {
  cache.session = user
    ? {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        permissions:
          user.role && ROLE_PERMS[user.role]
            ? ROLE_PERMS[user.role].slice()
            : user.permissions || [],
      }
    : null;
}

function hasPerm(perm) {
  const s = getSession();
  return s && Array.isArray(s.permissions) && s.permissions.includes(perm);
}

function findAppByEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return null;
  return getApps().find((a) => normalizeEmail(a.email) === e) || null;
}

async function fetchAppByEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return null;
  const data = await api(`/api/applications?email=${encodeURIComponent(e)}`);
  const app = data.application || null;
  if (app) {
    const idx = cache.apps.findIndex((a) => a.id === app.id);
    if (idx >= 0) cache.apps[idx] = app;
    else cache.apps.unshift(app);
  }
  return app;
}

function isReadyForEvents(app) {
  return (
    app &&
    app.status === STATUS.accepted &&
    !!app.assignedCountry &&
    !!app.commission &&
    !!app.participantRole
  );
}

function logoSvg(size = 120) {
  // Resmi profil logosu (Downloads / Instagram tarzı)
  return `<img class="brand-mark brand-photo" src="assets/logo-profile.jpeg" width="${size}" height="${size}" alt="AKYMUN'26" />`;
}

function fillLogos(root = document) {
  root.querySelectorAll('[data-logo]').forEach((el) => {
    el.innerHTML = logoSvg(el.dataset.logo === 'hero' ? 120 : 48);
  });
}

function countryOptionsHtml(selected) {
  return COUNTRIES.map(
    (c) => `<option value="${escapeHtml(c)}" ${c === selected ? 'selected' : ''}>${escapeHtml(c)}</option>`
  ).join('');
}

function commissionOptionsHtml(selected) {
  return COMMISSIONS.map(
    (c) => `<option value="${escapeHtml(c)}" ${c === selected ? 'selected' : ''}>${escapeHtml(c)}</option>`
  ).join('');
}

function delegateRoleOptionsHtml(selected) {
  return DELEGATE_ROLES.map(
    (r) => `<option value="${escapeHtml(r)}" ${r === selected ? 'selected' : ''}>${escapeHtml(r)}</option>`
  ).join('');
}

/* —— Routing —— */
function route() {
  const hash = (location.hash || '#/').replace(/^#/, '') || '/';
  const isAdmin = hash.startsWith('/yonetim') || hash.startsWith('/admin');
  const isParticipant = hash.startsWith('/katilimci');

  document.getElementById('public-app')?.classList.toggle('hidden', isAdmin || isParticipant);
  document.getElementById('admin-app')?.classList.toggle('hidden', !isAdmin);
  document.getElementById('participant-app')?.classList.toggle('hidden', !isParticipant);
  document.body.classList.toggle('admin-mode', isAdmin || isParticipant);

  if (isAdmin) {
    hideSuccess();
    renderAdmin();
  } else if (isParticipant) {
    hideSuccess();
    renderParticipant();
  } else {
    refreshPublicState();
  }
}

/* —— Public form —— */
function collectForm(form) {
  const fd = new FormData(form);
  return {
    id: uid('app'),
    submittedAt: new Date().toISOString(),
    adSoyad: (fd.get('adSoyad') || '').toString().trim(),
    dogumTarihi: (fd.get('dogumTarihi') || '').toString(),
    email: normalizeEmail(fd.get('email')),
    telefon: (fd.get('telefon') || '').toString().trim(),
    ingilizce: (fd.get('ingilizce') || '').toString(),
    turkce: (fd.get('turkce') || '').toString(),
    egitim: (fd.get('egitim') || '').toString(),
    bolum: (fd.get('bolum') || '').toString().trim(),
    munDeneyimi: (fd.get('munDeneyimi') || '').toString(),
    basariSertifika: (fd.get('basariSertifika') || '').toString().trim(),
    taahhut: (fd.get('taahhut') || '').toString(),
    saglik: (fd.get('saglik') || '').toString().trim(),
    vatandaslik: (fd.get('vatandaslik') || '').toString().trim(),
    kvkk: fd.get('kvkk') === 'on',
    fotoVideoRiza: (fd.get('fotoVideoRiza') || '').toString(),
    status: STATUS.pending,
    assignedCountry: '',
    commission: '',
    participantRole: '',
    decidedAt: '',
    decidedBy: '',
  };
}

function validateApp(data) {
  if (!data.adSoyad) return 'Ad-soyad zorunludur.';
  if (!data.dogumTarihi) return 'Doğum tarihi zorunludur.';
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Geçerli bir e-posta giriniz.';
  if (!data.telefon) return 'Telefon numarası zorunludur.';
  if (!data.ingilizce) return 'İngilizce seviyesi seçiniz.';
  if (!data.turkce) return 'Türkçe seviyesi seçiniz.';
  if (!data.egitim) return 'Eğitim bilgisi seçiniz.';
  if (!data.bolum) return 'Bölüm bilgisi zorunludur.';
  if (!data.munDeneyimi) return 'MUN deneyimi sorusunu yanıtlayınız.';
  if (!data.basariSertifika) return 'Başarı/sertifika alanını doldurunuz.';
  if (!data.taahhut) return 'Taahhüt sorusunu yanıtlayınız.';
  if (!data.saglik) return 'Sağlık bilgisi alanını doldurunuz.';
  if (!data.vatandaslik) return 'Vatandaşlık bilgisini giriniz.';
  if (!data.kvkk) return 'KVKK aydınlatma metnini onaylamanız gerekir.';
  if (!data.fotoVideoRiza) return 'Fotoğraf/video açık rıza seçeneğini işaretleyiniz.';
  return null;
}

function showSuccess() {
  document.getElementById('success-overlay')?.classList.remove('hidden');
}

function hideSuccess() {
  document.getElementById('success-overlay')?.classList.add('hidden');
}

function canVisitorSeeForm(app) {
  if (!app) return true;
  if (app.status === STATUS.accepted) return false;
  if (app.status === STATUS.rejected) return true;
  // bekliyor: kabul geri alındıysa formu tekrar aç
  return !!app.allowResubmit;
}

async function refreshPublicState() {
  const form = document.getElementById('basvuru-form');
  const banner = document.getElementById('already-applied');
  const cta = document.getElementById('btn-basvuru-scroll');
  if (!form || !banner) return;

  const remembered = normalizeEmail(localStorage.getItem(STORAGE.visitorEmail) || '');
  const existing = remembered ? await fetchAppByEmail(remembered) : null;
  const showForm = canVisitorSeeForm(existing);

  if (existing && !showForm) {
    form.classList.add('hidden');
    banner.classList.remove('hidden');
    const statusEl = document.getElementById('already-status');
    const extraEl = document.getElementById('already-extra');
    if (statusEl) statusEl.textContent = STATUS_LABELS[existing.status] || existing.status;
    if (extraEl) {
      if (existing.status === STATUS.accepted) {
        extraEl.innerHTML = `Başvurunuz kabul edildi. Atamalarınız ve etkinlikler için <a href="#/katilimci">katılımcı paneline</a> gidin.`;
      } else {
        extraEl.textContent = 'Başvurunuz inceleme bekliyor. Aynı e-posta ile tekrar başvuru yapılamaz.';
      }
    }
    if (cta) cta.textContent = 'Başvuru durumum';
  } else {
    form.classList.remove('hidden');
    banner.classList.add('hidden');
    if (cta) cta.textContent = 'Başvuruya geç';
    if (existing?.status === STATUS.rejected) {
      // reddedilmiş: form üstünde kısa uyarı
      banner.classList.remove('hidden');
      banner.querySelector('h3') && (banner.querySelector('h3').textContent = 'Başvurunuz reddedilmişti');
      const statusEl = document.getElementById('already-status');
      const extraEl = document.getElementById('already-extra');
      if (statusEl) statusEl.textContent = 'Reddedildi — yeniden başvurabilirsiniz';
      if (extraEl) extraEl.textContent = 'Aşağıdaki formu doldurarak tekrar başvurabilirsiniz.';
    } else if (existing?.allowResubmit) {
      banner.classList.remove('hidden');
      banner.querySelector('h3') && (banner.querySelector('h3').textContent = 'Başvuru durumu güncellendi');
      const statusEl = document.getElementById('already-status');
      const extraEl = document.getElementById('already-extra');
      if (statusEl) statusEl.textContent = 'Tekrar başvuru açık';
      if (extraEl) extraEl.textContent = 'Kabulünüz geri alındı. Formu yeniden doldurabilirsiniz.';
    }
  }
}

async function initPublic() {
  fillLogos();

  const form = document.getElementById('basvuru-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = collectForm(form);
    const err = validateApp(data);
    if (err) {
      alert(err);
      return;
    }
    try {
      await api('/api/applications', { method: 'POST', body: data });
      localStorage.setItem(STORAGE.visitorEmail, data.email);
      form.reset();
      const h3 = document.querySelector('#already-applied h3');
      if (h3) h3.textContent = 'Başvurunuz zaten alınmıştır';
      showSuccess();
      await refreshPublicState();
    } catch (err) {
      if (err.status === 409) {
        localStorage.setItem(STORAGE.visitorEmail, data.email);
        alert(err.message);
        await refreshPublicState();
        document.getElementById('already-applied')?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      alert(err.message || 'Başvuru kaydedilemedi.');
    }
  });

  document.getElementById('btn-clear-form')?.addEventListener('click', () => {
    if (confirm('Formu temizlemek istediğinize emin misiniz?')) form.reset();
  });

  document.getElementById('btn-success-ok')?.addEventListener('click', hideSuccess);
  document.getElementById('btn-basvuru-scroll')?.addEventListener('click', () => {
    document.getElementById('basvuru')?.scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('btn-org-scroll')?.addEventListener('click', () => {
    document.getElementById('komisyonlar')?.scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('btn-media-scroll')?.addEventListener('click', () => {
    document.getElementById('tanitim')?.scrollIntoView({ behavior: 'smooth' });
  });

  // E-posta alanında anında kontrol
  form?.elements.namedItem('email')?.addEventListener('blur', async (e) => {
    const email = normalizeEmail(e.target.value);
    if (!email) return;
    try {
      const app = await fetchAppByEmail(email);
      if (app && !canVisitorSeeForm(app)) {
        localStorage.setItem(STORAGE.visitorEmail, email);
        alert('Bu e-posta ile başvurunuz zaten alınmıştır.');
        await refreshPublicState();
      }
    } catch {
      /* ignore */
    }
  });

  await refreshPublicState();
}

/* —— Participant portal —— */
function getParticipantEmail() {
  return normalizeEmail(localStorage.getItem(STORAGE.participantEmail) || '');
}

function setParticipantEmail(email) {
  if (!email) localStorage.removeItem(STORAGE.participantEmail);
  else localStorage.setItem(STORAGE.participantEmail, normalizeEmail(email));
}

function renderParticipant() {
  const root = document.getElementById('participant-content');
  if (!root) return;
  const email = getParticipantEmail();
  const app = email ? findAppByEmail(email) : null;

  if (!app || app.status !== STATUS.accepted) {
    root.innerHTML = `
      <div class="login-card" style="margin:2rem auto">
        <div style="text-align:center;margin-bottom:0.75rem" data-logo="nav"></div>
        <h1>Katılımcı Girişi</h1>
        <p class="sub">Kabul edilen başvurunuzdaki e-posta ile giriş yapın.</p>
        <p id="part-login-error" class="login-error hidden"></p>
        <form id="participant-login-form">
          <div class="field" style="border:none;padding-bottom:0">
            <label class="q" for="part-email">E-posta</label>
            <input id="part-email" name="email" type="email" required value="${escapeHtml(email)}" />
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%">Giriş</button>
        </form>
        <p style="text-align:center;margin:1rem 0 0"><a href="#/">← Ana sayfa</a></p>
      </div>`;
    fillLogos(root);
    document.getElementById('participant-login-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const em = normalizeEmail(new FormData(e.target).get('email'));
      const found = findAppByEmail(em);
      const err = document.getElementById('part-login-error');
      if (!found) {
        err.textContent = 'Bu e-posta ile başvuru bulunamadı.';
        err.classList.remove('hidden');
        return;
      }
      if (found.status !== STATUS.accepted) {
        err.textContent =
          found.status === STATUS.rejected
            ? 'Başvurunuz reddedilmiş.'
            : 'Başvurunuz henüz kabul edilmedi.';
        err.classList.remove('hidden');
        return;
      }
      setParticipantEmail(em);
      localStorage.setItem(STORAGE.visitorEmail, em);
      renderParticipant();
    });
    return;
  }

  const events = getEvents();
  const ready = isReadyForEvents(app);

  root.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div data-logo="nav"></div>
        <div class="brand-text"><strong>AKYMUN'26</strong><span>Katılımcı</span></div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" id="btn-part-logout">Çıkış</button>
    </header>
    <main class="page-main">
      <section class="form-card" style="margin-bottom:1.25rem">
        <header>
          <h2>Hoş geldiniz</h2>
          <p>Durumunuz: <span class="badge badge-ok">Kabul edildi</span></p>
        </header>
        <p class="info-note">Ülke, komisyon ve rol atamaları yalnızca organizasyon tarafından yapılır. Aşağıda size atanan bilgiler görünür.</p>
        <div class="detail-grid" style="padding:0">
          <div class="detail-row"><dt>Ad Soyad</dt><dd>${escapeHtml(app.adSoyad)}</dd></div>
          <div class="detail-row"><dt>E-posta</dt><dd>${escapeHtml(app.email)}</dd></div>
          <div class="detail-row"><dt>Temsil edilen ülke</dt><dd>${escapeHtml(app.assignedCountry || 'Organizasyon atayacak')}</dd></div>
          <div class="detail-row"><dt>Komisyon</dt><dd>${escapeHtml(app.commission || 'Organizasyon atayacak')}</dd></div>
          <div class="detail-row"><dt>Rol</dt><dd>${escapeHtml(app.participantRole || 'Organizasyon atayacak')}</dd></div>
        </div>
      </section>

      <section class="form-card" id="events-section">
        <header>
          <h2>Etkinlikler</h2>
          <p>Ülke, komisyon ve rolü atanmış katılımcılara özel alan. İçerik sonradan eklenecek.</p>
        </header>
        ${
          ready
            ? events.length
              ? `<div class="events-grid">${events
                  .map(
                    (ev) => `
                <article class="event-card">
                  <h3>${escapeHtml(ev.title || 'Etkinlik')}</h3>
                  <p>${escapeHtml(ev.description || '')}</p>
                  <span class="hint">${escapeHtml(ev.when || '')}</span>
                </article>`
                  )
                  .join('')}</div>`
              : `<div class="empty events-placeholder">
                  <strong>Etkinlik şablonu</strong>
                  <p>Burada konferans etkinlikleri listelenecek. Şimdilik içerik yok — organizasyon ekibi daha sonra ekleyecek.</p>
                  <ul class="template-list">
                    <li>Açılış oturumu — yakında</li>
                    <li>Komite çalışmaları — yakında</li>
                    <li>Sosyal etkinlik — yakında</li>
                  </ul>
                </div>`
            : `<div class="empty">Etkinliklere erişmek için organizasyonun <b>ülke</b>, <b>komisyon</b> ve <b>rol</b> ataması gerekir.
                ${!app.assignedCountry ? '<br>→ Ülke henüz atanmadı.' : ''}
                ${!app.commission ? '<br>→ Komisyon henüz atanmadı.' : ''}
                ${!app.participantRole ? '<br>→ Rol henüz atanmadı.' : ''}
              </div>`
        }
      </section>
      <p style="text-align:center;margin:1.5rem 0"><a href="#/">← Ana sayfa</a></p>
    </main>`;

  fillLogos(root);

  document.getElementById('btn-part-logout')?.addEventListener('click', () => {
    setParticipantEmail('');
    renderParticipant();
  });
}

/* —— Admin —— */
function renderAdmin() {
  const session = getSession();
  const loginView = document.getElementById('admin-login-view');
  const shellView = document.getElementById('admin-shell-view');
  fillLogos(document.getElementById('admin-app') || document);
  if (!session) {
    loginView.classList.remove('hidden');
    shellView.classList.add('hidden');
    return;
  }
  loginView.classList.add('hidden');
  shellView.classList.remove('hidden');

  const panel = (location.hash.split('?')[0].replace(/^#/, '') || '/yonetim').replace(/\/admin/, '/yonetim');
  let page = 'basvurular';
  if (panel.includes('/yetkililer')) page = 'yetkililer';
  if (panel.includes('/kabul')) page = 'kabul';
  if (panel.includes('/ayarlar')) page = 'ayarlar';

  document.querySelectorAll('.nav-btn[data-page]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  const content = document.getElementById('admin-content');
  if (page === 'basvurular') content.innerHTML = renderApplicationsPanel();
  else if (page === 'kabul') content.innerHTML = renderAcceptedPanel();
  else if (page === 'yetkililer') content.innerHTML = renderUsersPanel();
  else content.innerHTML = renderSettingsPanel();

  bindAdminContent(page);
}

function statusBadge(status) {
  const cls =
    status === STATUS.accepted ? 'badge-ok' : status === STATUS.rejected ? 'badge-bad' : 'badge-wait';
  return `<span class="badge ${cls}">${escapeHtml(STATUS_LABELS[status] || status)}</span>`;
}

function renderApplicationsPanel() {
  if (!hasPerm('view_applications')) {
    return `<div class="empty">Bu paneli görüntüleme yetkiniz yok.</div>`;
  }
  const apps = getApps();
  const pending = apps.filter((a) => a.status === STATUS.pending).length;
  const accepted = apps.filter((a) => a.status === STATUS.accepted).length;
  const rejected = apps.filter((a) => a.status === STATUS.rejected).length;

  const stats = `
    <div class="stats">
      <div class="stat"><b>${apps.length}</b><span>Toplam</span></div>
      <div class="stat"><b>${pending}</b><span>Bekliyor</span></div>
      <div class="stat"><b>${accepted}</b><span>Kabul</span></div>
      <div class="stat"><b>${rejected}</b><span>Red</span></div>
    </div>`;

  if (!apps.length) {
    return `${stats}<div class="panel"><div class="empty">Henüz başvuru yok.</div></div>`;
  }

  const canDecide = hasPerm('manage_applications');
  const rows = apps
    .map((a) => {
      const statusControl = canDecide
        ? `<select class="status-select" data-status-app="${a.id}" aria-label="Durum değiştir">
            <option value="${STATUS.pending}" ${a.status === STATUS.pending ? 'selected' : ''}>Bekliyor</option>
            <option value="${STATUS.accepted}" ${a.status === STATUS.accepted ? 'selected' : ''}>Kabul edildi</option>
            <option value="${STATUS.rejected}" ${a.status === STATUS.rejected ? 'selected' : ''}>Reddedildi</option>
          </select>`
        : statusBadge(a.status);
      return `
    <tr>
      <td>${escapeHtml(formatDate(a.submittedAt))}</td>
      <td>${escapeHtml(a.adSoyad)}</td>
      <td>${escapeHtml(a.email)}</td>
      <td>${escapeHtml(a.assignedCountry || '—')}</td>
      <td>${escapeHtml(a.commission || '—')}</td>
      <td>${statusControl}</td>
      <td class="actions-cell">
        <button type="button" class="btn btn-ghost btn-sm" data-view-app="${a.id}">Detay</button>
        ${
          canDecide
            ? `${a.status !== STATUS.accepted ? `<button type="button" class="btn btn-ok btn-sm" data-set-status="${a.id}" data-to="${STATUS.accepted}">Kabul et</button>` : ''}
               ${a.status !== STATUS.rejected ? `<button type="button" class="btn btn-danger btn-sm" data-set-status="${a.id}" data-to="${STATUS.rejected}">Reddet</button>` : ''}
               ${a.status !== STATUS.pending ? `<button type="button" class="btn btn-ghost btn-sm" data-set-status="${a.id}" data-to="${STATUS.pending}">Beklet</button>` : ''}`
            : ''
        }
      </td>
    </tr>`;
    })
    .join('');

  return `
    <div class="admin-header">
      <h2>Başvurular</h2>
      <div class="toolbar">
        ${hasPerm('export') ? `
          <button type="button" class="btn btn-ghost btn-sm" id="btn-export-json">JSON indir</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-export-csv">CSV indir</button>
        ` : ''}
      </div>
    </div>
    ${stats}
    <p class="hint" style="margin:-0.35rem 0 1rem">Durumu istediğiniz an değiştirebilirsiniz (bekliyor ↔ kabul ↔ red). Kayıt anında güncellenir.</p>
    <div class="panel table-wrap">
      <table>
        <thead>
          <tr><th>Tarih</th><th>Ad Soyad</th><th>E-posta</th><th>Ülke</th><th>Komisyon</th><th>Durum</th><th>İşlem</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div id="app-detail" class="panel hidden" style="margin-top:1rem"></div>
  `;
}

function appDetailHtml(a) {
  const rows = [
    ['Başvuru ID', a.id],
    ['Gönderim', formatDate(a.submittedAt)],
    ['Ad-Soyad', a.adSoyad],
    ['Doğum Tarihi', a.dogumTarihi],
    ['E-posta', a.email],
    ['Telefon', a.telefon],
    ['İngilizce', a.ingilizce],
    ['Türkçe', a.turkce],
    ['Eğitim', a.egitim],
    ['Bölüm', a.bolum],
    ['MUN deneyimi', a.munDeneyimi],
    ['Başarı / sertifika', a.basariSertifika],
    ['Taahhüt', a.taahhut],
    ['Sağlık', a.saglik],
    ['Vatandaşlık', a.vatandaslik],
    ['KVKK onayı', a.kvkk ? 'Evet' : 'Hayır'],
    ['Foto/video rıza', a.fotoVideoRiza],
    ['Durum', STATUS_LABELS[a.status] || a.status],
    ['Temsil edilen ülke', a.assignedCountry || '—'],
    ['Komisyon', a.commission || '—'],
    ['Katılımcı rolü', a.participantRole || '—'],
  ]
    .map(
      ([k, v]) => `<div class="detail-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v ?? ''))}</dd></div>`
    )
    .join('');

  return `
    <div class="admin-header" style="padding:1rem 1.25rem 0;margin:0">
      <h2 style="font-size:1.4rem">Başvuru detayı</h2>
      <button type="button" class="btn btn-ghost btn-sm" id="btn-close-detail">Kapat</button>
    </div>
    <dl class="detail-grid">${rows}</dl>
  `;
}

function renderAcceptedPanel() {
  if (!hasPerm('view_applications')) {
    return `<div class="empty">Bu paneli görüntüleme yetkiniz yok.</div>`;
  }
  const accepted = getApps().filter((a) => a.status === STATUS.accepted);
  const canAssign = hasPerm('assign_delegate');

  if (!accepted.length) {
    return `
      <div class="admin-header"><h2>Kabul edilenler</h2></div>
      <div class="panel"><div class="empty">Henüz kabul edilen başvuru yok. Başvurular sekmesinden kabul edin.</div></div>`;
  }

  const cards = accepted
    .map(
      (a) => `
    <article class="assign-card" data-app-id="${a.id}">
      <div class="assign-head">
        <strong>${escapeHtml(a.adSoyad)}</strong>
        <span>${escapeHtml(a.email)}</span>
        <div class="assign-meta">
          <span><b>Ülke:</b> ${escapeHtml(a.assignedCountry || 'Atanmadı')}</span>
          <span><b>Komisyon:</b> ${escapeHtml(a.commission || 'Atanmadı')}</span>
        </div>
      </div>
      <form class="assign-form" data-assign="${a.id}">
        <label class="q">Temsil edilen ülke ${canAssign ? '' : '(salt okunur)'}</label>
        <select name="country" ${canAssign ? '' : 'disabled'} required>
          <option value="">Seçiniz…</option>
          ${countryOptionsHtml(a.assignedCountry)}
        </select>
        <label class="q">Komisyon</label>
        <select name="commission" ${canAssign ? '' : 'disabled'} required>
          <option value="">Seçiniz…</option>
          ${commissionOptionsHtml(a.commission)}
        </select>
        <label class="q">Rol</label>
        <select name="role" ${canAssign ? '' : 'disabled'} required>
          <option value="">Seçiniz…</option>
          ${delegateRoleOptionsHtml(a.participantRole)}
        </select>
        ${
          canAssign
            ? `<button type="submit" class="btn btn-primary btn-sm">Atamayı kaydet</button>`
            : ''
        }
        <p class="hint" style="margin:0.35rem 0 0">
          ${isReadyForEvents(a) ? 'Etkinlik erişimi açık' : 'Etkinlik için ülke + komisyon + rol gerekli'}
        </p>
      </form>
    </article>`
    )
    .join('');

  return `
    <div class="admin-header">
      <h2>Kabul edilenler</h2>
      <p style="margin:0;color:var(--muted);font-size:0.9rem">Ülke, komisyon ve rolü yalnızca yetkililer atar. Katılımcılar seçim yapamaz.</p>
    </div>
    <div class="assign-grid">${cards}</div>
  `;
}

function renderUsersPanel() {
  if (!hasPerm('manage_users')) {
    return `<div class="empty">Yetkili yönetimi için izniniz yok.</div>`;
  }
  const users = getUsers();
  const rows = users
    .map((u) => {
      const perms = (ROLE_PERMS[u.role] || u.permissions || []).join(', ');
      return `
    <tr>
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(ROLE_LABELS[u.role] || u.role)}</td>
      <td style="white-space:normal;max-width:280px;font-size:0.8rem">${escapeHtml(perms)}</td>
      <td>
        ${u.role === 'owner' ? '—' : `<button type="button" class="btn btn-danger btn-sm" data-remove-user="${u.id}">Çıkar</button>`}
      </td>
    </tr>`;
    })
    .join('');

  return `
    <div class="admin-header"><h2>Yetkililer</h2></div>
    <div class="panel">
      <form class="user-form" id="add-user-form">
        <p style="margin:0;color:var(--muted);font-size:0.9rem">
          Rol seçince izinler otomatik gelir:
          <b>Görüntüleyici</b> = sadece görüntüle ·
          <b>Editör</b> = görüntüle + dışa aktar + kabul/red + atama ·
          <b>Admin</b> = hepsi + yetkili yönet
        </p>
        <div class="row">
          <div>
            <label class="q">Ad Soyad</label>
            <input name="name" required placeholder="Ad Soyad" />
          </div>
          <div>
            <label class="q">Kullanıcı adı</label>
            <input name="username" required placeholder="kullanici" autocomplete="off" />
          </div>
        </div>
        <div class="row">
          <div>
            <label class="q">Şifre</label>
            <input name="password" type="password" required minlength="4" autocomplete="new-password" />
          </div>
          <div>
            <label class="q">Rol</label>
            <select name="role" id="role-select">
              <option value="viewer">Görüntüleyici</option>
              <option value="editor" selected>Editör</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div>
          <label class="q">Rol izinleri (otomatik)</label>
          <div class="perms" id="role-perms-preview"></div>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Yetkili ekle</button>
      </form>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ad</th><th>Kullanıcı</th><th>Rol</th><th>İzinler</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSettingsPanel() {
  return `
    <div class="admin-header"><h2>Ayarlar</h2></div>
    <div class="panel" style="padding:1.25rem">
      <p style="margin:0 0 0.75rem;color:var(--cream-dim)">Veriler Cursor Postgres veritabanında saklanır; tüm cihazlarda ortaktır.</p>
      <ul style="color:var(--muted);font-size:0.9rem">
        <li>Yönetici girişi: <b style="color:var(--gold-400)">admin</b> (şifre yayın ayarındaki <b>ADMIN_PASSWORD</b>)</li>
        <li>Başvurular varsayılan <b>bekliyor</b>; istediğiniz an kabul/red verebilirsiniz.</li>
        <li>Kabul edilenlere ülke, komisyon ve rol atanınca etkinlik alanına erişirler.</li>
      </ul>
      <div class="toolbar" style="margin-top:1rem">
        <button type="button" class="btn btn-ghost btn-sm" id="btn-change-password">Şifremi değiştir</button>
        <a class="btn btn-ghost btn-sm" href="#/">← Ana sayfa</a>
      </div>
    </div>
  `;
}

async function updateAppStatus(id, status) {
  const apps = getApps();
  const idx = apps.findIndex((a) => a.id === id);
  if (idx < 0) return false;
  if (apps[idx].status === status) return false;
  const data = await api(`/api/applications/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status },
  });
  if (data.application) {
    cache.apps[idx] = data.application;
  } else {
    await refreshApps();
  }
  try {
    window.dispatchEvent(new CustomEvent('akymun-apps-changed'));
  } catch {
    /* ignore */
  }
  return true;
}

function bindAdminContent(page) {
  if (page === 'basvurular') {
    document.getElementById('btn-export-json')?.addEventListener('click', () => {
      downloadFile('akymun26-basvurular.json', JSON.stringify(getApps(), null, 2), 'application/json');
    });
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      downloadFile('akymun26-basvurular.csv', appsToCsv(getApps()), 'text/csv;charset=utf-8');
    });
    document.querySelectorAll('[data-view-app]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const app = getApps().find((a) => a.id === btn.dataset.viewApp);
        const box = document.getElementById('app-detail');
        if (!app || !box) return;
        box.classList.remove('hidden');
        box.innerHTML = appDetailHtml(app);
        document.getElementById('btn-close-detail')?.addEventListener('click', () => {
          box.classList.add('hidden');
          box.innerHTML = '';
        });
      });
    });
    document.querySelectorAll('[data-set-status]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const to = btn.dataset.to;
        const label = STATUS_LABELS[to] || to;
        if (!confirm(`Durumu «${label}» yapmak istiyor musunuz?`)) return;
        updateAppStatus(btn.dataset.setStatus, to).then(() => renderAdmin()).catch((err) => alert(err.message));
      });
    });
    document.querySelectorAll('[data-status-app]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const to = sel.value;
        const label = STATUS_LABELS[to] || to;
        if (!confirm(`Durumu «${label}» olarak güncellemek istiyor musunuz?`)) {
          renderAdmin();
          return;
        }
        updateAppStatus(sel.dataset.statusApp, to).then(() => renderAdmin()).catch((err) => {
          alert(err.message);
          renderAdmin();
        });
      });
    });
  }

  if (page === 'kabul') {
    document.querySelectorAll('.assign-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!hasPerm('assign_delegate')) return;
        const id = form.dataset.assign;
        const fd = new FormData(form);
        const country = String(fd.get('country') || '');
        const commission = String(fd.get('commission') || '');
        const role = String(fd.get('role') || '');
        if (!country || !commission || !role) {
          alert('Ülke, komisyon ve rol zorunludur.');
          return;
        }
        try {
          const data = await api(`/api/applications/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: { assignedCountry: country, commission, participantRole: role },
          });
          const idx = cache.apps.findIndex((a) => a.id === id);
          if (idx >= 0 && data.application) cache.apps[idx] = data.application;
          else await refreshApps();
          alert('Atama kaydedildi.');
          renderAdmin();
        } catch (err) {
          alert(err.message || 'Atama kaydedilemedi.');
        }
      });
    });
  }

  if (page === 'yetkililer') {
    const preview = () => {
      const role = document.getElementById('role-select')?.value || 'editor';
      const box = document.getElementById('role-perms-preview');
      if (!box) return;
      const labels = {
        view_applications: 'Başvuruları gör',
        export: 'Dışa aktar',
        manage_applications: 'Kabul / red',
        assign_delegate: 'Ülke / komisyon / rol ata',
        manage_users: 'Yetkili yönet',
      };
      box.innerHTML = (ROLE_PERMS[role] || [])
        .map((p) => `<label><input type="checkbox" checked disabled /> ${labels[p] || p}</label>`)
        .join('');
    };
    preview();
    document.getElementById('role-select')?.addEventListener('change', preview);

    document.getElementById('add-user-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);
      try {
        await api('/api/users', {
          method: 'POST',
          body: {
            username: (fd.get('username') || '').toString().trim().toLowerCase(),
            password: (fd.get('password') || '').toString(),
            name: (fd.get('name') || '').toString().trim(),
            role: (fd.get('role') || 'editor').toString(),
          },
        });
        await refreshUsers();
        form.reset();
        renderAdmin();
      } catch (err) {
        alert(err.message || 'Yetkili eklenemedi.');
      }
    });

    document.querySelectorAll('[data-remove-user]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Bu yetkiliyi çıkarmak istiyor musunuz?')) return;
        try {
          await api(`/api/users?id=${encodeURIComponent(btn.dataset.removeUser)}`, {
            method: 'DELETE',
          });
          await refreshUsers();
          renderAdmin();
        } catch (err) {
          alert(err.message || 'Silinemedi.');
        }
      });
    });
  }

  if (page === 'ayarlar') {
    document.getElementById('btn-change-password')?.addEventListener('click', async () => {
      const current = prompt('Mevcut şifre:');
      if (current === null) return;
      const next = prompt('Yeni şifre (en az 4 karakter):');
      if (!next || next.length < 4) {
        alert('Şifre çok kısa.');
        return;
      }
      try {
        await api('/api/auth/password', { method: 'POST', body: { current, next } });
        alert('Şifre güncellendi.');
      } catch (err) {
        alert(err.message || 'Şifre güncellenemedi.');
      }
    });
  }
}

function initAdmin() {
  document.getElementById('admin-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const username = (fd.get('username') || '').toString().trim().toLowerCase();
    const password = (fd.get('password') || '').toString();
    const err = document.getElementById('login-error');
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      setSession(data.user);
      await refreshApps();
      await refreshUsers();
      err.classList.add('hidden');
      location.hash = '#/yonetim';
      renderAdmin();
    } catch (ex) {
      err.textContent = ex.message || 'Kullanıcı adı veya şifre hatalı.';
      err.classList.remove('hidden');
    }
  });

  document.getElementById('btn-admin-logout')?.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setSession(null);
    cache.apps = [];
    cache.users = [];
    location.hash = '#/yonetim';
    renderAdmin();
  });

  document.querySelectorAll('.nav-btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const map = {
        basvurular: '#/yonetim',
        kabul: '#/yonetim/kabul',
        yetkililer: '#/yonetim/yetkililer',
        ayarlar: '#/yonetim/ayarlar',
      };
      location.hash = map[btn.dataset.page] || '#/yonetim';
    });
  });
}

/* —— Helpers —— */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('tr-TR');
  } catch {
    return iso;
  }
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function appsToCsv(apps) {
  const headers = [
    'id', 'submittedAt', 'adSoyad', 'dogumTarihi', 'email', 'telefon', 'ingilizce', 'turkce',
    'egitim', 'bolum', 'munDeneyimi', 'basariSertifika', 'taahhut', 'saglik', 'vatandaslik',
    'kvkk', 'fotoVideoRiza', 'status', 'assignedCountry', 'commission', 'participantRole',
  ];
  const lines = [headers.join(',')];
  for (const a of apps) {
    lines.push(
      headers
        .map((h) => {
          let v = a[h];
          if (typeof v === 'boolean') v = v ? 'EVET' : 'HAYIR';
          v = String(v ?? '').replace(/"/g, '""');
          return `"${v}"`;
        })
        .join(',')
    );
  }
  return '\uFEFF' + lines.join('\n');
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await bootstrap();
  } catch (err) {
    console.error(err);
    alert('Veritabanına bağlanılamadı. Sayfayı yenileyin.');
  }
  await initPublic();
  initAdmin();
  window.addEventListener('hashchange', route);
  window.addEventListener('akymun-apps-changed', () => {
    if (!(location.hash || '').includes('yonetim')) refreshPublicState();
  });
  route();
});
