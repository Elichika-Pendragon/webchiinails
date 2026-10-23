import { priceFields, validPrices, validPriceSnapshot, MAX_PRICE } from '../pricing.js';

import { initOrderEditor } from './order-editor.js';

const main = document.querySelector('.price-editor');
if (main) {
  const byId = id => document.getElementById(`prices-${id}`);
  const form = byId('form'), status = byId('status'), saveStatus = byId('save-status');
  const signInPanel = byId('signin-panel'), signIn = byId('signin'), googleButton = byId('google-button');
  const save = byId('save'), retry = byId('retry'), reload = byId('reload'), signOut = byId('signout');
  const base = form.querySelector('[data-price-base]'), glue = form.querySelector('[data-price-glue]');
  const minFields = new Map(priceFields.map(field => [field.id, form.querySelector(`[data-price-min="${field.id}"]`)]));
  const maxFields = new Map(priceFields.map(field => [field.id, form.querySelector(`[data-price-max="${field.id}"]`)]));
  let session = null, snapshot = null, busy = false, dirty = false, conflict = false, uncertain = false;
  let googleLoading = null;
  const orders = initOrderEditor(main.querySelector('[data-order-editor]'), { getSession: () => session, getPrices: () => api('/api/booking/prices') });
  const setStatus = (text, error = false) => { status.textContent = text; status.dataset.tone = error ? 'error' : 'normal'; };
  const message = error => ({
    AUTH_FORBIDDEN: 'Akun ini bukan akun pemilik Chii. Pilih akun Google pemilik.',
    AUTH_CSRF: 'Sesi keamanan perlu diperbarui. Masuk kembali; perubahan di form tetap ada.',
    PRICES_INPUT: 'Periksa nominal: angka rupiah utuh dan harga tertinggi tidak di bawah minimum.',
    PRICES_UNAVAILABLE: 'Harga belum dapat diakses. Coba lagi setelah koneksi pulih.',
  })[error.code] || 'Koneksi atau layanan belum tersedia. Coba lagi setelah koneksi pulih.';
  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(path, { ...options, credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal, headers: { Accept: 'application/json', ...options.headers } });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error('Request failed'), { status: response.status, code: data?.error?.code });
      return data;
    } finally { clearTimeout(timeout); }
  }
  function readDraft() {
    const parse = (node, optional = false) => {
      node.setCustomValidity('');
      if (optional && node.value === '') return null;
      if (!/^[0-9]+$/.test(node.value) || !Number.isSafeInteger(Number(node.value)) || Number(node.value) > MAX_PRICE) {
        node.setCustomValidity('Isi angka rupiah utuh antara 0 dan 10000000.'); return NaN;
      }
      return Number(node.value);
    };
    const draft = { base: parse(base), glue: parse(glue), items: {} };
    for (const field of priceFields) {
      const price = parse(minFields.get(field.id)); const max = parse(maxFields.get(field.id), true);
      if (max !== null && max < price) maxFields.get(field.id).setCustomValidity('Harga tertinggi harus sama atau lebih besar dari minimum.');
      draft.items[field.id] = { price, max };
    }
    return draft;
  }
  function sync() {
    const draft = readDraft();
    dirty = Boolean(snapshot && JSON.stringify(draft) !== JSON.stringify(snapshot.prices));
    save.disabled = busy || conflict || !session?.authenticated || !dirty || !validPrices(draft);
    if (!busy && !conflict) saveStatus.textContent = dirty ? 'Ada perubahan yang belum disimpan.' : 'Semua harga sudah tersimpan.';
    return draft;
  }
  function setBusy(value) {
    busy = value; main.setAttribute('aria-busy', String(value));
    form.querySelectorAll('fieldset').forEach(field => { field.disabled = value; });
    signIn.disabled = value; signOut.disabled = value; retry.disabled = value; reload.disabled = value;
    save.textContent = value ? 'Memproses…' : uncertain ? 'Periksa & simpan lagi' : 'Simpan semua harga';
    sync();
  }
  function fill(value) {
    if (!validPriceSnapshot(value)) throw new Error('Invalid prices');
    snapshot = value;
    base.value = String(value.prices.base); glue.value = String(value.prices.glue);
    for (const field of priceFields) {
      minFields.get(field.id).value = String(value.prices.items[field.id].price);
      maxFields.get(field.id).value = value.prices.items[field.id].max === null ? '' : String(value.prices.items[field.id].max);
    }
    conflict = false; uncertain = false; reload.hidden = true; sync();
  }
  function showSignIn(text) {
    session = null; orders.setSession(null); signInPanel.hidden = false; signIn.hidden = false; googleButton.hidden = true;
    googleButton.replaceChildren(); retry.hidden = true;
    setStatus(text); sync();
  }
  function fail(error) {
    if (error.status === 401 || error.code === 'AUTH_CSRF') showSignIn('Sesi berakhir. Masuk kembali untuk menyimpan; perubahan di form tetap ada.');
    else { setStatus(message(error), true); retry.hidden = !form.hidden; }
  }
  async function load({ discard = false } = {}) {
    setBusy(true); retry.hidden = true;
    try {
      session = await api('/api/booking/auth/session');
      if (!session.authenticated) { showSignIn('Masuk dengan akun pemilik untuk mengubah harga.'); return; }
      const latest = await api('/api/booking/prices');
      if (!dirty || discard) fill(latest);
      signInPanel.hidden = true; form.hidden = false; orders.setSession(session);
      setStatus('Akses pemilik terverifikasi. Harga baru tampil di website dalam sekitar satu menit setelah disimpan.');
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  }
  function loadGoogle() {
    if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
    if (googleLoading) return googleLoading;
    googleLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => { script.remove(); reject(new Error('Sign-in unavailable')); }, 12000);
      script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.referrerPolicy = 'no-referrer';
      script.onload = () => { clearTimeout(timer); window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Sign-in unavailable')); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Sign-in unavailable')); };
      document.head.append(script);
    }).catch(error => { googleLoading = null; throw error; });
    return googleLoading;
  }
  async function finishSignIn(result, challenge) {
    setBusy(true);
    try {
      session = await api('/api/booking/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': challenge.csrfToken }, body: JSON.stringify({ credential: result.credential, nonce: challenge.nonce }) });
      await load();
    } catch (error) { showSignIn(message(error)); }
    finally { setBusy(false); }
  }
  signIn.addEventListener('click', async () => {
    setBusy(true);
    try {
      const challenge = await api('/api/booking/auth/session');
      if (challenge.authenticated) { await load(); return; }
      if (!challenge.clientId || !challenge.nonce || !challenge.csrfToken) throw new Error('Sign-in unavailable');
      const google = await loadGoogle();
      google.initialize({ client_id: challenge.clientId, nonce: challenge.nonce, callback: result => finishSignIn(result, challenge), auto_select: false, ux_mode: 'popup' });
      googleButton.replaceChildren(); googleButton.hidden = false; signIn.hidden = true;
      google.renderButton(googleButton, { theme: 'outline', size: 'large', type: 'standard', locale: 'id', width: Math.min(320, googleButton.clientWidth || 280) });
      setStatus('Pilih akun Google pemilik Chii.');
    } catch (error) { showSignIn(message(error)); }
    finally { setBusy(false); }
  });
  form.addEventListener('input', sync);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const draft = sync();
    if (busy || conflict || !dirty || !session?.authenticated || !form.reportValidity() || !validPrices(draft)) return;
    setBusy(true); setStatus('Menyimpan seluruh daftar harga…');
    try {
      // Resolve an uncertain previous response before retrying its mutation.
      if (uncertain) {
        const latest = await api('/api/booking/prices');
        if (!validPriceSnapshot(latest)) throw new Error('Invalid prices');
        if (JSON.stringify(latest.prices) === JSON.stringify(draft)) { fill(latest); setStatus('Harga sudah tersimpan. Website diperbarui dalam sekitar satu menit.'); return; }
        if (latest.revision !== snapshot.revision) throw Object.assign(new Error('Conflict'), { status: 409 });
      }
      const result = await api('/api/booking/prices', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ revision: snapshot.revision, prices: draft }) });
      fill(result); setStatus('Semua harga berhasil disimpan. Website diperbarui dalam sekitar satu menit.');
    } catch (error) {
      if (error.status === 409) {
        conflict = true; reload.hidden = false;
        setStatus('Harga telah berubah dari tab lain. Muat harga tersimpan sebelum mengedit lagi. Perubahan di form belum disimpan.', true);
        saveStatus.textContent = 'Versi harga berbeda. Muat harga tersimpan untuk melanjutkan.';
      } else { uncertain = true; fail(error); if (error.status !== 401) setStatus(`${message(error)} Perubahan di form tetap ada; periksa & simpan lagi untuk memastikan hasilnya.`, true); }
    } finally { setBusy(false); }
  });
  retry.addEventListener('click', () => load());
  reload.addEventListener('click', () => load({ discard: true }));
  signOut.addEventListener('click', async () => {
    if (busy) return;
    if (dirty || orders.isDirty?.()) { setStatus('Simpan perubahan harga / rincian pesanan atau muat ulang halaman untuk membuangnya sebelum keluar.', true); return; }
    setBusy(true);
    try {
      await api('/api/booking/auth/session', { method: 'DELETE', headers: { 'X-CSRF-Token': session.csrfToken } });
      form.reset(); snapshot = null; dirty = false; form.hidden = true; showSignIn('Kamu sudah keluar. Masuk kembali untuk mengubah harga.');
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  load();
}
