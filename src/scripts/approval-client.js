const main = document.querySelector('.approval-page');

if (main) {
  const status = document.getElementById('approval-status');
  const signInPanel = document.getElementById('approval-signin-panel');
  const signInButton = document.getElementById('approval-signin');
  const googleButton = document.getElementById('approval-google-button');
  const requestPanel = document.getElementById('approval-request');
  const actions = document.getElementById('approval-actions');
  const acceptButton = document.getElementById('approval-accept');
  const cancelButton = document.getElementById('approval-cancel');
  const recoverButton = document.getElementById('approval-recover');
  const retryButton = document.getElementById('approval-retry');
  const state = document.getElementById('approval-state');
  const outcome = document.getElementById('approval-outcome');
  const calendarLink = document.getElementById('approval-calendar-link');
  const token = new URL(window.location.href).searchParams.get('r') || '';
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);
  const currency = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const dateFormat = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
  const timeFormat = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' });
  const controllers = new Set();
  let session = null;
  let summary = null;
  let active = true;
  let busy = false;
  let googleLoading = null;

  function setStatus(message, error = false) {
    status.textContent = message;
    status.dataset.tone = error ? 'error' : 'normal';
  }

  function setBusy(value, action = '') {
    busy = value;
    main.setAttribute('aria-busy', String(value));
    acceptButton.disabled = value;
    cancelButton.disabled = value;
    recoverButton.disabled = value;
    retryButton.disabled = value;
    signInButton.disabled = value;
    acceptButton.textContent = value && action === 'accept' ? 'Memeriksa dan menyimpan…' : 'Terima booking';
    cancelButton.textContent = value && action === 'cancel' ? 'Membatalkan…' : 'Batalkan permintaan';
    recoverButton.textContent = value && action === 'recover' ? 'Memeriksa penyimpanan…' : 'Periksa penyimpanan';
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(path, {
        ...options,
        credentials: 'same-origin',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
        headers: { Accept: 'application/json', ...options.headers },
      });
      let data;
      try { data = await response.json(); } catch { throw Object.assign(new Error('response'), { status: response.status || 502 }); }
      if (!response.ok) throw Object.assign(new Error('request'), { status: response.status, code: data?.code });
      if (!active) throw new DOMException('Inactive page', 'AbortError');
      return data;
    } finally {
      window.clearTimeout(timeout);
      controllers.delete(controller);
    }
  }

  function clearPrivateDetails() {
    summary = null;
    requestPanel.hidden = true;
    actions.hidden = true;
    recoverButton.hidden = true;
    calendarLink.hidden = true;
    calendarLink.removeAttribute('href');
    document.querySelectorAll('[data-approval-value]').forEach(element => {
      element.textContent = '';
      if (element.tagName === 'A') element.removeAttribute('href');
    });
  }

  function showSignIn(message = 'Masuk untuk melihat permintaan booking ini.') {
    clearPrivateDetails();
    signInPanel.hidden = false;
    googleButton.hidden = true;
    googleButton.replaceChildren();
    signInButton.hidden = false;
    retryButton.hidden = true;
    setStatus(message);
  }

  function showFailure(error, duringAction = false) {
    if (!active) return;
    if (error.status === 401) {
      session = null;
      showSignIn('Sesi berakhir. Masuk kembali untuk melanjutkan.');
      return;
    }
    if (error.status === 403) {
      session = null;
      if (error.code === 'AUTH_CSRF') {
        showSignIn('Sesi perlu diperbarui. Masuk kembali untuk melanjutkan.');
        return;
      }
      clearPrivateDetails();
      signInPanel.hidden = false;
      googleButton.hidden = true;
      googleButton.replaceChildren();
      signInButton.hidden = false;
      setStatus('Akun ini belum memiliki akses. Gunakan akun Google pemilik Chii.', true);
      return;
    }
    if (error.status === 404 || error.status === 410) {
      clearPrivateDetails();
      signInPanel.hidden = true;
      retryButton.hidden = true;
      setStatus('Tautan tidak ditemukan atau sudah kedaluwarsa. Minta pelanggan mengirim ulang permintaannya.', true);
      return;
    }
    if (error.status === 503) {
      if (!summary) signInPanel.hidden = true;
      setStatus(duringAction ? 'Status penyimpanan belum dapat dipastikan. Periksa status terbaru sebelum mencoba kembali.' : 'Konfirmasi online belum tersedia. Periksa permintaan melalui WhatsApp; halaman ini belum mengubah jadwal.', true);
    } else if (error.status === 409) {
      setStatus('Jadwal atau status permintaan sudah berubah. Periksa ulang sebelum melanjutkan.', true);
      actions.hidden = true;
    } else if (error.status === 429) {
      setStatus('Terlalu banyak permintaan. Tunggu sebentar, lalu coba lagi.', true);
    } else {
      setStatus(duringAction ? 'Hasil tindakan belum dapat dipastikan. Periksa status terbaru sebelum mencoba kembali.' : 'Permintaan belum dapat dimuat. Periksa koneksi, lalu coba lagi.', true);
    }
    retryButton.hidden = false;
    if (duringAction) {
      actions.hidden = true;
      recoverButton.hidden = true;
    }
  }

  function checkedSummary(data) {
    const item = data?.summary || data;
    const statuses = ['pending', 'approving', 'reconcile', 'accepted', 'cancelled', 'expired'];
    if (!item || !statuses.includes(item.status) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80) throw new Error('summary');
    if (!/^\+?[0-9]{8,16}$/.test(String(item.whatsapp || ''))) throw new Error('summary');
    const amounts = ['agreedPrice', 'deposit', 'remainingBalance'];
    if (amounts.some(key => !Number.isSafeInteger(item[key]) || item[key] < 0 || item[key] > 100000000)) throw new Error('summary');
    if (item.agreedPrice < 1 || item.deposit !== Math.ceil(item.agreedPrice / 10) || item.remainingBalance !== item.agreedPrice - item.deposit) throw new Error('summary');
    const start = new Date(item.startISO);
    const end = new Date(item.endISO);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end.getTime() - start.getTime() !== 7200000) throw new Error('summary');
    return { ...item, start, end };
  }

  function renderSummary(data) {
    const item = checkedSummary(data);
    summary = item;
    signInPanel.hidden = true;
    retryButton.hidden = true;
    requestPanel.hidden = false;
    const values = {
      name: item.name,
      whatsapp: item.whatsapp,
      date: dateFormat.format(item.start),
      time: `${timeFormat.format(item.start)}–${timeFormat.format(item.end)} WIB`,
      agreedPrice: currency.format(item.agreedPrice),
      deposit: currency.format(item.deposit),
      remainingBalance: currency.format(item.remainingBalance),
    };
    document.querySelectorAll('[data-approval-value]').forEach(element => {
      element.textContent = values[element.dataset.approvalValue] || '';
      if (element.dataset.approvalValue === 'whatsapp') element.href = `https://wa.me/${item.whatsapp.replace(/^\+/, '')}`;
    });
    const labels = { pending: 'Menunggu konfirmasi', approving: 'Sedang diproses', reconcile: 'Perlu pemeriksaan', accepted: 'Diterima', cancelled: 'Dibatalkan', expired: 'Kedaluwarsa' };
    state.textContent = labels[item.status];
    actions.hidden = item.status !== 'pending';
    recoverButton.hidden = item.status !== 'approving' && item.status !== 'reconcile';
    calendarLink.hidden = true;
    calendarLink.removeAttribute('href');
    outcome.hidden = item.status === 'pending';
    const messages = {
      pending: 'Periksa nominal, pembayaran DP, dan jadwal sebelum menerima.',
      accepted: 'Booking diterima dan tersimpan di kalender.',
      cancelled: 'Permintaan dibatalkan. Jadwal tidak ditambahkan ke kalender.',
      expired: 'Permintaan ini sudah kedaluwarsa. Pelanggan perlu mengirim permintaan baru.',
      approving: 'Permintaan sedang diproses. Tunggu sebentar, lalu periksa penyimpanan jika status belum berubah.',
      reconcile: 'Hasil penyimpanan kalender belum pasti. Periksa penyimpanan untuk memastikan hasilnya; jadwal tidak dikirim ulang otomatis.',
    };
    setStatus(messages[item.status]);
    outcome.textContent = item.status === 'accepted' ? 'Selesai. Booking ini tidak perlu diterima lagi.' : messages[item.status];
    if (item.status === 'approving' || item.status === 'reconcile') {
      retryButton.hidden = false;
      retryButton.textContent = 'Periksa status';
    } else retryButton.textContent = 'Coba lagi';
    if (item.status === 'accepted' && typeof item.calendarEventUrl === 'string') {
      try {
        const url = new URL(item.calendarEventUrl);
        if (url.protocol === 'https:' && (url.hostname === 'calendar.google.com' || (url.hostname === 'www.google.com' && url.pathname.startsWith('/calendar/'))) && !url.username && !url.password) {
          calendarLink.href = url.href;
          calendarLink.hidden = false;
        }
      } catch { /* A missing or invalid event URL never changes the confirmed status. */ }
    }
  }

  async function loadReview() {
    const data = await api(`/api/booking/review?token=${encodeURIComponent(token)}`);
    renderSummary(data);
  }

  async function boot() {
    signInPanel.hidden = true;
    if (!validToken) {
      setBusy(false);
      setStatus('Tautan booking tidak lengkap. Buka kembali tautan yang dikirim pelanggan.', true);
      return;
    }
    setBusy(true);
    retryButton.hidden = true;
    try {
      session = await api('/api/booking/auth/session');
      if (session?.authenticated === true) await loadReview();
      else showSignIn();
    } catch (error) { showFailure(error); }
    finally { if (active) setBusy(false); }
  }

  function loadGoogle() {
    if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
    if (googleLoading) return googleLoading;
    googleLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      const timeout = window.setTimeout(() => finish(new Error('google-timeout')), 12000);
      function finish(error) {
        window.clearTimeout(timeout);
        script.onload = null;
        script.onerror = null;
        if (error || !window.google?.accounts?.id) {
          script.remove();
          googleLoading = null;
          reject(error || new Error('google-unavailable'));
        } else resolve(window.google.accounts.id);
      }
      script.onload = () => finish();
      script.onerror = () => finish(new Error('google-unavailable'));
      document.head.append(script);
    });
    return googleLoading;
  }

  async function finishSignIn(response) {
    if (!active || busy || typeof response?.credential !== 'string') return;
    setBusy(true);
    setStatus('Memverifikasi akun…');
    try {
      session = await api('/api/booking/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
        body: JSON.stringify({ credential: response.credential, nonce: session.nonce }),
      });
      if (session?.authenticated !== true) throw Object.assign(new Error('auth'), { status: 403 });
      await loadReview();
    } catch (error) { showFailure(error); }
    finally { if (active) setBusy(false); }
  }

  signInButton.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    setStatus('Menyiapkan halaman masuk Google…');
    try {
      session = await api('/api/booking/auth/session');
      if (session?.authenticated === true) {
        await loadReview();
        return;
      }
      if (!/^[A-Za-z0-9-]{5,200}\.apps\.googleusercontent\.com$/.test(session?.clientId || '') || typeof session?.nonce !== 'string' || typeof session?.csrfToken !== 'string') {
        throw Object.assign(new Error('configuration'), { status: 503 });
      }
      const google = await loadGoogle();
      if (!active) return;
      google.initialize({ client_id: session.clientId, nonce: session.nonce, callback: finishSignIn, auto_select: false, ux_mode: 'popup' });
      googleButton.hidden = false;
      googleButton.replaceChildren();
      google.renderButton(googleButton, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: Math.min(320, googleButton.clientWidth), locale: 'id' });
      signInButton.hidden = true;
      setStatus('Pilih tombol Google untuk masuk dengan akun pemilik Chii.');
    } catch (error) { showFailure(error); }
    finally { if (active) setBusy(false); }
  });

  async function decide(action, recovery = false) {
    const allowed = recovery ? action === 'accept' && ['approving', 'reconcile'].includes(summary?.status) : summary?.status === 'pending';
    if (busy || !allowed || session?.authenticated !== true || typeof session.csrfToken !== 'string') return;
    setBusy(true, recovery ? 'recover' : action);
    retryButton.hidden = true;
    setStatus(recovery ? 'Memeriksa hasil penyimpanan di kalender…' : action === 'accept' ? 'Memeriksa jadwal dan menambahkan booking…' : 'Membatalkan permintaan…');
    try {
      const data = await api(`/api/booking/review?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
        body: JSON.stringify({ action }),
      });
      renderSummary(data);
    } catch (error) { showFailure(error, true); }
    finally { if (active) setBusy(false); }
  }

  acceptButton.addEventListener('click', () => decide('accept'));
  cancelButton.addEventListener('click', () => decide('cancel'));
  recoverButton.addEventListener('click', () => decide('accept', true));
  retryButton.addEventListener('click', () => { if (!busy) boot(); });
  window.addEventListener('pagehide', () => {
    active = false;
    controllers.forEach(controller => controller.abort());
    clearPrivateDetails();
    session = null;
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      active = true;
      boot();
    }
  });
  boot();
}
