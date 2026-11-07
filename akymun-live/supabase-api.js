/**
 * AKYMUN'26 — Supabase data layer (anon key only; RLS + RPCs enforce access)
 */
(function (global) {
  const cfg = global.AKYMUN_CONFIG;
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) {
    console.error('AKYMUN_CONFIG eksik');
    return;
  }
  if (!global.supabase?.createClient) {
    console.error('supabase-js yüklenmedi');
    return;
  }

  const sb = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: global.localStorage,
    },
    realtime: { params: { eventsPerSecond: 2 } },
  });

  const ROLE_PERMS = {
    viewer: ['view_applications'],
    editor: [
      'view_applications',
      'export',
      'manage_applications',
      'assign_delegate',
      'manage_events',
    ],
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

  function rowToApp(r) {
    if (!r) return null;
    return {
      id: r.id,
      submittedAt: r.submitted_at,
      adSoyad: r.ad_soyad,
      dogumTarihi: r.dogum_tarihi,
      email: r.email,
      telefon: r.telefon,
      ingilizce: r.ingilizce,
      turkce: r.turkce,
      egitim: r.egitim,
      bolum: r.bolum,
      munDeneyimi: r.mun_deneyimi,
      basariSertifika: r.basari_sertifika,
      taahhut: r.taahhut,
      saglik: r.saglik,
      vatandaslik: r.vatandaslik,
      kvkk: !!r.kvkk,
      fotoVideoRiza: r.foto_video_riza,
      status: r.status,
      assignedCountry: r.assigned_country || '',
      commission: r.commission || '',
      participantRole: r.participant_role || '',
      decidedAt: r.decided_at || '',
      decidedBy: r.decided_by || '',
      allowResubmit: !!r.allow_resubmit,
    };
  }

  function lookupToApp(j) {
    if (!j) return null;
    return {
      id: j.id,
      email: j.email,
      adSoyad: j.adSoyad,
      status: j.status,
      allowResubmit: !!j.allowResubmit,
      assignedCountry: j.assignedCountry || '',
      commission: j.commission || '',
      participantRole: j.participantRole || '',
      submittedAt: j.submittedAt || '',
    };
  }

  function rowToStaff(r) {
    return {
      id: r.id,
      username: r.username,
      name: r.name,
      role: r.role,
      permissions: (ROLE_PERMS[r.role] || ROLE_PERMS.viewer).slice(),
      createdAt: r.created_at,
    };
  }

  function errMessage(error, fallback) {
    if (!error) return fallback;
    const m = error.message || String(error);
    const known = [
      'Bu e-posta ile başvurunuz',
      'Yetkiniz yok',
      'zaten var',
      'zaten kayıtlı',
      'Katılımcı erişimi',
      'Ülke, komisyon',
      'Oturum durumu',
      'Geçersiz',
    ];
    if (known.some((k) => m.includes(k))) return m;
    return fallback || m;
  }

  async function lookupApplication(email) {
    const { data, error } = await sb.rpc('lookup_application', {
      p_email: String(email || '').trim().toLowerCase(),
    });
    if (error) throw new Error(errMessage(error, 'Başvuru sorgulanamadı.'));
    return lookupToApp(data);
  }

  async function submitApplication(payload) {
    const { data, error } = await sb.rpc('submit_application', {
      p_payload: {
        ...payload,
        kvkk: payload.kvkk === true || payload.kvkk === 'true' ? 'true' : 'false',
      },
    });
    if (error) throw new Error(errMessage(error, 'Başvuru gönderilemedi.'));
    return data;
  }

  async function loadApplications() {
    const { data, error } = await sb
      .from('applications')
      .select('*')
      .order('submitted_at', { ascending: false });
    if (error) throw new Error(errMessage(error, 'Başvurular yüklenemedi.'));
    return (data || []).map(rowToApp);
  }

  async function updateApplication(id, patch) {
    const row = {};
    if ('status' in patch) row.status = patch.status;
    if ('assignedCountry' in patch) row.assigned_country = patch.assignedCountry;
    if ('commission' in patch) row.commission = patch.commission;
    if ('participantRole' in patch) row.participant_role = patch.participantRole;
    if ('decidedAt' in patch) row.decided_at = patch.decidedAt || null;
    if ('decidedBy' in patch) row.decided_by = patch.decidedBy || '';
    if ('allowResubmit' in patch) row.allow_resubmit = !!patch.allowResubmit;
    row.updated_at = new Date().toISOString();
    const { error } = await sb.from('applications').update(row).eq('id', id);
    if (error) throw new Error(errMessage(error, 'Güncelleme başarısız.'));
  }

  async function loadStaff() {
    const { data, error } = await sb.from('staff_profiles').select('*').order('created_at', { ascending: true });
    if (error) throw new Error(errMessage(error, 'Yetkililer yüklenemedi.'));
    return (data || []).map(rowToStaff);
  }

  async function fetchStaffSession() {
    const { data: authData } = await sb.auth.getSession();
    const session = authData?.session;
    if (!session?.user) return null;
    const { data, error } = await sb
      .from('staff_profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error || !data) {
      await sb.auth.signOut();
      return null;
    }
    return rowToStaff(data);
  }

  async function login(username, password) {
    const { data: email, error: rpcErr } = await sb.rpc('resolve_staff_email', {
      p_username: String(username || '').trim(),
    });
    if (rpcErr) throw new Error(errMessage(rpcErr, 'Giriş yapılamadı.'));
    if (!email) throw new Error('Kullanıcı adı veya şifre hatalı.');
    const { error } = await sb.auth.signInWithPassword({ email, password: String(password || '') });
    if (error) throw new Error('Kullanıcı adı veya şifre hatalı.');
    return fetchStaffSession();
  }

  async function logout() {
    await sb.auth.signOut();
  }

  async function createStaff({ username, password, name, role }) {
    const { data, error } = await sb.rpc('create_staff_user', {
      p_username: username,
      p_password: password,
      p_name: name,
      p_role: role,
      p_email: null,
    });
    if (error) throw new Error(errMessage(error, 'Yetkili eklenemedi.'));
    return data;
  }

  async function deleteStaff(userId) {
    const { error } = await sb.rpc('delete_staff_user', { p_user_id: userId });
    if (error) throw new Error(errMessage(error, 'Yetkili silinemedi.'));
  }

  async function changePassword(newPassword) {
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw new Error(errMessage(error, 'Şifre güncellenemedi.'));
  }

  /* —— Conference hub —— */
  async function getParticipantHub(email) {
    const { data, error } = await sb.rpc('get_participant_hub', {
      p_email: String(email || '').trim().toLowerCase(),
    });
    if (error) throw new Error(errMessage(error, 'Etkinlik verisi yüklenemedi.'));
    return data;
  }

  async function participantCheckIn(email, dayNo) {
    const { data, error } = await sb.rpc('participant_check_in', {
      p_email: String(email || '').trim().toLowerCase(),
      p_day_no: dayNo ?? null,
    });
    if (error) throw new Error(errMessage(error, 'Check-in yapılamadı.'));
    return data;
  }

  async function participantSaveNote(email, noteKey, body) {
    const { data, error } = await sb.rpc('participant_save_note', {
      p_email: String(email || '').trim().toLowerCase(),
      p_note_key: noteKey,
      p_body: body,
    });
    if (error) throw new Error(errMessage(error, 'Not kaydedilemedi.'));
    return data;
  }

  async function participantSetSession(email, status, note) {
    const { data, error } = await sb.rpc('participant_set_session', {
      p_email: String(email || '').trim().toLowerCase(),
      p_status: status,
      p_note: note ?? null,
    });
    if (error) throw new Error(errMessage(error, 'Oturum güncellenemedi.'));
    return data;
  }

  async function loadProgram() {
    const { data, error } = await sb.from('program_items').select('*').order('day_no').order('sort_order');
    if (error) throw new Error(errMessage(error, 'Program yüklenemedi.'));
    return data || [];
  }

  async function loadAnnouncementsAdmin() {
    const { data, error } = await sb.from('announcements').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(errMessage(error, 'Duyurular yüklenemedi.'));
    return data || [];
  }

  async function loadBanner() {
    const { data, error } = await sb.from('site_banner').select('*').eq('id', 1).maybeSingle();
    if (error) throw new Error(errMessage(error, 'Banner yüklenemedi.'));
    return data || { id: 1, message: '', active: false };
  }

  async function loadRooms() {
    const { data, error } = await sb.from('commission_rooms').select('*').order('commission');
    if (error) throw new Error(errMessage(error, 'Salonlar yüklenemedi.'));
    return data || [];
  }

  async function loadResourcesAdmin() {
    const { data, error } = await sb.from('resources').select('*').order('sort_order');
    if (error) throw new Error(errMessage(error, 'Kaynaklar yüklenemedi.'));
    return data || [];
  }

  async function loadCheckIns() {
    const { data, error } = await sb.from('check_ins').select('*').order('checked_in_at', { ascending: false });
    if (error) throw new Error(errMessage(error, 'Check-in listesi yüklenemedi.'));
    return data || [];
  }

  async function upsertAnnouncement({ id, body, pinned, active, createdBy }) {
    const row = {
      id: id || `a_${Date.now().toString(36)}`,
      body: String(body || '').trim(),
      pinned: !!pinned,
      active: active !== false,
      created_by: createdBy || '',
    };
    if (!row.body) throw new Error('Duyuru metni boş olamaz.');
    const { error } = await sb.from('announcements').upsert(row);
    if (error) throw new Error(errMessage(error, 'Duyuru kaydedilemedi.'));
    return row;
  }

  async function deleteAnnouncement(id) {
    const { error } = await sb.from('announcements').delete().eq('id', id);
    if (error) throw new Error(errMessage(error, 'Duyuru silinemedi.'));
  }

  async function saveBanner({ message, active, broadcastChat }) {
    const { data, error } = await sb.rpc('publish_site_banner', {
      p_message: String(message || ''),
      p_active: !!active,
      p_broadcast_chat: !!broadcastChat,
    });
    if (error) throw new Error(errMessage(error, 'Acil şerit kaydedilemedi.'));
    return data;
  }

  async function saveRoom({ commission, room_name, notes }) {
    const { error } = await sb
      .from('commission_rooms')
      .upsert({ commission, room_name: room_name || '', notes: notes || '' });
    if (error) throw new Error(errMessage(error, 'Salon kaydedilemedi.'));
  }

  async function saveResource({ id, title, url, sort_order, active }) {
    const row = {
      id: id || `res_${Date.now().toString(36)}`,
      title: String(title || '').trim(),
      url: String(url || '').trim(),
      sort_order: Number(sort_order) || 0,
      active: active !== false,
    };
    if (!row.title || !row.url) throw new Error('Başlık ve bağlantı zorunlu.');
    const { error } = await sb.from('resources').upsert(row);
    if (error) throw new Error(errMessage(error, 'Kaynak kaydedilemedi.'));
  }

  async function deleteResource(id) {
    const { error } = await sb.from('resources').delete().eq('id', id);
    if (error) throw new Error(errMessage(error, 'Kaynak silinemedi.'));
  }

  async function saveProgramItem(input) {
    const row = {
      id: input.id || `p_${Date.now().toString(36)}`,
      day_no: Number(input.day_no) === 2 ? 2 : 1,
      starts_at: String(input.starts_at || '').slice(0, 8),
      ends_at: String(input.ends_at || '').slice(0, 8),
      title: String(input.title || '').trim(),
      description: String(input.description || '').trim(),
      location: String(input.location || '').trim(),
      sort_order: Number(input.sort_order) || 0,
      active: input.active !== false && input.active !== 'false',
    };
    if (!row.title) throw new Error('Program başlığı zorunlu.');
    if (!row.starts_at || !row.ends_at) throw new Error('Başlangıç ve bitiş saati zorunlu.');
    // Normalize HH:MM → HH:MM:00 for Postgres time
    if (/^\d{2}:\d{2}$/.test(row.starts_at)) row.starts_at += ':00';
    if (/^\d{2}:\d{2}$/.test(row.ends_at)) row.ends_at += ':00';
    const { error } = await sb.from('program_items').upsert(row);
    if (error) throw new Error(errMessage(error, 'Program kaydedilemedi.'));
    return row;
  }

  async function deleteProgramItem(id) {
    const { error } = await sb.from('program_items').delete().eq('id', id);
    if (error) throw new Error(errMessage(error, 'Program maddesi silinemedi.'));
  }

  async function getCommissionChat(email, afterId = 0) {
    const { data, error } = await sb.rpc('get_commission_chat', {
      p_email: String(email || '').trim().toLowerCase(),
      p_after_id: Number(afterId) || 0,
      p_limit: 40,
    });
    if (error) throw new Error(errMessage(error, 'Sohbet yüklenemedi.'));
    return Array.isArray(data) ? data : [];
  }

  async function sendCommissionChat(email, body) {
    const { data, error } = await sb.rpc('send_commission_chat', {
      p_email: String(email || '').trim().toLowerCase(),
      p_body: String(body || ''),
    });
    if (error) throw new Error(errMessage(error, 'Mesaj gönderilemedi.'));
    return data;
  }

  function subscribeConference(onChange) {
    const channel = sb
      .channel('akymun-conference')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_banner' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'program_items' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commission_sessions' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commission_rooms' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' }, onChange)
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }

  global.AKYMUN_DB = {
    sb,
    ROLE_PERMS,
    lookupApplication,
    submitApplication,
    loadApplications,
    updateApplication,
    loadStaff,
    fetchStaffSession,
    login,
    logout,
    createStaff,
    deleteStaff,
    changePassword,
    getParticipantHub,
    participantCheckIn,
    participantSaveNote,
    participantSetSession,
    loadProgram,
    loadAnnouncementsAdmin,
    loadBanner,
    loadRooms,
    loadResourcesAdmin,
    loadCheckIns,
    upsertAnnouncement,
    deleteAnnouncement,
    saveBanner,
    saveRoom,
    saveResource,
    deleteResource,
    saveProgramItem,
    deleteProgramItem,
    getCommissionChat,
    sendCommissionChat,
    subscribeConference,
  };
})(window);
