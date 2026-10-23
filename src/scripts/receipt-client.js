import { BOOKING_DESIGNS, LEGACY_BOOKING_DESIGN_LABELS } from '../../server/booking.js';
import { rupiah } from '../pricing.js';

const root = document.querySelector('.receipt-document');
if (root) {
  const status = document.getElementById('receipt-status'), details = document.getElementById('receipt-details');
  const print = document.getElementById('receipt-print'), retry = document.getElementById('receipt-retry');
  const token = new URLSearchParams(location.hash.slice(1)).get('r') || '';
  // The token remains in this tab's closure: no storage, query string or analytics.
  let busy = false;
  async function load() {
    if (busy) return; busy = true; print.disabled = true; retry.hidden = true; details.hidden = true; root.setAttribute('aria-busy', 'true');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      if (!/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Buka tautan kuitansi lengkap yang dikirim Chii.');
      const response = await fetch('/api/booking/receipt', { method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }), signal: controller.signal });
      const data = await response.json(); if (!response.ok) throw new Error(response.status === 404 ? 'Kuitansi tidak tersedia. Periksa tautan atau hubungi Chii.' : 'Kuitansi belum dapat dimuat. Coba lagi.');
      const item = data.receipt;
      if (!item || !['accepted', 'cancelled'].includes(item.status) || !Number.isSafeInteger(item.agreedPrice) || !Number.isSafeInteger(item.deposit) || item.deposit < 1 || item.deposit > item.agreedPrice || item.remainingBalance !== item.agreedPrice - item.deposit) throw new Error('Detail kuitansi belum dapat diperiksa. Hubungi Chii.');
      const date = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
      const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' });
      const values = { name: item.name, date: date.format(new Date(item.startISO)), time: `${time.format(new Date(item.startISO))}–${time.format(new Date(item.endISO))}`, design: item.designType === 'legacy' ? 'Sesuai konsultasi' : (item.paymentPolicy === 'manual-min20k-v3' ? BOOKING_DESIGNS[item.designType]?.label : LEGACY_BOOKING_DESIGN_LABELS[item.designType]) || 'Sesuai konsultasi', total: rupiah(item.agreedPrice), paid: rupiah(item.deposit), balance: rupiah(item.remainingBalance) };
      root.querySelectorAll('[data-receipt]').forEach(node => { node.textContent = values[node.dataset.receipt]; });
      document.getElementById('receipt-number').textContent = item.number;
      document.getElementById('receipt-state').textContent = item.status === 'cancelled' ? 'Booking dibatalkan · pembayaran tercatat; hubungi Chii untuk tindak lanjut.' : item.remainingBalance === 0 ? 'Lunas' : 'DP diterima';
      document.title = `Kuitansi ${item.number} | Chii Nails`; details.hidden = false; print.disabled = false; status.textContent = 'Kuitansi siap dicetak.';
    } catch (error) { status.textContent = error.message === 'Failed to fetch' || error.name === 'AbortError' ? 'Koneksi belum tersedia. Coba lagi setelah koneksi pulih.' : error.message; retry.hidden = false; }
    finally { clearTimeout(timer); busy = false; root.setAttribute('aria-busy', 'false'); }
  }
  print.addEventListener('click', () => { if (!print.disabled) window.print(); });
  retry.addEventListener('click', load); load();
  window.addEventListener('pagehide', () => { details.hidden = true; print.disabled = true; });
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
}
