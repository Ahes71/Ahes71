/**
 * AKYMUN'26 — katılımcı etkinlik hub + admin etkinlik paneli UI
 */
(function (global) {
  const SESSION_LABELS = {
    bekliyor: 'Bekliyor',
    hazirlik: 'Hazırlık',
    devam: 'Oturum devam ediyor',
    ara: 'Ara',
    bitti: 'Bitti',
  };

  const ROLE_BLURBS = {
    Delegasyon:
      'Ülkenizi temsil edin: not alın, programı izleyin, check-in yapın. Konuşma sırası için başkanlığa işaret verin.',
    Başkan:
      'Oturumu yönetin: komisyon durumunu güncelleyin, ara verin, not bırakın. Delegeler durumunuzu anlık görür.',
    'Başkan Yardımcısı':
      'Başkana destek olun: oturum durumunu birlikte güncelleyin, konuşmacı ve zaman notlarını tutun.',
    Raportör:
      'Komite notlarını ve karar taslağı özetlerini buraya yazın; gün boyu kaybolmaz.',
    Gözlemci:
      'Gözlemci olarak program, duyuru ve salonu takip edin (oturum yönetimi yok).',
    'Basın Ekibi':
      'Görsel/haber checklist’inizi işaretleyin; duyuruları anlık izleyin.',
    'Kriz Ekibi':
      'Kriz senaryosu checklist’i ve brifing notlarınız burada; acil şeridi takip edin.',
  };

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtTime(t) {
    if (!t) return '';
    return String(t).slice(0, 5);
  }

  function hasCheckedIn(hub, dayNo) {
    return (hub.checkIns || []).some((c) => Number(c.dayNo) === Number(dayNo));
  }

  function roleWorkspaceHtml(hub) {
    const role = hub.app?.participantRole || '';
    const notes = hub.notes || {};
    const blurb = ROLE_BLURBS[role] || 'Rolünüze özel alanı kullanın.';
    const isChair = role === 'Başkan' || role === 'Başkan Yardımcısı';
    const isRaportor = role === 'Raportör';
    const isPress = role === 'Basın Ekibi';
    const isCrisis = role === 'Kriz Ekibi';
    const isDelegate = role === 'Delegasyon';
    const isObserver = role === 'Gözlemci';

    let body = `<p class="hub-blurb">${esc(blurb)}</p>`;

    if (isChair) {
      const st = hub.session?.status || 'bekliyor';
      body += `
        <div class="hub-block">
          <h4>Komisyon oturumu</h4>
          <p class="hint">Durum tüm ${esc(hub.app.commission)} delegelerine anlık yansır.</p>
          <label class="q">Durum</label>
          <select id="hub-session-status">
            ${Object.keys(SESSION_LABELS)
              .map(
                (k) =>
                  `<option value="${k}" ${k === st ? 'selected' : ''}>${esc(SESSION_LABELS[k])}</option>`
              )
              .join('')}
          </select>
          <label class="q">Başkanlık notu (komiteye görünür)</label>
          <textarea id="hub-session-note" rows="3">${esc(hub.session?.note || '')}</textarea>
          <button type="button" class="btn btn-primary btn-sm" id="hub-session-save">Durumu yayınla</button>
        </div>
        <div class="hub-block">
          <h4>Özel başkan notları</h4>
          <textarea id="hub-note-chair" rows="4" placeholder="Konuşmacı sırası, zamanlama…">${esc(notes.chair || '')}</textarea>
          <button type="button" class="btn btn-ghost btn-sm" data-save-note="chair" data-target="hub-note-chair">Kaydet</button>
        </div>`;
    }

    if (isRaportor) {
      body += `
        <div class="hub-block">
          <h4>Raportör defteri</h4>
          <textarea id="hub-note-raportor" rows="6" placeholder="Karar taslağı özeti, madde notları…">${esc(notes.raportor || '')}</textarea>
          <button type="button" class="btn btn-primary btn-sm" data-save-note="raportor" data-target="hub-note-raportor">Notları kaydet</button>
        </div>`;
    }

    if (isDelegate) {
      body += `
        <div class="hub-block">
          <h4>Delegasyon hazırlık notu</h4>
          <textarea id="hub-note-delegate" rows="5" placeholder="Ülke pozisyonu, konuşma taslağı…">${esc(notes.delegate || '')}</textarea>
          <button type="button" class="btn btn-primary btn-sm" data-save-note="delegate" data-target="hub-note-delegate">Kaydet</button>
        </div>
        <div class="hub-block">
          <h4>Hızlı kontrol</h4>
          <ul class="hub-check">
            <li>Ülke pozisyonunuzu netleştirdiniz mi?</li>
            <li>Açılış konuşmanız hazır mı?</li>
            <li>Müttefik / karşı blok notlarınız var mı?</li>
          </ul>
        </div>`;
    }

    if (isObserver) {
      body += `
        <div class="hub-block">
          <h4>Gözlemci ipuçları</h4>
          <ul class="hub-check">
            <li>Oylamalara katılmazsınız; gözlem ve öğrenme odaklısınız.</li>
            <li>Salon ve program bilgisini takip edin.</li>
            <li>Acil şerit ve duyuruları kaçırmayın.</li>
          </ul>
        </div>`;
    }

    if (isPress) {
      body += `
        <div class="hub-block">
          <h4>Basın checklist</h4>
          <textarea id="hub-note-press" rows="5" placeholder="Çekildi: açılış / komite / kapanış…">${esc(notes.press || '')}</textarea>
          <button type="button" class="btn btn-primary btn-sm" data-save-note="press" data-target="hub-note-press">Kaydet</button>
          <ul class="hub-check">
            <li>Açılış fotoğrafları</li>
            <li>Komite atmosfer kareleri</li>
            <li>Kapanış / sertifika anları</li>
          </ul>
        </div>`;
    }

    if (isCrisis) {
      body += `
        <div class="hub-block">
          <h4>Kriz ekibi brifing</h4>
          <textarea id="hub-note-crisis" rows="5" placeholder="Senaryo zamanlaması, tetikleyiciler…">${esc(notes.crisis || '')}</textarea>
          <button type="button" class="btn btn-primary btn-sm" data-save-note="crisis" data-target="hub-note-crisis">Kaydet</button>
          <ul class="hub-check">
            <li>Kriz paketi hazır</li>
            <li>Komisyonlarla zaman senkronu</li>
            <li>Acil duyuru şeridi kontrolü</li>
          </ul>
        </div>`;
    }

    return `
      <section class="form-card hub-card">
        <header>
          <h2>Rol alanı — ${esc(role)}</h2>
          <p>Konferans sırasında burada aktif kalın; boş ekran yok.</p>
        </header>
        ${body}
      </section>`;
  }

  function programHtml(hub) {
    const items = hub.program || [];
    const day1 = items.filter((p) => Number(p.dayNo) === 1);
    const day2 = items.filter((p) => Number(p.dayNo) === 2);
    const renderDay = (label, list) => `
      <div class="hub-day">
        <h3>${esc(label)}</h3>
        <div class="events-grid">
          ${list
            .map(
              (p) => `
            <article class="event-card">
              <div class="hub-time">${esc(fmtTime(p.startsAt))} – ${esc(fmtTime(p.endsAt))}</div>
              <h3>${esc(p.title)}</h3>
              <p>${esc(p.description || '')}</p>
              <span class="hint">${esc(p.location || '')}</span>
            </article>`
            )
            .join('')}
        </div>
      </div>`;
    return `
      <section class="form-card hub-card">
        <header><h2>Program</h2><p>28–29 Kasım 2026 · tipik MUN akışı (organizasyon güncelleyebilir).</p></header>
        ${renderDay('1. Gün — 28 Kasım Cumartesi', day1)}
        ${renderDay('2. Gün — 29 Kasım Pazar', day2)}
      </section>`;
  }

  const HUB_TABS = [
    { id: 'ozet', label: 'Özet', hash: '#/katilimci' },
    { id: 'duyurular', label: 'Duyurular', hash: '#/katilimci/duyurular' },
    { id: 'program', label: 'Program', hash: '#/katilimci/program' },
    { id: 'rol', label: 'Rolüm', hash: '#/katilimci/rol' },
    { id: 'sohbet', label: 'Sohbet', hash: '#/katilimci/sohbet' },
    { id: 'kaynaklar', label: 'Kaynaklar', hash: '#/katilimci/kaynaklar' },
  ];

  function resolveHubTab(hash) {
    const h = (hash || location.hash || '#/katilimci').replace(/^#/, '');
    if (h.includes('/duyurular')) return 'duyurular';
    if (h.includes('/program')) return 'program';
    if (h.includes('/rol')) return 'rol';
    if (h.includes('/sohbet')) return 'sohbet';
    if (h.includes('/kaynaklar')) return 'kaynaklar';
    return 'ozet';
  }

  function hubNavHtml(active) {
    return `
      <nav class="hub-nav" aria-label="Katılımcı menü">
        ${HUB_TABS.map(
          (t) =>
            `<a class="hub-nav-link ${t.id === active ? 'is-active' : ''}" href="${t.hash}">${esc(t.label)}</a>`
        ).join('')}
      </nav>`;
  }

  function renderHubTabContent(hub, tab) {
    const today = hub.todayDayNo || 1;
    const checked = hasCheckedIn(hub, today);
    const anns = (hub.announcements || [])
      .map(
        (a) => `
      <article class="hub-ann ${a.pinned ? 'is-pinned' : ''}">
        ${a.pinned ? '<span class="hub-pin">Sabit</span>' : ''}
        <p>${esc(a.body)}</p>
        <span class="hint">${esc(a.createdBy || '')}</span>
      </article>`
      )
      .join('');

    const session = hub.session
      ? `<div class="hub-pill">Oturum: <b>${esc(SESSION_LABELS[hub.session.status] || hub.session.status)}</b></div>`
      : '';
    const room = hub.room
      ? `<div class="hub-pill">Salon: <b>${esc(hub.room.roomName || '—')}</b></div>`
      : '';

    const resources = (hub.resources || [])
      .map((r) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title)}</a></li>`)
      .join('');

    if (tab === 'duyurular') {
      return `
        <section class="form-card hub-card">
          <header><h2>Duyurular</h2><p>Organizasyon mesajları burada görünür.</p></header>
          <div class="hub-anns">${anns || '<p class="empty">Henüz duyuru yok.</p>'}</div>
        </section>`;
    }

    if (tab === 'program') {
      return programHtml(hub);
    }

    if (tab === 'rol') {
      return roleWorkspaceHtml(hub);
    }

    if (tab === 'sohbet') {
      return `
        <section class="form-card hub-card hub-chat-card" id="hub-chat-section">
          <header class="hub-chat-bar">
            <div>
              <h2>${esc(hub.app.commission)} sohbeti</h2>
              <p id="hub-chat-status">Bağlanıyor…</p>
            </div>
          </header>
          <div class="chat-box" id="hub-chat-box" aria-live="polite"></div>
          <form id="hub-chat-form" class="chat-form">
            <input id="hub-chat-input" type="text" maxlength="500" autocomplete="off" placeholder="Mesaj" required />
            <button type="submit" class="chat-send" aria-label="Gönder">➤</button>
          </form>
        </section>`;
    }

    if (tab === 'kaynaklar') {
      return `
        <section class="form-card hub-card">
          <header><h2>Kaynaklar</h2><p>Kitapçık ve bağlantılar.</p></header>
          <ul class="hub-resources">${resources || '<li>Kaynak yok</li>'}</ul>
        </section>`;
    }

    // ozet
    const app = hub.app || {};
    const bits = [app.assignedCountry, app.commission, app.participantRole].filter(Boolean);
    return `
      <section class="form-card hub-card hub-ozet-card">
        <div class="hub-identity-glow" aria-hidden="true"></div>
        <header class="hub-ozet-head">
          <p class="hub-identity-kicker">AKYMUN’26 · Katılımcı</p>
          <h2 class="hub-identity-name">Hoş geldiniz, ${esc(app.adSoyad || 'Katılımcı')}</h2>
          ${
            bits.length
              ? `<p class="hub-identity-meta">${bits.map((b) => `<span>${esc(b)}</span>`).join('<i aria-hidden="true"></i>')}</p>`
              : ''
          }
          <p class="hub-ozet-status">Durum: <span class="badge badge-ok">Kabul edildi</span></p>
        </header>
        <div class="hub-pills">${room}${session}</div>
        <div class="hub-checkin ${checked ? 'is-done' : ''}">
          <div class="hub-checkin-copy">
            <strong>${checked ? 'Check-in tamam' : 'Günlük check-in'}</strong>
            <p>${checked ? `${today}. gün kaydınız alındı.` : `Bugün (${today}. gün) henüz işaretlenmediniz.`}</p>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="hub-checkin" ${checked ? 'disabled' : ''}>
            ${checked ? 'Alındı' : 'Bugün buradayım'}
          </button>
        </div>
        <p class="hint hub-ozet-hint">Program, duyuru, rol alanı ve sohbet üst menüde.</p>
      </section>`;
  }

  function renderParticipantHub(hub, { tab } = {}) {
    const active = tab || resolveHubTab();
    const banner =
      hub.banner?.active && hub.banner?.message
        ? `<div class="hub-alert" role="alert">${esc(hub.banner.message)}</div>`
        : '';

    return `
      ${banner}
      ${hubNavHtml(active)}
      <div id="hub-tab-panel" data-tab="${esc(active)}">
        ${renderHubTabContent(hub, active)}
      </div>
      <p class="hint hub-footer-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="hub-refresh">Yenile</button>
        <a href="#/">← Ana sayfa</a>
      </p>`;
  }

  function fmtChatTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function renderChatMessages(box, messages, myEmail) {
    if (!box) return;
    const me = String(myEmail || '').toLowerCase();
    if (!messages.length) {
      box.innerHTML = `<p class="chat-empty">Henüz mesaj yok. İlk mesajı siz yazın.</p>`;
      return;
    }
    box.innerHTML = messages
      .map((m) => {
        if (m.msgKind === 'alert') {
          return `
        <div class="chat-bubble chat-alert" role="status">
          <div class="chat-name">Acil şerit${
            m.senderRole ? `<span class="chat-role"> · ${esc(m.senderRole)}</span>` : ''
          }</div>
          <div class="chat-body">
            <p class="chat-text">${esc(m.body)}</p>
            <time class="chat-time">${esc(fmtChatTime(m.createdAt))}</time>
          </div>
        </div>`;
        }
        const mine = String(m.senderEmail || '').toLowerCase() === me;
        const role = m.senderRole || '';
        const country = m.senderCountry || '';
        const metaBits = [role, country].filter(Boolean).join(' · ');
        return `
        <div class="chat-bubble ${mine ? 'is-mine' : ''}">
          ${
            mine
              ? ''
              : `<div class="chat-name">${esc(m.senderName || 'Delege')}${
                  metaBits ? `<span class="chat-role"> ${esc(metaBits)}</span>` : ''
                }</div>`
          }
          <div class="chat-body">
            <p class="chat-text">${esc(m.body)}</p>
            <time class="chat-time">${esc(fmtChatTime(m.createdAt))}</time>
          </div>
        </div>`;
      })
      .join('');
    box.scrollTop = box.scrollHeight;
  }

  function bindCommissionChat(root, email) {
    if (typeof global.__akymunChatCleanup === 'function') {
      global.__akymunChatCleanup();
      global.__akymunChatCleanup = null;
    }

    const box = root.querySelector('#hub-chat-box');
    const form = root.querySelector('#hub-chat-form');
    const input = root.querySelector('#hub-chat-input');
    const status = root.querySelector('#hub-chat-status');
    if (!box || !form || !input) return;

    let lastId = 0;
    let messages = [];
    let busy = false;
    let stopped = false;

    const setStatus = (t) => {
      if (status) status.textContent = t;
    };

    const pull = async (initial) => {
      if (stopped || busy) return;
      if (document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const batch = await global.AKYMUN_DB.getCommissionChat(email, initial ? 0 : lastId);
        if (initial) {
          messages = batch;
        } else if (batch.length) {
          const seen = new Set(messages.map((m) => m.id));
          batch.forEach((m) => {
            if (!seen.has(m.id)) messages.push(m);
          });
          if (messages.length > 80) messages = messages.slice(-80);
        }
        if (messages.length) lastId = messages[messages.length - 1].id;
        renderChatMessages(box, messages, email);
        setStatus(initial ? 'çevrimiçi' : 'güncel');
      } catch (ex) {
        setStatus(ex.message || 'bağlantı yok');
      } finally {
        busy = false;
      }
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = input.value.trim();
      if (!body) return;
      const btn = form.querySelector('[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        const msg = await global.AKYMUN_DB.sendCommissionChat(email, body);
        input.value = '';
        if (msg?.id && !messages.some((m) => m.id === msg.id)) {
          messages.push(msg);
          lastId = msg.id;
          renderChatMessages(box, messages, email);
        } else {
          await pull(false);
        }
        setStatus('çevrimiçi');
      } catch (ex) {
        alert(ex.message || 'Gönderilemedi');
      } finally {
        if (btn) btn.disabled = false;
        input.focus();
      }
    });

    pull(true);
    // Low data: poll only every 12s while tab visible (no Realtime channel)
    const timer = setInterval(() => pull(false), 12000);
    const onVis = () => {
      if (document.visibilityState === 'visible') pull(false);
    };
    document.addEventListener('visibilitychange', onVis);

    global.__akymunChatCleanup = () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }

  function bindParticipantHub(root, email, hub, reload, { bindChat = true } = {}) {
    root.querySelector('#hub-checkin')?.addEventListener('click', async () => {
      try {
        await global.AKYMUN_DB.participantCheckIn(email, hub.todayDayNo);
        await reload();
      } catch (ex) {
        alert(ex.message || 'Check-in başarısız');
      }
    });
    root.querySelector('#hub-refresh')?.addEventListener('click', () => reload());
    root.querySelector('#hub-session-save')?.addEventListener('click', async () => {
      try {
        await global.AKYMUN_DB.participantSetSession(
          email,
          root.querySelector('#hub-session-status')?.value,
          root.querySelector('#hub-session-note')?.value
        );
        await reload();
      } catch (ex) {
        alert(ex.message || 'Oturum kaydedilemedi');
      }
    });
    root.querySelectorAll('[data-save-note]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.getAttribute('data-save-note');
        const target = btn.getAttribute('data-target');
        const body = root.querySelector(`#${target}`)?.value || '';
        try {
          await global.AKYMUN_DB.participantSaveNote(email, key, body);
          btn.textContent = 'Kaydedildi';
          setTimeout(() => {
            btn.textContent = 'Kaydet';
          }, 1200);
        } catch (ex) {
          alert(ex.message || 'Not kaydedilemedi');
        }
      });
    });

    if (bindChat) bindCommissionChat(root, email);
  }

  function renderAdminEventsPanel(data, { canManage }) {
    if (!canManage) {
      return `<div class="empty">Etkinlik yönetimi için Editör veya üstü yetki gerekir (Görüntüleyici hariç).</div>`;
    }
    const { banner, announcements, rooms, resources, program, checkIns } = data;
    return `
      <div class="admin-header">
        <h2>Etkinlik</h2>
        <p style="margin:0;color:var(--muted);font-size:0.9rem">Duyuru, acil şerit, salon, program ve kaynaklar — katılımcıya anlık yansır.</p>
      </div>

      <div class="panel" style="padding:1.1rem;margin-bottom:1rem">
        <h3 class="hub-admin-h">Acil şerit</h3>
        <form id="evt-banner-form" class="hub-admin-form">
          <textarea name="message" rows="2" maxlength="500" placeholder="Örn. 2. oturum 15 dk gecikti">${esc(banner?.message || '')}</textarea>
          <label class="choice"><input type="checkbox" name="active" ${banner?.active ? 'checked' : ''}/><span>Şeridi göster</span></label>
          <label class="choice"><input type="checkbox" name="broadcast" checked/><span>Tüm komisyon sohbetlerine mesaj olarak gönder</span></label>
          <button type="submit" class="btn btn-primary btn-sm">Kaydet / yayınla</button>
        </form>
        <p class="hint" style="margin:0.55rem 0 0">Editör ve üstü. Sohbete gönderince her delege kendi komisyon sohbetinde görür.</p>
      </div>

      <div class="panel" style="padding:1.1rem;margin-bottom:1rem">
        <h3 class="hub-admin-h">Yeni duyuru</h3>
        <form id="evt-ann-form" class="hub-admin-form">
          <textarea name="body" rows="3" required placeholder="Duyuru metni"></textarea>
          <label class="choice"><input type="checkbox" name="pinned"/><span>Üste sabitle</span></label>
          <button type="submit" class="btn btn-primary btn-sm">Duyuru yayınla</button>
        </form>
        <div class="hub-anns" style="margin-top:1rem">
          ${(announcements || [])
            .map(
              (a) => `
            <article class="hub-ann ${a.pinned ? 'is-pinned' : ''}">
              <p>${esc(a.body)}</p>
              <div class="toolbar">
                <span class="hint">${esc(a.created_by || '')} · ${a.active ? 'aktif' : 'gizli'}</span>
                <button type="button" class="btn btn-danger btn-sm" data-del-ann="${esc(a.id)}">Sil</button>
              </div>
            </article>`
            )
            .join('') || '<p class="empty">Duyuru yok</p>'}
        </div>
      </div>

      <div class="panel" style="padding:1.1rem;margin-bottom:1rem">
        <h3 class="hub-admin-h">Komisyon salonları</h3>
        <div class="assign-grid">
          ${(rooms || [])
            .map(
              (r) => `
            <form class="assign-card evt-room-form" data-commission="${esc(r.commission)}">
              <strong>${esc(r.commission)}</strong>
              <label class="q">Salon</label>
              <input name="room_name" value="${esc(r.room_name || '')}" />
              <label class="q">Not</label>
              <input name="notes" value="${esc(r.notes || '')}" />
              <button type="submit" class="btn btn-ghost btn-sm">Kaydet</button>
            </form>`
            )
            .join('')}
        </div>
      </div>

      <div class="panel" style="padding:1.1rem;margin-bottom:1rem">
        <h3 class="hub-admin-h">Kaynaklar</h3>
        <form id="evt-res-form" class="hub-admin-form">
          <div class="row">
            <div><label class="q">Başlık</label><input name="title" required /></div>
            <div><label class="q">URL</label><input name="url" required placeholder="https://… veya assets/…" /></div>
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Kaynak ekle</button>
        </form>
        <ul class="hub-resources" style="margin-top:0.75rem">
          ${(resources || [])
            .map(
              (r) =>
                `<li>${esc(r.title)} — <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">aç</a>
                  <button type="button" class="btn btn-danger btn-sm" data-del-res="${esc(r.id)}">Sil</button></li>`
            )
            .join('')}
        </ul>
      </div>

      <div class="panel" style="padding:1.1rem;margin-bottom:1rem">
        <h3 class="hub-admin-h">Program akışı</h3>
        <p class="hint">Katılımcı hub’ında anlık görünür. Gün 1 = 28 Kasım, Gün 2 = 29 Kasım.</p>

        <form id="evt-program-add" class="hub-admin-form assign-card" style="margin-bottom:1rem">
          <strong>Yeni madde ekle</strong>
          <div class="row">
            <div>
              <label class="q">Gün</label>
              <select name="day_no" required>
                <option value="1">1. Gün (28 Kasım)</option>
                <option value="2">2. Gün (29 Kasım)</option>
              </select>
            </div>
            <div>
              <label class="q">Sıra</label>
              <input name="sort_order" type="number" value="${((program || []).length + 1) * 10}" />
            </div>
          </div>
          <div class="row">
            <div>
              <label class="q">Başlangıç</label>
              <input name="starts_at" type="time" required value="09:00" />
            </div>
            <div>
              <label class="q">Bitiş</label>
              <input name="ends_at" type="time" required value="10:00" />
            </div>
          </div>
          <label class="q">Başlık</label>
          <input name="title" required placeholder="Örn. Açılış oturumu" />
          <label class="q">Açıklama</label>
          <textarea name="description" rows="2" placeholder="Kısa açıklama"></textarea>
          <label class="q">Yer</label>
          <input name="location" placeholder="Örn. Ana salon" />
          <button type="submit" class="btn btn-primary btn-sm">Madde ekle</button>
        </form>

        <div class="assign-grid">
          ${(program || [])
            .map(
              (p) => `
            <form class="assign-card evt-program-form" data-id="${esc(p.id)}">
              <div class="assign-head">
                <strong>${esc(p.title || 'Madde')}</strong>
                <span class="hint">${esc(fmtTime(p.starts_at))}–${esc(fmtTime(p.ends_at))} · Gün ${p.day_no}</span>
              </div>
              <div class="row">
                <div>
                  <label class="q">Gün</label>
                  <select name="day_no" required>
                    <option value="1" ${Number(p.day_no) === 1 ? 'selected' : ''}>1. Gün</option>
                    <option value="2" ${Number(p.day_no) === 2 ? 'selected' : ''}>2. Gün</option>
                  </select>
                </div>
                <div>
                  <label class="q">Sıra</label>
                  <input name="sort_order" type="number" value="${Number(p.sort_order) || 0}" />
                </div>
              </div>
              <div class="row">
                <div>
                  <label class="q">Başlangıç</label>
                  <input name="starts_at" type="time" required value="${esc(fmtTime(p.starts_at))}" />
                </div>
                <div>
                  <label class="q">Bitiş</label>
                  <input name="ends_at" type="time" required value="${esc(fmtTime(p.ends_at))}" />
                </div>
              </div>
              <label class="q">Başlık</label>
              <input name="title" required value="${esc(p.title || '')}" />
              <label class="q">Açıklama</label>
              <textarea name="description" rows="2">${esc(p.description || '')}</textarea>
              <label class="q">Yer</label>
              <input name="location" value="${esc(p.location || '')}" />
              <label class="choice"><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}/><span>Aktif (katılımcıda görünsün)</span></label>
              <div class="toolbar">
                <button type="submit" class="btn btn-primary btn-sm">Kaydet</button>
                <button type="button" class="btn btn-danger btn-sm" data-del-program="${esc(p.id)}">Sil</button>
              </div>
            </form>`
            )
            .join('') || '<p class="empty">Henüz program maddesi yok. Yukarıdan ekleyin.</p>'}
        </div>
      </div>

      <div class="panel" style="padding:1.1rem">
        <h3 class="hub-admin-h">Check-in’ler</h3>
        <p class="hint">Son ${(checkIns || []).length} kayıt</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>E-posta</th><th>Gün</th><th>Zaman</th></tr></thead>
            <tbody>
              ${(checkIns || [])
                .slice(0, 40)
                .map(
                  (c) =>
                    `<tr><td>${esc(c.email)}</td><td>${c.day_no}</td><td>${esc(c.checked_in_at || '')}</td></tr>`
                )
                .join('') || '<tr><td colspan="3">Henüz yok</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  global.AKYMUN_CONF = {
    SESSION_LABELS,
    HUB_TABS,
    resolveHubTab,
    renderParticipantHub,
    bindParticipantHub,
    renderAdminEventsPanel,
  };
})(window);
