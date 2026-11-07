/**
 * AKYMUN'26 — başvuru, kabul/red, ülke-rol atama, etkinlik alanı, yetkili paneli
 * Veriler Supabase (Postgres + Auth + RLS) üzerinde tutulur.
 */

const STORAGE = {
  visitorEmail: 'akymun26_visitor_email',
  participantEmail: 'akymun26_participant_email',
};

const db = () => {
  if (!window.AKYMUN_DB) throw new Error('Supabase bağlantısı hazır değil.');
  return window.AKYMUN_DB;
};

const ROLE_PERMS = window.AKYMUN_DB?.ROLE_PERMS || {
  viewer: ['view_applications'],
  editor: ['view_applications', 'export', 'manage_applications', 'assign_delegate', 'manage_events'],
  admin: [
    'view_applications',
    'export',
    'manage_applications',
    'assign_delegate',
    'manage_users',
    'manage_events',
  ],
  owner: [
    'view_applications',
    'export',
    'manage_applications',
    'assign_delegate',
    'manage_users',
    'manage_events',
  ],
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
  'UNEP',
  'UNESCO',
  'WHO',
  'ECOSOC',
  'UN-Habitat',
  'UN WOMEN',
  'UNSC',
];

/** In-memory caches (filled from Supabase; avoids extra round-trips while navigating) */
let appsCache = [];
let usersCache = [];
let sessionCache = null;
let participantUnsub = null;

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getApps() {
  return appsCache;
}

function getUsers() {
  return usersCache;
}

function getSession() {
  return sessionCache;
}

function setSession(user) {
  sessionCache = user
    ? {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        permissions: user.role && ROLE_PERMS[user.role] ? ROLE_PERMS[user.role].slice() : user.permissions || [],
      }
    : null;
}

function hasPerm(perm) {
  const s = getSession();
  return s && Array.isArray(s.permissions) && s.permissions.includes(perm);
}

async function refreshAppsCache() {
  appsCache = await db().loadApplications();
  return appsCache;
}

async function refreshUsersCache() {
  usersCache = await db().loadStaff();
  return usersCache;
}

async function findAppByEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return null;
  return db().lookupApplication(e);
}

