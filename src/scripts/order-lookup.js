import { normalizeOrderCode, validOrderCode, orderSummary } from '../order-code.js';
import { estimatePayment } from '../order-payment.js';
import { orderApi, orderSession } from './order-api.js';

const root = document.querySelector('[data-order-lookup]');
if (root) {
  const input = root.querySelector('[data-order-input]'), button = root.querySelector('button');
  const status = root.querySelector('[data-order-status]'), detail = root.querySelector('[data-order-detail]');
  let busy = false, loadedCode = '', lookupTimer = null;
  // The calculator reference is optional and deliberately absent from booking
  // validation and payment fields. Normal booking needs no calculator code.
  try { const value = sessionStorage.getItem('chii:order-code'); if (validOrderCode(value)) input.value = normalizeOrderCode(value); } catch {}
  input.addEventListener('input', () => { clearTimeout(lookupTimer); detail.hidden = true; detail.textContent = ''; loadedCode = ''; status.textContent = ''; if (validOrderCode(input.value)) lookupTimer = setTimeout(() => button.click(), 500); });
  button.addEventListener('click', async () => {
    if (busy) return; clearTimeout(lookupTimer);
    const code = normalizeOrderCode(input.value);
    if (!validOrderCode(code)) { status.textContent = 'Isi kode pilihan 5 karakter, atau kosongkan untuk booking tanpa kode kalkulator.'; input.focus(); return; }
    const total = document.getElementById('booking-agreedPrice'), deposit = document.getElementById('booking-deposit'), mode = document.getElementById('booking-paymentMode');
    const original = { total: total.value, deposit: deposit.value, paymentMode: mode.value };
    busy = true; button.disabled = true; input.readOnly = true; detail.hidden = true; status.textContent = 'Memuat rincian terbaru…';
    try {
      const session = await orderSession();
      const order = await orderApi('/api/booking/orders', { action: 'lookup', code }, { 'X-Booking-Nonce': session.nonce });
      detail.textContent = orderSummary(order); detail.hidden = false; input.value = code; loadedCode = code;
      const payment = estimatePayment(order, original);
      if (payment && !total.closest('fieldset').disabled && !document.getElementById('booking-form').hidden && total.value === original.total && deposit.value === original.deposit && mode.value === original.paymentMode) {
        total.value = payment.total; deposit.value = payment.deposit;
        deposit.dispatchEvent(new Event('input', { bubbles: true })); total.dispatchEvent(new Event('input', { bubbles: true }));
        status.textContent = `Rincian dan estimasi harga dimuat. Harga total dan DP tetap dapat diubah sesuai kesepakatan.${order.estimate.max !== order.estimate.min ? ' Harga memiliki rentang; nilai awal memakai harga minimum.' : ''}`;
      } else status.textContent = 'Rincian dimuat. Nominal yang sedang kamu isi tetap dipertahankan; cocokkan dengan kesepakatan Chii.';
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; button.disabled = false; input.readOnly = false; }
  });
  document.querySelector('#booking-draft-clear')?.addEventListener('click', () => {
    clearTimeout(lookupTimer); input.value = ''; detail.hidden = true; detail.textContent = ''; status.textContent = ''; loadedCode = '';
    try { sessionStorage.removeItem('chii:order-code'); } catch {}
  });
  // Back/forward restoration never silently treats a cached breakdown as fresh.
  window.addEventListener('pagehide', () => clearTimeout(lookupTimer));
  window.addEventListener('pageshow', event => { if (event.persisted && loadedCode) { detail.hidden = true; status.textContent = 'Ketuk Lihat rincian untuk memuat versi terbaru.'; } });
}
