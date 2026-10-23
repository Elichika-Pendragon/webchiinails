import { normalizeWhatsApp } from '../../server/booking.js';

export function initApprovalReceipt({ api, getSession, getToken }) {
  const link = document.getElementById('approval-receipt-send');
  const retry = document.getElementById('approval-receipt-retry');
  const status = document.getElementById('approval-receipt-status');
  let generation = 0, current = null;
  function clear() { generation++; current = null; link.hidden = true; link.removeAttribute('href'); retry.hidden = true; status.textContent = ''; }
  async function prepare(item) {
    const sequence = ++generation; link.hidden = true; link.removeAttribute('href'); retry.hidden = true; status.textContent = 'Menyiapkan tautan kuitansi…';
    try {
      if (!getSession()?.authenticated || item.status !== 'accepted') throw new Error();
      const result = await api('/api/booking/receipt-issue', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getSession().csrfToken }, body: JSON.stringify({ token: getToken() }) });
      const receipt = new URL(result.receiptUrl), phone = normalizeWhatsApp(result.whatsapp);
      if (receipt.origin !== location.origin || receipt.pathname !== '/receipt' || receipt.search || !/^#r=[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(receipt.hash) || !phone || phone !== normalizeWhatsApp(item.whatsapp)) throw new Error();
      if (sequence !== generation) return;
      const message = `Halo ${item.name}, booking kamu sudah diterima Chii. Berikut kuitansi pembayaranmu:\n${receipt.href}\n\nBuka tautan untuk melihat rincian dan pilih Print / Save as PDF jika diperlukan. Terima kasih!`;
      link.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`; link.hidden = false;
      status.textContent = 'Tautan kuitansi siap. Buka chat pelanggan, lalu kirim pesan di WhatsApp.';
    } catch { if (sequence === generation) { status.textContent = 'Tautan kuitansi belum tersedia. Booking tetap diterima; coba siapkan tautan lagi.'; retry.hidden = false; } }
  }
  retry.addEventListener('click', () => { if (current) prepare(current); });
  return { clear, render(item) { clear(); if (item.status === 'accepted') { current = item; prepare(item); } } };
}