async function restoreStaffSession() {
  try {
    const staff = await db().fetchStaffSession();
    setSession(staff);
    return staff;
  } catch {
    setSession(null);
    return null;
  }
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
async function route() {
  const hash = (location.hash || '#/').replace(/^#/, '') || '/';
  const isAdmin = hash.startsWith('/yonetim') || hash.startsWith('/admin');
  const isParticipant = hash.startsWith('/katilimci');
  const isConference = hash.startsWith('/konferans');
  const isCommission = hash.startsWith('/komisyon');

  document.getElementById('public-app')?.classList.toggle('hidden', isAdmin || isParticipant || isConference || isCommission);
  document.getElementById('conference-app')?.classList.toggle('hidden', !isConference);
  document.getElementById('commission-app')?.classList.toggle('hidden', !isCommission);
  document.getElementById('admin-app')?.classList.toggle('hidden', !isAdmin);
  document.getElementById('participant-app')?.classList.toggle('hidden', !isParticipant);
  document.body.classList.toggle('admin-mode', isAdmin || isParticipant);

  if (!isParticipant && participantUnsub) {
    participantUnsub();
    participantUnsub = null;
  }
  if (!isParticipant && typeof window.__akymunChatCleanup === 'function') {
    window.__akymunChatCleanup();
    window.__akymunChatCleanup = null;
  }

  if (isAdmin) {
    hideSuccess();
    await renderAdmin();
  } else if (isParticipant) {
    hideSuccess();
    await renderParticipant();
  } else if (isConference) {
    hideSuccess();
    fillLogos(document.getElementById('conference-app'));
  } else if (isCommission) {
    hideSuccess();
    fillLogos(document.getElementById('commission-app'));
  } else {
    await refreshPublicState();
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
  let existing = null;
  try {
    existing = remembered ? await findAppByEmail(remembered) : null;
  } catch (err) {
    console.warn(err);
  }
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

function initPublic() {
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
    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      await db().submitApplication(data);
      localStorage.setItem(STORAGE.visitorEmail, data.email);
      form.reset();
      const h3 = document.querySelector('#already-applied h3');
      if (h3) h3.textContent = 'Başvurunuz zaten alınmıştır';
      showSuccess();
      await refreshPublicState();
    } catch (ex) {
      alert(ex.message || 'Başvuru gönderilemedi.');
      if (String(ex.message || '').includes('zaten alınmıştır')) {
        localStorage.setItem(STORAGE.visitorEmail, data.email);
        await refreshPublicState();
        document.getElementById('already-applied')?.scrollIntoView({ behavior: 'smooth' });
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  document.getElementById('btn-success-ok')?.addEventListener('click', hideSuccess);
  document.getElementById('btn-basvuru-scroll')?.addEventListener('click', () => {
    document.getElementById('basvuru')?.scrollIntoView({ behavior: 'smooth' });
  });

  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.access-menu[open]').forEach((el) => {
      if (!el.contains(e.target)) el.removeAttribute('open');
    });
  });

  form?.elements.namedItem('email')?.addEventListener('blur', async (e) => {
    const email = normalizeEmail(e.target.value);
    if (!email) return;
    try {
      const app = await findAppByEmail(email);
      if (app && !canVisitorSeeForm(app)) {
        localStorage.setItem(STORAGE.visitorEmail, email);
        alert('Bu e-posta ile başvurunuz zaten alınmıştır.');
        await refreshPublicState();
      }
    } catch {
      /* ignore lookup blips */
    }
  });

  refreshPublicState();
}

/* —— Participant portal —— */
function getParticipantEmail() {
  return normalizeEmail(localStorage.getItem(STORAGE.participantEmail) || '');
}

function setParticipantEmail(email) {
  if (!email) localStorage.removeItem(STORAGE.participantEmail);
  else localStorage.setItem(STORAGE.participantEmail, normalizeEmail(email));
}

async function renderParticipant() {
  const root = document.getElementById('participant-content');
  if (!root) return;
  const email = getParticipantEmail();
  let app = null;
  try {
    app = email ? await findAppByEmail(email) : null;
  } catch (ex) {
    root.innerHTML = `<div class="empty" style="margin:2rem">${escapeHtml(ex.message || 'Bağlantı hatası')}</div>`;
    return;
  }

  if (!app || app.status !== STATUS.accepted) {
    root.innerHTML = `
      <div class="admin-login">
        <div class="login-card">
          <div style="text-align:center;margin-bottom:0.75rem" data-logo="nav"></div>
          <h1>Katılımcı Girişi</h1>
          <p class="sub">Kabul edilen başvurunuzdaki e-posta ile giriş yapın.</p>
          <p id="part-login-error" class="login-error hidden"></p>
          <form id="participant-login-form">
            <div class="field">
              <label class="q" for="part-email">E-posta</label>
              <input id="part-email" name="email" type="email" required autocomplete="email" value="${escapeHtml(email)}" />
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%">Giriş yap</button>
          </form>
          <p style="text-align:center;margin:1rem 0 0">
            <a href="#/">← Başvuru formuna dön</a>
          </p>
        </div>
      </div>`;
    fillLogos(root);
    document.getElementById('participant-login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const em = normalizeEmail(new FormData(e.target).get('email'));
      const err = document.getElementById('part-login-error');
      try {
        const found = await findAppByEmail(em);
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
        await renderParticipant();
      } catch (ex) {
        err.textContent = ex.message || 'Giriş yapılamadı.';
        err.classList.remove('hidden');
      }
    });
    return;
  }

  if (participantUnsub) {
    participantUnsub();
    participantUnsub = null;
  }

  const ready = isReadyForEvents(app);

  root.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div data-logo="nav"></div>
        <div class="brand-text"><strong>AKYMUN'26</strong><span>Katılımcı</span></div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" id="btn-part-logout">Çıkış</button>
    </header>
    <main class="page-main" id="participant-hub-main">
      <div class="empty">Yükleniyor…</div>
    </main>`;

  fillLogos(root);
  document.getElementById('btn-part-logout')?.addEventListener('click', async () => {
    if (participantUnsub) {
      participantUnsub();
      participantUnsub = null;
    }
    if (typeof window.__akymunChatCleanup === 'function') {
      window.__akymunChatCleanup();
      window.__akymunChatCleanup = null;
    }
    setParticipantEmail('');
    await renderParticipant();
  });

  const main = document.getElementById('participant-hub-main');
  if (!ready) {
    main.innerHTML = `
      <section class="form-card">
        <header><h2>Hoş geldiniz, ${escapeHtml(app.adSoyad || '')}</h2>
        <p>Durumunuz: <span class="badge badge-ok">Kabul edildi</span></p></header>
        <div class="detail-grid" style="padding:0">
          <div class="detail-row"><dt>Ülke</dt><dd>${escapeHtml(app.assignedCountry || 'Organizasyon atayacak')}</dd></div>
          <div class="detail-row"><dt>Komisyon</dt><dd>${escapeHtml(app.commission || 'Organizasyon atayacak')}</dd></div>
          <div class="detail-row"><dt>Rol</dt><dd>${escapeHtml(app.participantRole || 'Organizasyon atayacak')}</dd></div>
        </div>
        <div class="empty" style="margin-top:1rem">Etkinlik hub’ı için <b>ülke + komisyon + rol</b> ataması gerekir.
          ${!app.assignedCountry ? '<br>→ Ülke henüz atanmadı.' : ''}
          ${!app.commission ? '<br>→ Komisyon henüz atanmadı.' : ''}
          ${!app.participantRole ? '<br>→ Rol henüz atanmadı.' : ''}
        </div>
        <p style="text-align:center;margin:1.5rem 0"><a href="#/">← Ana sayfa</a></p>
      </section>`;
    return;
  }

  let hubPaintTimer = null;
  const paintHub = async ({ remountChat } = {}) => {
    const tab = window.AKYMUN_CONF.resolveHubTab(location.hash);
    const wantChat = tab === 'sohbet';
    const doRemountChat = remountChat !== false && wantChat;
    const keepChat = remountChat === false && wantChat && main.querySelector('#hub-chat-section');
    const savedChat = keepChat ? main.querySelector('#hub-chat-section') : null;

    if (!wantChat && typeof window.__akymunChatCleanup === 'function') {
      window.__akymunChatCleanup();
      window.__akymunChatCleanup = null;
    }

    const hub = await db().getParticipantHub(email);
    main.innerHTML = window.AKYMUN_CONF.renderParticipantHub(hub, { tab });

    if (savedChat) {
      const slot = main.querySelector('#hub-chat-section');
      if (slot) slot.replaceWith(savedChat);
      window.AKYMUN_CONF.bindParticipantHub(main, email, hub, () => paintHub({ remountChat: true }), {
        bindChat: false,
      });
    } else {
      window.AKYMUN_CONF.bindParticipantHub(main, email, hub, () => paintHub({ remountChat: true }), {
        bindChat: doRemountChat || (wantChat && !keepChat),
      });
    }
  };

  try {
    await paintHub({ remountChat: true });
    if (!participantUnsub) {
      participantUnsub = db().subscribeConference(() => {
        clearTimeout(hubPaintTimer);
        hubPaintTimer = setTimeout(() => {
          const tab = window.AKYMUN_CONF.resolveHubTab(location.hash);
          paintHub({ remountChat: tab !== 'sohbet' ? true : false }).catch(() => {});
        }, 2000);
      });
    }
  } catch (ex) {
    main.innerHTML = `<div class="empty">${escapeHtml(ex.message || 'Hub yüklenemedi')}</div>
      <p class="hint hub-footer-actions"><a href="#/">← Ana sayfa</a></p>`;
  }
}

/* —— Admin —— */
async function renderAdmin() {
  const loginView = document.getElementById('admin-login-view');
  const shellView = document.getElementById('admin-shell-view');
  fillLogos(document.getElementById('admin-app') || document);

  if (!getSession()) {
    await restoreStaffSession();
  }

  const session = getSession();
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
  if (panel.includes('/etkinlik')) page = 'etkinlik';
  if (panel.includes('/ayarlar')) page = 'ayarlar';

  document.querySelectorAll('.nav-btn[data-page]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  const content = document.getElementById('admin-content');
  content.innerHTML = `<div class="empty">Yükleniyor…</div>`;

  try {
    if (page === 'basvurular' || page === 'kabul') await refreshAppsCache();
    if (page === 'yetkililer') await refreshUsersCache();
    if (page === 'etkinlik') {
      /* loaded inside renderer */
    }
  } catch (ex) {
    content.innerHTML = `<div class="empty">${escapeHtml(ex.message || 'Veriler yüklenemedi.')}</div>`;
    return;
  }

  if (page === 'basvurular') content.innerHTML = renderApplicationsPanel();
  else if (page === 'kabul') content.innerHTML = renderAcceptedPanel();
  else if (page === 'yetkililer') content.innerHTML = renderUsersPanel();
  else if (page === 'etkinlik') {
    try {
      const [banner, announcements, rooms, resources, program, checkIns] = await Promise.all([
        db().loadBanner(),
        db().loadAnnouncementsAdmin(),
        db().loadRooms(),
        db().loadResourcesAdmin(),
        db().loadProgram(),
        db().loadCheckIns().catch(() => []),
      ]);
      content.innerHTML = window.AKYMUN_CONF.renderAdminEventsPanel(
        { banner, announcements, rooms, resources, program, checkIns },
        { canManage: hasPerm('manage_events') }
      );
    } catch (ex) {
      content.innerHTML = `<div class="empty">${escapeHtml(ex.message || 'Etkinlik paneli yüklenemedi.')}</div>`;
      return;
    }
  } else content.innerHTML = renderSettingsPanel();

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
          <b>Görüntüleyici</b> — sadece başvuruları görür (etkinlik yönetemez) ·
          <b>Editör</b> — kabul/red, atama, etkinlik ·
          <b>Admin</b> — editör + yetkili ekle/çıkar ·
          <b>Süper Yetkili</b> — tam yetki
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
      <p style="margin:0 0 0.75rem;color:var(--cream-dim)">Veriler Supabase (ücretsiz plan) üzerinde saklanır; tüm yetkililer aynı başvuruları görür.</p>
      <ul style="color:var(--muted);font-size:0.9rem">
        <li>Süper yetkili girişi: kullanıcı adı <b>admin</b> (şifreyi aşağıdan değiştirin).</li>
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
  const session = getSession();
  const apps = getApps();
  const idx = apps.findIndex((a) => a.id === id);
  if (idx < 0) return false;
  const prev = apps[idx].status;
  if (prev === status) return false;

  const patch = {
    status,
    decidedAt: new Date().toISOString(),
    decidedBy: session?.username || '',
  };

  if (status !== STATUS.accepted) {
    patch.assignedCountry = '';
    patch.commission = '';
    patch.participantRole = '';
    if (prev === STATUS.accepted || status === STATUS.rejected) {
      patch.allowResubmit = true;
    }
  } else {
    patch.allowResubmit = false;
  }

  await db().updateApplication(id, patch);
  Object.assign(appsCache[idx], {
    status: patch.status,
    decidedAt: patch.decidedAt,
    decidedBy: patch.decidedBy,
    assignedCountry: patch.assignedCountry ?? appsCache[idx].assignedCountry,
    commission: patch.commission ?? appsCache[idx].commission,
    participantRole: patch.participantRole ?? appsCache[idx].participantRole,
    allowResubmit: patch.allowResubmit ?? false,
  });
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
      btn.addEventListener('click', async () => {
        const to = btn.dataset.to;
        const label = STATUS_LABELS[to] || to;
        if (!confirm(`Durumu «${label}» yapmak istiyor musunuz?`)) return;
        try {
          await updateAppStatus(btn.dataset.setStatus, to);
          await renderAdmin();
        } catch (ex) {
          alert(ex.message || 'Durum güncellenemedi.');
        }
      });
    });
    document.querySelectorAll('[data-status-app]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const to = sel.value;
        const label = STATUS_LABELS[to] || to;
        if (!confirm(`Durumu «${label}» olarak güncellemek istiyor musunuz?`)) {
          await renderAdmin();
          return;
        }
        try {
          await updateAppStatus(sel.dataset.statusApp, to);
          await renderAdmin();
        } catch (ex) {
          alert(ex.message || 'Durum güncellenemedi.');
          await renderAdmin();
        }
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
          await db().updateApplication(id, {
            assignedCountry: country,
            commission,
            participantRole: role,
          });
          alert('Atama kaydedildi.');
          await renderAdmin();
        } catch (ex) {
          alert(ex.message || 'Atama kaydedilemedi.');
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
        manage_events: 'Etkinlik yönet',
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
      const username = (fd.get('username') || '').toString().trim().toLowerCase();
      const role = (fd.get('role') || 'editor').toString();
      try {
        await db().createStaff({
          username,
          password: (fd.get('password') || '').toString(),
          name: (fd.get('name') || '').toString().trim(),
          role,
        });
        form.reset();
        await renderAdmin();
      } catch (ex) {
        alert(ex.message || 'Yetkili eklenemedi.');
      }
    });

    document.querySelectorAll('[data-remove-user]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Bu yetkiliyi çıkarmak istiyor musunuz?')) return;
        try {
          await db().deleteStaff(btn.dataset.removeUser);
          await renderAdmin();
        } catch (ex) {
          alert(ex.message || 'Yetkili silinemedi.');
        }
      });
    });
  }

  if (page === 'etkinlik') {
    document.getElementById('evt-banner-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const result = await db().saveBanner({
          message: String(fd.get('message') || ''),
          active: fd.get('active') === 'on',
          broadcastChat: fd.get('broadcast') === 'on',
        });
        const n = Number(result?.broadcastCount || 0);
        alert(
          n > 0
            ? `Acil şerit kaydedildi ve ${n} komisyon sohbetine gönderildi.`
            : 'Acil şerit kaydedildi.'
        );
        await renderAdmin();
      } catch (ex) {
        alert(ex.message || 'Kaydedilemedi');
      }
    });
    document.getElementById('evt-ann-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await db().upsertAnnouncement({
          body: String(fd.get('body') || ''),
          pinned: fd.get('pinned') === 'on',
          createdBy: getSession()?.username || '',
        });
        e.target.reset();
        await renderAdmin();
      } catch (ex) {
        alert(ex.message || 'Duyuru yayınlanamadı');
      }
    });
    document.querySelectorAll('[data-del-ann]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Duyuru silinsin mi?')) return;
        try {
          await db().deleteAnnouncement(btn.dataset.delAnn);
          await renderAdmin();
        } catch (ex) {
          alert(ex.message || 'Silinemedi');
        }
      });
    });
    document.querySelectorAll('.evt-room-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        try {
          await db().saveRoom({
            commission: form.dataset.commission,
            room_name: String(fd.get('room_name') || ''),
            notes: String(fd.get('notes') || ''),
          });
          alert('Salon kaydedildi.');
        } catch (ex) {
          alert(ex.message || 'Salon kaydedilemedi');
        }
      });
    });
    document.getElementById('evt-res-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await db().saveResource({
          title: String(fd.get('title') || ''),
          url: String(fd.get('url') || ''),
          sort_order: 100,
        });
        e.target.reset();
        await renderAdmin();
      } catch (ex) {
        alert(ex.message || 'Kaynak eklenemedi');
      }
    });
    document.querySelectorAll('[data-del-res]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Kaynak silinsin mi?')) return;
        try {
          await db().deleteResource(btn.dataset.delRes);
          await renderAdmin();
        } catch (ex) {
          alert(ex.message || 'Silinemedi');
        }
      });
    });

    document.getElementById('evt-program-add')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await db().saveProgramItem({
          day_no: fd.get('day_no'),
          sort_order: fd.get('sort_order'),
          starts_at: fd.get('starts_at'),
          ends_at: fd.get('ends_at'),
          title: fd.get('title'),
          description: fd.get('description'),
          location: fd.get('location'),
          active: true,
        });
        e.target.reset();
        await renderAdmin();
      } catch (ex) {
        alert(ex.message || 'Program maddesi eklenemedi');
      }
    });

    document.querySelectorAll('.evt-program-form').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        try {
          await db().saveProgramItem({
            id: form.dataset.id,
            day_no: fd.get('day_no'),
            sort_order: fd.get('sort_order'),
            starts_at: fd.get('starts_at'),
            ends_at: fd.get('ends_at'),
            title: fd.get('title'),
            description: fd.get('description'),
            location: fd.get('location'),
            active: fd.get('active') === 'on',
          });
          alert('Program maddesi kaydedildi.');
          await renderAdmin();
        } catch (ex) {
          alert(ex.message || 'Kaydedilemedi');
        }
      });
    });

    document.querySelectorAll('[data-del-program]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Bu program maddesi silinsin mi?')) return;
        try {
          await db().deleteProgramItem(btn.dataset.delProgram);
          await renderAdmin();
        } catch (ex) {
          alert(ex.message || 'Silinemedi');
        }
      });
    });
  }

  if (page === 'ayarlar') {
    document.getElementById('btn-change-password')?.addEventListener('click', async () => {
      const next = prompt('Yeni şifre (en az 6 karakter):');
      if (next === null) return;
      if (!next || next.length < 6) {
        alert('Şifre en az 6 karakter olmalı.');
        return;
      }
      try {
        await db().changePassword(next);
        alert('Şifre güncellendi.');
      } catch (ex) {
        alert(ex.message || 'Şifre güncellenemedi.');
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
    const btn = e.target.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const user = await db().login(username, password);
      if (!user) throw new Error('Kullanıcı adı veya şifre hatalı.');
      err.classList.add('hidden');
      setSession(user);
      location.hash = '#/yonetim';
      await renderAdmin();
    } catch (ex) {
      err.textContent = ex.message || 'Kullanıcı adı veya şifre hatalı.';
      err.classList.remove('hidden');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById('btn-admin-logout')?.addEventListener('click', async () => {
    await db().logout();
    setSession(null);
    location.hash = '#/yonetim';
    await renderAdmin();
  });

  document.querySelectorAll('.nav-btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const map = {
        basvurular: '#/yonetim',
        kabul: '#/yonetim/kabul',
        etkinlik: '#/yonetim/etkinlik',
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
  if (!window.AKYMUN_DB) {
    console.error('Supabase API yüklenemedi');
    alert('Veritabanı bağlantısı kurulamadı. Sayfayı yenileyin.');
    return;
  }
  initPublic();
  initAdmin();
  window.addEventListener('hashchange', () => {
    route();
  });
  await restoreStaffSession();
  await route();
});
