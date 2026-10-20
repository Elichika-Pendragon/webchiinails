import { calculateDeposit, getBookingDateBounds, listBookingSlots, validateBooking } from '../../server/booking.js';
import { createBookingCalendar } from './booking-calendar.js';

const form = document.querySelector('#booking-form');
if (form) {
  const fields = ['name', 'whatsapp', 'agreedPrice', 'deposit', 'date', 'time'];
  const input = name => form.elements.namedItem(name);
  const review = document.querySelector('#booking-review-panel');
  const errors = document.querySelector('#booking-errors');
  const reviewButton = document.querySelector('#booking-review');
  let calendar = null;
  const formatMoney = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
  const formatDate = value => new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(value));
  const updateDeposit = () => {
    const deposit = calculateDeposit(input('agreedPrice').value);
    input('deposit').value = deposit === null ? '' : String(deposit);
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
        item.append(link); list.append(item);
      }
    });
    errors.hidden = !Object.keys(issues).length;
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    updateDeposit();
    const values = {};
    fields.forEach(name => { values[name] = input(name).value; });
    const result = validateBooking(values, { now: Date.now() });
    showErrors(result.errors);
    if (!result.valid) { errors.focus(); return; }
    const value = result.value;
    const preview = result.preview;
    const dateLabel = formatDate(preview.startISO);
    const display = { name: value.name, whatsapp: `+${value.whatsapp}`, date: dateLabel, time: preview.label, agreedPrice: formatMoney(value.agreedPrice), deposit: formatMoney(value.deposit), remainingBalance: formatMoney(preview.remainingBalance) };
    Object.keys(display).forEach(name => { review.querySelector(`[data-booking-value="${name}"]`).textContent = display[name]; });
    const message = `Halo Chii, saya ingin mengajukan booking setelah konsultasi.\n\nNama: ${value.name}\nWhatsApp: +${value.whatsapp}\nHarga total sesuai konsultasi: ${display.agreedPrice}\nDP 10%: ${display.deposit}\nTanggal: ${dateLabel}\nWaktu: ${preview.label}\n\nMohon periksa ketersediaan jadwal dan konfirmasi petunjuk pembayaran melalui transfer atau QRIS. Saya akan mengirim bukti pembayaran di percakapan ini. Booking menunggu konfirmasi Chii.`;
    const destination = new URL(form.dataset.whatsapp);
    destination.searchParams.set('text', message);
    document.querySelector('#booking-whatsapp-link').href = destination.href;
    form.hidden = true; review.hidden = false;
    document.querySelector('#booking-review-title').focus();
  });
  document.querySelector('#booking-edit').addEventListener('click', () => {
    review.hidden = true; form.hidden = false; fillTimes(); updateDeposit();
    document.querySelector('#booking-form-title').focus();
  });
  input('date').addEventListener('change', fillTimes);
  input('agreedPrice').addEventListener('input', updateDeposit);
  input('agreedPrice').addEventListener('change', updateDeposit);
  window.addEventListener('pageshow', () => { fillTimes(); updateDeposit(); });
  setBounds();
  calendar = createBookingCalendar(document.querySelector('#booking-calendar'), input('date'));
  fillTimes(); updateDeposit();
  form.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = false; });
  reviewButton.disabled = false;
}
