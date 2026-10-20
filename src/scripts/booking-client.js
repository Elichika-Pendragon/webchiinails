import { calculatePayment, getBookingDateBounds, listBookingSlots, normalizeBookingDesign, validateBooking } from '../../server/booking.js';
import { createBookingCalendar, calendarMonthDays } from './booking-calendar.js';
import { PaymentProofError, preparePaymentProof } from './booking-proof.js';

const form = document.querySelector('#booking-form');
if (form) {
  const fields = ['name', 'whatsapp', 'agreedPrice', 'paymentMode', 'deposit', 'serviceDuration', 'date', 'time'];
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
  const paymentAmountLabel = document.querySelector('#booking-payment-amount-label');
  const slotStatus = document.querySelector('#booking-slot-status');
  const slotRetry = document.querySelector('#booking-slot-retry');
  const calendarStatus = document.querySelector('#booking-calendar-status');
  const calendarRetry = document.querySelector('#booking-calendar-retry');
  const proofInput = document.querySelector('#booking-paymentProof');
  const proofPreview = document.querySelector('#booking-proof-preview');
  const proofImage = document.querySelector('#booking-proof-image');
  const proofStatus = document.querySelector('#booking-proof-status');
  const touched = new Set();
  const controllers = new Set();
  let calendar = null;
  let service = 'checking';
  let submitting = false;
  let active = true;
  let requestSignature = '';
  let requestKey = '';
  let requestedPaymentMode = input('paymentMode').value || 'deposit';
  let availability = 'idle';
  let availableTimes = new Set();
  let slotController = null;
  let slotSequence = 0;
  let availabilityKey = '';
  let lastSelectedTime = '';
  let proof = null;
  let proofBlob = null;
  let proofState = 'empty';
  let proofUrl = '';
  let proofSequence = 0;
  let proofController = null;
  let refreshTimer = null;
  const monthCache = new Map();
  let monthController = null;
  let monthRequest = '';
  let monthSequence = 0;
  const designLabels = { plain: 'Plain / Nail gel / Removal', simple: 'Simple art', 'full-art': 'Full art' };
  const selectedDesign = () => {
    const value = input('serviceDuration').value;
    const match = /^(plain|simple|full-art):(60|120|180|240|300)$/.exec(value);
    return match && match[0] === value ? normalizeBookingDesign(match[1], match[2]) : null;
  };
  const currentSlotKey = () => JSON.stringify([input('date').value, selectedDesign()]);
  const monthSelectionKey = month => JSON.stringify([month, selectedDesign()]);
  const stopRefresh = () => {
    if (refreshTimer !== null) window.clearInterval(refreshTimer);
    refreshTimer = null;
  };
  const pauseSlotCheck = () => {
    slotSequence++;
    slotController?.abort();
    slotController = null;
    if (availability === 'loading') availability = 'idle';
    input('time').setAttribute('aria-busy', 'false');
  };
  const pauseMonthCheck = () => {
    monthSequence++;
    monthController?.abort();
    monthController = null;
    monthRequest = '';
  };
  const startRefresh = () => {
    if (refreshTimer !== null || !active || document.visibilityState !== 'visible' || form.hidden || service !== 'enabled' || submitting || proofState === 'processing') return;
    refreshTimer = window.setInterval(() => {
      if (!active || document.visibilityState !== 'visible' || form.hidden || service !== 'enabled' || submitting || proofState === 'processing') return;
      if (!monthController) refreshMonth({ force: true, quiet: true });
      if (!slotController && input('date').value && selectedDesign()) fillTimes({ quiet: true });
    }, 45000);
  };
  const formatMoney = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
  const formatDate = value => new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(value));
  const readValues = () => {
    const design = selectedDesign();
    return { ...Object.fromEntries(fields.filter(name => name !== 'serviceDuration').map(name => [name, input(name).value])), designType: design?.designType || '', durationMinutes: design ? String(design.durationMinutes) : '' };
  };
  const validation = () => {
    const result = validateBooking(readValues(), { now: Date.now() });
    if (!selectedDesign()) {
      delete result.errors.designType;
      delete result.errors.durationMinutes;
      result.errors.serviceDuration = 'Pilih layanan dan durasi yang sudah disepakati dengan Chii.';
    }
    if (result.valid && proofState !== 'ready') return { valid: false, errors: { paymentProof: proofState === 'processing' ? 'Tunggu sampai bukti pembayaran selesai disiapkan.' : 'Unggah bukti pembayaran yang valid.' }, value: null, preview: null };
    const month = monthCache.get(monthSelectionKey(input('date').value.slice(0, 7)));
    if (result.valid && service === 'enabled' && (month?.status !== 'ready' || month.closedDates.includes(input('date').value))) {
      return { valid: false, errors: { date: month?.closedDates.includes(input('date').value) ? 'Tanggal ini tidak tersedia. Pilih tanggal lain.' : 'Tunggu sampai jadwal bulan ini selesai diperiksa.' }, value: null, preview: null };
    }
    if (result.valid && service === 'enabled' && (availability !== 'ready' || availabilityKey !== currentSlotKey() || !availableTimes.has(result.value.time))) {
      return { valid: false, errors: { time: 'Pilih jam yang tersedia setelah pemeriksaan jadwal selesai.' }, value: null, preview: null };
    }
    return result;
  };
  const signature = value => JSON.stringify([value.name, value.whatsapp, value.agreedPrice, value.paymentMode, value.designType, value.durationMinutes, value.date, value.time, proof?.digest || '']);
  const setStatus = (message, error = false) => {
    status.textContent = message;
    status.dataset.tone = error ? 'error' : 'normal';
  };
  const updateDeposit = () => {
    const payment = calculatePayment(input('agreedPrice').value, requestedPaymentMode);
    const capped = payment !== null && Number(input('agreedPrice').value) <= 20000;
    input('paymentMode').options[0].disabled = capped;
    input('paymentMode').value = payment?.paymentMode || requestedPaymentMode;
    input('deposit').value = payment === null ? '' : String(payment.deposit);
    paymentAmountLabel.textContent = input('paymentMode').value === 'full' ? 'Full payment' : 'DP · min. Rp20.000';
    document.querySelector('#hint-deposit').textContent = input('paymentMode').value === 'full'
      ? 'Harga total dibayar penuh. Sisa pembayaran Rp0.'
      : '10% dari harga total, minimum Rp20.000. Pecahan Rupiah dibulatkan ke atas.';
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
  const updateServiceHint = () => {
    const design = selectedDesign();
    document.querySelector('#hint-serviceDuration').textContent = !design
      ? 'Pilih layanan dan durasi yang sudah disepakati dengan Chii.'
      : design.designType === 'full-art'
        ? 'Full art memiliki Last book 12:00. Pilihan jam menyesuaikan durasi dan jam tutup studio.'
        : design.designType === 'plain'
          ? 'Plain, nail gel, atau removal menggunakan slot 1 jam. Pilihan ini tidak menentukan harga.'
          : `Simple art menggunakan slot ${design.durationMinutes / 60} jam sesuai konsultasi. Pilihan ini tidak menentukan harga.`;
  };
  const renderSlots = (slots, selected, preserveOptions = false) => {
    const visible = slots.filter(slot => slot.available);
    availableTimes = new Set(visible.map(slot => slot.time));
    const previousOptions = new Map([...input('time').options].filter(option => option.value).map(option => [option.value, option]));
    const reuseOptions = preserveOptions && previousOptions.size === visible.length && visible.every(slot => previousOptions.has(slot.time));
    if (!reuseOptions) input('time').replaceChildren(new Option(!slots.length ? 'Tidak ada jam untuk pilihan ini' : visible.length ? 'Pilih jam mulai' : 'Tidak ada jam yang tersedia', ''));
    visible.forEach(slot => {
      const option = reuseOptions ? previousOptions.get(slot.time) : new Option('', slot.time);
      option.text = slot.label;
      if (!reuseOptions) input('time').add(option);
    });
    input('time').value = availableTimes.has(selected) ? selected : '';
    input('time').hidden = false;
  };
  const fillTimes = async ({ quiet = false } = {}) => {
    const quietUpdate = quiet && service === 'enabled' && availability === 'ready' && availabilityKey === currentSlotKey();
    const sequence = ++slotSequence;
    slotController?.abort();
    slotController = null;
    const previousBounds = `${input('date').min}|${input('date').max}`;
    setBounds();
    if (!quietUpdate || previousBounds !== `${input('date').min}|${input('date').max}`) calendar?.refresh();
    if (calendar && service === 'enabled') refreshMonth();
    const selected = input('time').value || lastSelectedTime;
    const design = selectedDesign();
    const date = input('date').value;
    if (!quietUpdate) {
      availability = 'idle';
      availabilityKey = '';
      availableTimes = new Set();
    }
    slotRetry.hidden = true;
    slotStatus.dataset.tone = 'normal';
    if (!design || !date || date < input('date').min || date > input('date').max) {
      renderSlots([], '');
      input('time').options[0].text = !design ? 'Pilih layanan terlebih dahulu' : date ? 'Pilih tanggal yang valid' : 'Pilih tanggal terlebih dahulu';
      slotStatus.textContent = 'Pilih layanan, durasi, dan tanggal terlebih dahulu.';
      input('time').setAttribute('aria-busy', 'false');
      updateButton();
      return;
    }
    const candidates = listBookingSlots(date, { now: Date.now(), ...design, includeElapsed: true });
    if (service !== 'enabled') {
      renderSlots(candidates.map(slot => ({ ...slot, available: slot.start > Date.now() })), selected);
      availability = 'preview';
      document.querySelector('#hint-time').textContent = 'Pratinjau jam studio; ketersediaan tetap diperiksa langsung oleh Chii.';
      slotStatus.textContent = candidates.length ? 'Pilih jam mulai sesuai durasi layanan.' : 'Durasi ini tidak muat dalam jam studio. Pilih tanggal atau durasi lain sesuai konsultasi.';
      input('time').setAttribute('aria-busy', 'false');
      updateButton();
      return;
    }
    if (!quietUpdate) {
      availability = 'loading';
      renderSlots(candidates.map(slot => ({ ...slot, available: false })), '');
      slotStatus.textContent = 'Memeriksa jadwal…';
    }
    input('time').setAttribute('aria-busy', 'true');
    document.querySelector('#hint-time').textContent = `Jam mulai berjarak ${design.durationMinutes / 60} jam dari 08.00, mengikuti ketersediaan dan jam studio. Jadwal diperiksa kembali saat Chii menerima booking.`;
    updateButton();
    const controller = new AbortController();
    slotController = controller;
    try {
      const response = await api('/api/booking/availability', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, designType: design.designType, durationMinutes: String(design.durationMinutes) }) }, controller);
      if (!active || sequence !== slotSequence) return;
      if (response?.date !== date || response.designType !== design.designType || response.durationMinutes !== design.durationMinutes || response.timeZone !== 'Asia/Jakarta' || !Array.isArray(response.slots) || response.slots.length !== candidates.length) throw new Error('availability');
      const options = new Map(candidates.map(slot => [slot.time, slot]));
      const seen = new Set();
      const closedByMonth = monthCache.get(monthSelectionKey(date.slice(0, 7)))?.closedDates.includes(date);
      const slots = response.slots.map(slot => {
        const candidate = options.get(slot?.time);
        if (!candidate || seen.has(slot.time) || typeof slot.available !== 'boolean') throw new Error('availability');
        seen.add(slot.time);
        return { ...candidate, available: !closedByMonth && slot.available && candidate.start > Date.now() };
      });
      availability = 'ready';
      availabilityKey = JSON.stringify([date, design]);
      const latestSelected = quietUpdate ? input('time').value : selected;
      renderSlots(slots, latestSelected, quietUpdate);
      lastSelectedTime = input('time').value;
      const message = quietUpdate && latestSelected && !availableTimes.has(latestSelected)
        ? 'Jam yang dipilih tidak lagi tersedia. Pilih jam lain.'
        : !slots.length ? 'Durasi ini tidak muat dalam jam studio. Pilih tanggal atau durasi lain sesuai konsultasi.' : availableTimes.size ? 'Pilihan hanya menampilkan jam yang tersedia.' : 'Semua jam pada tanggal ini tidak tersedia. Pilih tanggal lain.';
      if (slotStatus.textContent !== message) slotStatus.textContent = message;
    } catch {
      if (!active || sequence !== slotSequence) return;
      availability = 'error';
      slotStatus.dataset.tone = 'error';
      slotStatus.textContent = 'Jadwal belum dapat diperiksa. Pilihanmu tetap di formulir; coba lagi sebelum melanjutkan.';
      slotRetry.hidden = false;
    } finally {
      if (active && sequence === slotSequence) {
        input('time').setAttribute('aria-busy', 'false');
        slotController = null;
        updateButton();
        startRefresh();
      }
    }
  };
  const applyMonth = (month, info) => {
    monthCache.set(info.selectionKey, info);
    if (calendar?.getMonth() === month && info.selectionKey === monthSelectionKey(month)) {
      calendar.setAvailability({ month, status: info.status, closedDates: info.closedDates });
      calendarStatus.textContent = info.status === 'ready'
        ? 'Tanggal abu-abu tidak tersedia. Jam kosong diperiksa setelah memilih tanggal.'
        : info.status === 'loading' ? 'Memeriksa jadwal bulan ini…' : 'Jadwal bulan ini belum dapat diperiksa. Coba lagi sebelum memilih tanggal.';
      calendarRetry.hidden = info.status !== 'error';
    }
    if (input('date').value.slice(0, 7) === month && info.selectionKey === monthSelectionKey(month) && info.status === 'ready' && info.closedDates.includes(input('date').value)) {
      input('time').value = '';
      lastSelectedTime = '';
      renderSlots([], '');
      input('time').options[0].text = 'Tanggal ini tidak tersedia';
      slotStatus.textContent = 'Tanggal ini tidak tersedia. Pilih tanggal lain.';
    }
    updateButton();
  };
  const refreshMonth = async ({ force = false, quiet = false } = {}) => {
    const month = calendar?.getMonth();
    if (!month || !active || form.hidden || submitting || proofState === 'processing') return;
    if (service !== 'enabled') {
      calendar.setAvailability({ month, status: service === 'preview' ? 'preview' : 'loading', closedDates: [] });
      calendarStatus.textContent = service === 'preview' ? 'Pratinjau tanggal; jadwal tetap diperiksa langsung oleh Chii.' : 'Memeriksa jadwal bulan ini…';
      calendarRetry.hidden = true;
      return;
    }
    const design = selectedDesign();
    if (!design) {
      pauseMonthCheck();
      calendar.setAvailability({ month, status: 'loading', closedDates: [] });
      calendarStatus.textContent = 'Pilih layanan dan durasi untuk memeriksa tanggal.';
      updateButton();
      return;
    }
    const selectionKey = monthSelectionKey(month);
    const cached = monthCache.get(selectionKey);
    const key = `${selectionKey}|${input('date').min}|${input('date').max}`;
    if (monthController && monthRequest === key) return;
    if (!force && cached?.status === 'ready' && Date.now() - cached.checkedAt < 45000 && cached.key === key) {
      applyMonth(month, cached);
      return;
    }
    pauseMonthCheck();
    const sequence = ++monthSequence;
    const controller = new AbortController();
    monthController = controller;
    monthRequest = key;
    if (!quiet || cached?.status !== 'ready') applyMonth(month, { status: 'loading', closedDates: cached?.closedDates || [], key, selectionKey });
    try {
      const response = await api('/api/booking/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month, designType: design.designType, durationMinutes: String(design.durationMinutes) }) }, controller);
      if (!active || sequence !== monthSequence || calendar.getMonth() !== month) return;
      const dates = calendarMonthDays(month, { minDate: input('date').min, maxDate: input('date').max }).filter(day => day && !day.disabled).map(day => day.date);
      if (!response || Object.keys(response).sort().join(',') !== 'closedDates,designType,durationMinutes,maxDate,minDate,month,timeZone' || response.month !== month || response.designType !== design.designType || response.durationMinutes !== design.durationMinutes || response.timeZone !== 'Asia/Jakarta' || response.minDate !== dates[0] || response.maxDate !== dates.at(-1) || !Array.isArray(response.closedDates) || response.closedDates.length > dates.length || response.closedDates.some((date, index) => typeof date !== 'string' || !dates.includes(date) || (index > 0 && date <= response.closedDates[index - 1]))) throw new Error('calendar');
      applyMonth(month, { status: 'ready', closedDates: response.closedDates, checkedAt: Date.now(), key, selectionKey });
    } catch {
      if (!active || sequence !== monthSequence || calendar.getMonth() !== month) return;
      applyMonth(month, { status: 'error', closedDates: cached?.closedDates || [], key, selectionKey });
    } finally {
      if (sequence === monthSequence) { monthController = null; monthRequest = ''; }
    }
  };
  const showErrors = issues => {
    const list = errors.querySelector('ul');
    list.replaceChildren();
    [...fields, 'paymentProof'].forEach(name => {
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

  async function api(path, options = {}, controller = new AbortController()) {
    controllers.add(controller);
    const timeoutMs = path === '/api/booking/requests' && options.method === 'POST' ? 30000 : 12000;
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
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
      refreshMonth();
      fillTimes();
      startRefresh();
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
    if (!result || typeof result.requestId !== 'string' || !item || result.status !== 'pending' || item.status !== 'pending' || item.hasPaymentProof !== true) throw new Error('response');
    if (item.name !== value.name || item.whatsapp !== value.whatsapp || item.agreedPrice !== value.agreedPrice || item.paymentMode !== value.paymentMode || item.paymentPolicy !== value.paymentPolicy || item.deposit !== value.deposit || item.remainingBalance !== preview.remainingBalance || item.designType !== value.designType || item.durationMinutes !== value.durationMinutes || item.date !== value.date || item.time !== value.time) throw new Error('response');
    if (Date.parse(item.startISO) !== Date.parse(preview.startISO) || Date.parse(item.endISO) !== Date.parse(preview.endISO)) throw new Error('response');
    const url = new URL(result.reviewUrl);
    if (url.origin !== window.location.origin || url.pathname !== '/book/approve' || url.hash || url.username || url.password || Array.from(url.searchParams.keys()).length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('r') || '')) throw new Error('response');
    return url.href;
  }

  function prepareWhatsApp(result, reviewUrl) {
    const value = result.value;
    const preview = result.preview;
    const dateLabel = formatDate(preview.startISO);
    const display = { name: value.name, whatsapp: `+${value.whatsapp}`, design: designLabels[value.designType], date: dateLabel, time: preview.label, agreedPrice: formatMoney(value.agreedPrice), deposit: formatMoney(value.deposit), remainingBalance: formatMoney(preview.remainingBalance) };
    Object.keys(display).forEach(name => { review.querySelector(`[data-booking-value="${name}"]`).textContent = display[name]; });
    const paymentLabel = value.paymentMode === 'full' ? 'Full payment' : 'DP · 10%, min. Rp20.000';
    document.querySelector('#booking-payment-summary-label').textContent = paymentLabel;
    document.querySelector('#booking-duration-summary-label').textContent = `Waktu · ${value.durationMinutes / 60} jam`;
    const linkMessage = reviewUrl
      ? `\n\nTautan konfirmasi untuk Chii:\n${reviewUrl}\n\nMohon periksa detail, jadwal, dan pembayaran, lalu terima atau batalkan permintaan melalui tautan tersebut.`
      : '\n\nMohon periksa ketersediaan jadwal dan konfirmasi petunjuk pembayaran melalui transfer atau QRIS. Konfirmasi kalender online belum aktif pada pratinjau ini.';
    const proofMessage = reviewUrl ? 'Bukti pembayaran sudah diunggah untuk diperiksa Chii melalui tautan konfirmasi.' : 'Saya akan melampirkan bukti pembayaran di percakapan WhatsApp ini.';
    const message = `Halo Chii, saya ingin mengajukan booking setelah konsultasi.\n\nNama: ${value.name}\nWhatsApp: +${value.whatsapp}\nDesain: ${display.design}\nDurasi: ${value.durationMinutes / 60} jam\nHarga total sesuai konsultasi: ${display.agreedPrice}\n${paymentLabel}: ${display.deposit}\nSisa pembayaran: ${display.remainingBalance}\nTanggal: ${dateLabel}\nWaktu: ${preview.label}${linkMessage}\n\n${proofMessage} Booking menunggu konfirmasi Chii.`;
    const destination = new URL(form.dataset.whatsapp);
    if (destination.protocol !== 'https:' || destination.hostname !== 'wa.me') throw new Error('whatsapp');
    destination.searchParams.set('text', message);
    document.querySelector('#booking-whatsapp-link').href = destination.href;
    document.querySelector('#booking-review-description').textContent = reviewUrl
      ? 'Permintaan tersimpan dan WhatsApp dibuka dengan ringkasan serta tautan konfirmasi untuk Chii. Tekan Kirim di WhatsApp. Jika belum terbuka, gunakan tombol di bawah.'
      : 'WhatsApp dibuka dengan ringkasan booking. Tekan Kirim untuk menghubungi Chii. Jika belum terbuka, gunakan tombol di bawah.';
    document.querySelector('#booking-review-privacy').textContent = reviewUrl
      ? 'Permintaan belum mengunci jadwal. Chii perlu memeriksa pembayaran dan menerima booking sebelum jadwal ditambahkan ke kalender.'
      : 'Ini pratinjau WhatsApp tanpa tautan persetujuan online. Chii memeriksa pembayaran dan jadwal secara langsung; halaman ini tidak memperbarui kalender.';
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
    stopRefresh();
    pauseSlotCheck();
    pauseMonthCheck();
    form.setAttribute('aria-busy', 'true');
    form.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = true; });
    bookButton.textContent = service === 'enabled' ? 'Mengirim…' : 'Menyiapkan…';
    updateButton();
    setStatus(service === 'enabled' ? 'Mengunggah bukti dan menyimpan permintaan booking… Tunggu hingga selesai.' : 'Menyiapkan ringkasan WhatsApp…');
    try {
      let reviewUrl = '';
      if (service === 'enabled') {
        const value = result.value;
        const response = await api('/api/booking/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: value.name, whatsapp: value.whatsapp, agreedPrice: String(value.agreedPrice), paymentMode: value.paymentMode, designType: value.designType, durationMinutes: String(value.durationMinutes), date: value.date, time: value.time, idempotencyKey: idempotencyKey(value), proof: { contentType: proof.contentType, base64: proof.base64 } }),
        });
        reviewUrl = approvalUrl(response, value, result.preview);
      }
      const destination = prepareWhatsApp(result, reviewUrl);
      window.location.assign(destination);
    } catch (error) {
      if (!active) return;
      if (error.status === 409 && error.code === 'SLOT_CONFLICT') {
        lastSelectedTime = '';
        input('time').value = '';
        await fillTimes();
        setStatus('Jadwal baru saja terisi. Pilih tanggal atau jam lain, lalu tekan Book lagi. Detail dan bukti pembayaranmu tetap di formulir.', true);
      } else if (error.status === 429) setStatus('Terlalu banyak permintaan. Tunggu sebentar, lalu tekan Book lagi. Detailmu tetap tersimpan di formulir ini.', true);
      else setStatus('Permintaan belum dapat diselesaikan. Detailmu tetap di formulir. Periksa koneksi, lalu tekan Book untuk mencoba lagi.', true);
    } finally {
      if (active) {
        submitting = false;
        form.setAttribute('aria-busy', 'false');
        form.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = false; });
        bookButton.textContent = 'Book';
        updateButton();
        startRefresh();
      }
    }
  });

  document.querySelector('#booking-edit').addEventListener('click', () => {
    review.hidden = true;
    form.hidden = false;
    refreshMonth({ force: true });
    fillTimes();
    updateDeposit();
    updateButton();
    document.querySelector('#booking-form-title').focus();
  });
  input('date').addEventListener('change', fillTimes);
  input('serviceDuration').addEventListener('change', () => { updateServiceHint(); fillTimes(); });
  input('time').addEventListener('change', () => {
    lastSelectedTime = input('time').value;
    updateButton();
  });
  const onValueChange = event => {
    if (!editable.includes(event.target.name)) return;
    if (event.target.name === 'paymentMode') requestedPaymentMode = input('paymentMode').value;
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
  slotRetry.addEventListener('click', () => { if (!submitting) fillTimes(); });
  calendarRetry.addEventListener('click', () => { if (!submitting) refreshMonth({ force: true }); });
  const revokeProofPreview = () => {
    if (proofUrl) URL.revokeObjectURL(proofUrl);
    proofUrl = '';
    proofImage.removeAttribute('src');
    proofPreview.hidden = true;
  };
  const restoreProofPreview = () => {
    if (!proofBlob || proofState !== 'ready') return;
    revokeProofPreview();
    proofUrl = URL.createObjectURL(proofBlob);
    proofImage.src = proofUrl;
    proofPreview.hidden = false;
  };
  const clearProof = (keepSelection = false) => {
    proofSequence++;
    proofController?.abort();
    proofController = null;
    proof = null; proofBlob = null; proofState = 'empty';
    if (!keepSelection) proofInput.value = '';
    proofInput.setAttribute('aria-invalid', 'false');
    document.querySelector('#error-paymentProof').hidden = true;
    revokeProofPreview();
    proofStatus.textContent = 'Unggah bukti pembayaran untuk melanjutkan.';
    proofStatus.dataset.tone = 'normal';
    updateButton();
  };
  proofInput.addEventListener('change', async () => {
    const file = proofInput.files?.[0];
    clearProof(true);
    if (!file) return;
    const sequence = ++proofSequence;
    const controller = new AbortController();
    proofController = controller;
    proofState = 'processing';
    stopRefresh();
    proofStatus.textContent = 'Menyiapkan gambar…';
    updateButton();
    try {
      const prepared = await preparePaymentProof(file, { signal: controller.signal });
      if (!active || sequence !== proofSequence) return;
      proof = { contentType: prepared.contentType, base64: prepared.base64, digest: prepared.digest };
      proofBlob = prepared.blob;
      proofState = 'ready';
      restoreProofPreview();
      proofStatus.textContent = service === 'preview' ? 'Gambar siap. Pratinjau ini belum mengunggah gambar; lampirkan bukti di WhatsApp.' : 'Bukti pembayaran siap dikirim bersama permintaan.';
    } catch (error) {
      if (!active || sequence !== proofSequence) return;
      proofState = 'error';
      proofInput.setAttribute('aria-invalid', 'true');
      proofStatus.dataset.tone = 'error';
      proofStatus.textContent = error instanceof PaymentProofError ? error.message : 'Gambar belum dapat disiapkan. Coba unggah JPEG, PNG, atau WebP lain.';
    } finally {
      if (active && sequence === proofSequence) {
        proofController = null;
        updateButton();
        startRefresh();
      }
    }
  });
  document.querySelector('#booking-proof-remove').addEventListener('click', () => clearProof());
  document.querySelectorAll('[data-copy-payment]').forEach(button => {
    button.addEventListener('click', async () => {
      const number = document.getElementById(button.dataset.copyPayment);
      const copyStatus = document.querySelector('#booking-copy-status');
      if (!number) return;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard');
        await navigator.clipboard.writeText(number.textContent.trim());
        copyStatus.textContent = `Nomor ${button.dataset.paymentLabel} disalin.`;
      } catch {
        copyStatus.textContent = 'Belum bisa menyalin. Tekan dan tahan nomor di atas, lalu pilih Salin.';
      }
    });
  });
  window.addEventListener('pagehide', () => {
    active = false;
    stopRefresh();
    pauseSlotCheck();
    pauseMonthCheck();
    proofSequence++;
    proofController?.abort();
    proofController = null;
    if (proofState === 'processing') { proofState = 'empty'; proofInput.value = ''; proofStatus.textContent = 'Unggah kembali bukti pembayaran untuk melanjutkan.'; }
    revokeProofPreview();
    controllers.forEach(controller => controller.abort());
  });
  window.addEventListener('pageshow', event => {
    active = true;
    restoreProofPreview();
    if (event.persisted) {
      submitting = false;
      form.setAttribute('aria-busy', 'false');
      form.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = false; });
      bookButton.textContent = 'Book';
    }
    if (!form.hidden) {
      if (event.persisted) checkService();
      else { refreshMonth(); fillTimes(); }
    }
    updateDeposit();
    updateButton();
    startRefresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      stopRefresh();
      pauseSlotCheck();
      pauseMonthCheck();
      return;
    }
    if (!active || form.hidden || service !== 'enabled' || submitting || proofState === 'processing') return;
    refreshMonth({ force: true, quiet: true });
    fillTimes({ quiet: true });
    startRefresh();
  });
  setBounds();
  updateServiceHint();
  calendar = createBookingCalendar(document.querySelector('#booking-calendar'), input('date'), { onMonthChange: () => refreshMonth() });
  refreshMonth();
  fillTimes();
  updateDeposit();
  form.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = false; });
  updateButton();
  checkService();
}
