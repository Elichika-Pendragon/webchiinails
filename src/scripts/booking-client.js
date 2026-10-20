import { calculateDeposit, getBookingDateBounds, listBookingSlots, validateBooking } from '../../server/booking.js';
import { createBookingCalendar } from './booking-calendar.js';

const form = document.querySelector('#booking-form');
if (form) {
  const fields = ['name', 'whatsapp', 'agreedPrice', 'deposit', 'date', 'time'];
  const editable = fields.filter(name => name !== 'deposit');
  const input = name => form.elements.namedItem(name);
  const review = document.querySelector('#booking-review-panel');
  const errors = document.querySelector('#booking-errors');
  const bookButton = document.querySelector('#booking-review');
  const status = document.querySelector('#booking-submit-status');
  const statusRetry = document.querySelector('#booking-status-retry');
  const modeTitle = document.querySelector('#booking-mode-title');
  const modeDescription = document.querySelector('#booking-mode-description');
  const submitPrivacy = document.querySelector('#booking-submit-privacy');
  const touched = new Set();
  const controllers = new Set();
  let calendar = null;
  let service = 'checking';
  let submitting = false;
  let active = true;
  let requestSignature = '';
  let requestKey = '';
  const formatMoney = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
  const formatDate = value => new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(value));
  const readValues = () => Object.fromEntries(fields.map(name => [name, input(name).value]));
  const validation = () => validateBooking(readValues(), { now: Date.now() });
  const signature = value => JSON.stringify([value.name, value.whatsapp, value.agreedPrice, value.date, value.time]);
  const setStatus = (message, error = false) => {
    status.textContent = message;
    status.dataset.tone = error ? 'error' : 'normal';
  };
  const updateDeposit = () => {
    const deposit = calculateDeposit(input('agreedPrice').value);
    input('deposit').value = deposit === null ? '' : String(deposit);
  };
  const updateButton = () => {
    const result = validation();
    bookButton.disabled = submitting || !['enabled', 'preview'].includes(service) || !result.valid;
    if (result.valid && requestSignature && requestSignature !== signature(result.value)) {
      requestSignature = '';
      requestKey = '';
    }
    return result;
  };
  const setBounds = () => {
    const bounds = getBookingDateBounds({ now: Date.now() });
    input('date').min = bounds.minDate;
    input('date').max = bounds.maxDate;
  };
  const fillTimes = () => {
    setBounds();
    calendar?.refresh();
    const selected = input('time').value;
    const slots = listBookingSlots(input('date').value, { now: Date.now() });
    input('time').replaceChildren(new Option(input('date').value ? (slots.length ? 'Pilih jam mulai' : 'Tidak ada pilihan jam. Pilih tanggal lain.') : 'Pilih tanggal terlebih dahulu', ''));
    slots.forEach(slot => input('time').add(new Option(slot.label, slot.time)));
    if (slots.some(slot => slot.time === selected)) input('time').value = selected;
    updateButton();
  };
  const showErrors = issues => {
    const list = errors.querySelector('ul');
    list.replaceChildren();
    fields.forEach(name => {
      const fieldError = document.querySelector(`#error-${name}`);
      const message = issues[name];
      fieldError.textContent = message || '';
      fieldError.hidden = !message;
      input(name).setAttribute('aria-invalid', message ? 'true' : 'false');
      if (name === 'date') calendar?.setInvalid(Boolean(message));
      if (message) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = `#booking-${name}`;
        link.textContent = message;
        link.addEventListener('click', event => {
          event.preventDefault();
          if (name === 'date' && calendar) calendar.focus();
          else input(name).focus();
        });
        item.append(link);
        list.append(item);
      }
    });
    errors.hidden = !Object.keys(issues).length;
  };

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

  async function checkService() {
    if (submitting) return;
    service = 'checking';
    statusRetry.hidden = true;
    statusRetry.disabled = true;
    setStatus('Memeriksa layanan booking…');
    updateButton();
    try {
      const result = await api('/api/booking/status');
      if (typeof result?.enabled !== 'boolean') throw new Error('configuration');
      service = result.enabled ? 'enabled' : 'preview';
      modeTitle.textContent = result.enabled ? 'Permintaan booking' : 'Pratinjau alur booking';
      modeDescription.textContent = result.enabled
        ? 'Setelah menekan Book, permintaan disimpan dan WhatsApp dibuka dengan tautan konfirmasi untuk Chii. Jadwal masuk kalender setelah Chii menerima booking.'
        : 'Konfirmasi kalender online belum aktif. Book membuka ringkasan WhatsApp untuk diperiksa Chii; pratinjau ini tidak menyimpan permintaan atau memesan waktu.';
      submitPrivacy.textContent = result.enabled
        ? 'Book menyimpan detail permintaan untuk diperiksa Chii. Kamu tetap perlu menekan Kirim di WhatsApp. Pembayaran diperiksa langsung oleh Chii.'
        : 'Detail hanya disiapkan di halaman ini sebelum dibuka di WhatsApp. Kamu tetap perlu menekan Kirim. Kalender tidak diperbarui oleh pratinjau ini.';
      setStatus('Lengkapi nama, nomor WhatsApp, harga total, tanggal, dan jam untuk melanjutkan.');
    } catch {
      if (!active) return;
      service = 'unavailable';
      setStatus('Layanan booking belum dapat diperiksa. Detailmu tetap di formulir. Periksa koneksi, lalu coba lagi.', true);
      statusRetry.hidden = false;
    } finally {
      if (active) {
        statusRetry.disabled = false;
        updateButton();
      }
    }
  }

  function idempotencyKey(value) {
    const nextSignature = signature(value);
    if (nextSignature !== requestSignature || !requestKey) {
      if (!window.crypto?.getRandomValues) throw new Error('secure-random');
      const bytes = window.crypto.getRandomValues(new Uint8Array(32));
      requestKey = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      requestSignature = nextSignature;
    }
    return requestKey;
  }

  function approvalUrl(result, value, preview) {
    const item = result?.booking;
    if (!result || typeof result.requestId !== 'string' || !item || result.status !== 'pending' || item.status !== 'pending') throw new Error('response');
    if (item.name !== value.name || item.whatsapp !== value.whatsapp || item.agreedPrice !== value.agreedPrice || item.deposit !== value.deposit || item.remainingBalance !== preview.remainingBalance || item.date !== value.date || item.time !== value.time) throw new Error('response');
    if (Date.parse(item.startISO) !== Date.parse(preview.startISO) || Date.parse(item.endISO) !== Date.parse(preview.endISO)) throw new Error('response');
    const url = new URL(result.reviewUrl);
    if (url.origin !== window.location.origin || url.pathname !== '/book/approve' || url.hash || url.username || url.password || Array.from(url.searchParams.keys()).length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('r') || '')) throw new Error('response');
    return url.href;
  }

  function prepareWhatsApp(result, reviewUrl) {
    const value = result.value;
    const preview = result.preview;
    const dateLabel = formatDate(preview.startISO);
    const display = { name: value.name, whatsapp: `+${value.whatsapp}`, date: dateLabel, time: preview.label, agreedPrice: formatMoney(value.agreedPrice), deposit: formatMoney(value.deposit), remainingBalance: formatMoney(preview.remainingBalance) };
    Object.keys(display).forEach(name => { review.querySelector(`[data-booking-value="${name}"]`).textContent = display[name]; });
    const linkMessage = reviewUrl
      ? `\n\nTautan konfirmasi untuk Chii:\n${reviewUrl}\n\nMohon periksa detail, jadwal, dan pembayaran DP, lalu terima atau batalkan permintaan melalui tautan tersebut.`
      : '\n\nMohon periksa ketersediaan jadwal dan konfirmasi petunjuk pembayaran melalui transfer atau QRIS. Konfirmasi kalender online belum aktif pada pratinjau ini.';
    const message = `Halo Chii, saya ingin mengajukan booking setelah konsultasi.\n\nNama: ${value.name}\nWhatsApp: +${value.whatsapp}\nHarga total sesuai konsultasi: ${display.agreedPrice}\nDP 10%: ${display.deposit}\nTanggal: ${dateLabel}\nWaktu: ${preview.label}${linkMessage}\n\nSaya akan mengirim bukti pembayaran melalui transfer atau QRIS di percakapan ini. Booking menunggu konfirmasi Chii.`;
    const destination = new URL(form.dataset.whatsapp);
    if (destination.protocol !== 'https:' || destination.hostname !== 'wa.me') throw new Error('whatsapp');
    destination.searchParams.set('text', message);
    document.querySelector('#booking-whatsapp-link').href = destination.href;
    document.querySelector('#booking-review-description').textContent = reviewUrl
      ? 'Permintaan tersimpan dan WhatsApp dibuka dengan ringkasan serta tautan konfirmasi untuk Chii. Tekan Kirim di WhatsApp. Jika belum terbuka, gunakan tombol di bawah.'
      : 'WhatsApp dibuka dengan ringkasan booking. Tekan Kirim untuk menghubungi Chii. Jika belum terbuka, gunakan tombol di bawah.';
    document.querySelector('#booking-review-privacy').textContent = reviewUrl
      ? 'Permintaan belum mengunci jadwal. Chii perlu memeriksa DP dan menerima booking sebelum jadwal ditambahkan ke kalender.'
      : 'Ini pratinjau WhatsApp tanpa tautan persetujuan online. Chii memeriksa DP dan jadwal secara langsung; halaman ini tidak memperbarui kalender.';
    form.hidden = true;
    review.hidden = false;
    document.querySelector('#booking-review-title').focus();
    return destination.href;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !['enabled', 'preview'].includes(service)) return;
    updateDeposit();
    const result = updateButton();
    showErrors(result.errors);
    if (!result.valid) {
      errors.focus();
      return;
    }
    submitting = true;
    form.setAttribute('aria-busy', 'true');
    form.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = true; });
    bookButton.textContent = 'Menyiapkan…';
    updateButton();
    setStatus(service === 'enabled' ? 'Menyimpan permintaan booking…' : 'Menyiapkan ringkasan WhatsApp…');
    try {
      let reviewUrl = '';
      if (service === 'enabled') {
        const value = result.value;
        const response = await api('/api/booking/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: value.name, whatsapp: value.whatsapp, agreedPrice: String(value.agreedPrice), date: value.date, time: value.time, idempotencyKey: idempotencyKey(value) }),
        });
        reviewUrl = approvalUrl(response, value, result.preview);
      }
      const destination = prepareWhatsApp(result, reviewUrl);
      window.location.assign(destination);
    } catch (error) {
      if (!active) return;
      if (error.status === 429) setStatus('Terlalu banyak permintaan. Tunggu sebentar, lalu tekan Book lagi. Detailmu tetap tersimpan di formulir ini.', true);
      else setStatus('Permintaan belum dapat diselesaikan. Detailmu tetap di formulir. Periksa koneksi, lalu tekan Book untuk mencoba lagi.', true);
    } finally {
      if (active) {
        submitting = false;
        form.setAttribute('aria-busy', 'false');
        form.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = false; });
        bookButton.textContent = 'Book';
        updateButton();
      }
    }
  });

  document.querySelector('#booking-edit').addEventListener('click', () => {
    review.hidden = true;
    form.hidden = false;
    fillTimes();
    updateDeposit();
    updateButton();
    document.querySelector('#booking-form-title').focus();
  });
  input('date').addEventListener('change', fillTimes);
  const onValueChange = event => {
    if (!editable.includes(event.target.name)) return;
    updateDeposit();
    const result = updateButton();
    if (touched.size) showErrors(Object.fromEntries(Object.entries(result.errors).filter(([name]) => touched.has(name))));
  };
  form.addEventListener('input', onValueChange);
  form.addEventListener('change', onValueChange);
  form.addEventListener('focusout', event => {
    if (!editable.includes(event.target.name)) return;
    touched.add(event.target.name);
    const result = updateButton();
    showErrors(Object.fromEntries(Object.entries(result.errors).filter(([name]) => touched.has(name))));
  });
  statusRetry.addEventListener('click', () => { if (service !== 'checking' && !submitting) checkService(); });
  window.addEventListener('pagehide', () => {
    active = false;
    controllers.forEach(controller => controller.abort());
  });
  window.addEventListener('pageshow', event => {
    active = true;
    if (event.persisted) {
      submitting = false;
      form.setAttribute('aria-busy', 'false');
      form.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = false; });
      bookButton.textContent = 'Book';
      if (!form.hidden) checkService();
    }
    fillTimes();
    updateDeposit();
    updateButton();
  });
  setBounds();
  calendar = createBookingCalendar(document.querySelector('#booking-calendar'), input('date'));
  fillTimes();
  updateDeposit();
  form.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = false; });
  updateButton();
  checkService();
}
