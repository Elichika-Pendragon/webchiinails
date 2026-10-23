import { serviceChoices, defaultPrices, calculateServices, validPriceSnapshot, priceRange } from '../pricing.js';
import { orderChoices, normalizeOrderCode, validOrderCode } from '../order-code.js';
import { orderApi } from './order-api.js';

export function initOrderEditor(root, { getSession, getPrices }) {
  if (!root) return { setSession() {} };
  const find = root.querySelector('[data-order-find]'), edit = root.querySelector('[data-order-edit]');
  const input = root.querySelector('#owner-order-code'), status = root.querySelector('[data-order-editor-status]');
  const kit = root.querySelector('[data-order-kit]'), glue = root.querySelector('[data-order-glue]'), preview = root.querySelector('[data-order-preview]');
  const controls = new Map(serviceChoices.map(field => [field.id, { input: root.querySelector(`[data-order-choice="${field.id}"]`), quantity: root.querySelector(`[data-order-quantity="${field.id}"]`) }]));
  let order = null, prices = defaultPrices, busy = false, generation = 0, dirty = false;
  const setBusy = value => { busy = value; root.setAttribute('aria-busy', String(value)); root.querySelectorAll('button').forEach(node => { node.disabled = value; }); edit.querySelector('fieldset').disabled = value; input.readOnly = value; };
  const selected = () => orderChoices({ selections: serviceChoices.filter(field => controls.get(field.id).input.checked).map(field => ({ id: field.id, quantity: controls.get(field.id).quantity ? Number(controls.get(field.id).quantity.value) : 1 })), kit: kit.checked, glue: glue.checked });
  function render() {
    try { const choice = selected(), result = calculateServices(prices, choice.selections, choice); preview.textContent = `${result.lines.map(line => `${line.name}${line.quantity > 1 ? ` × ${line.quantity}` : ''}: ${priceRange(line.min, line.max)}`).join('\n')}\nEst. harga website: ${priceRange(result.min, result.max)}`; return choice; }
    catch { preview.textContent = 'Pilih minimal satu layanan dan periksa jumlahnya.'; return null; }
  }
  const request = body => orderApi('/api/booking/order-editor', body, { 'X-CSRF-Token': getSession()?.csrfToken || '' });
  function fill(value) {
    order = value; input.value = value.code;
    for (const field of serviceChoices) { const control = controls.get(field.id), line = value.choices.selections.find(item => item.id === field.id); control.input.checked = Boolean(line); if (control.quantity) { control.quantity.value = String(line?.quantity || 1); control.quantity.disabled = !line; } }
    kit.checked = value.choices.kit; glue.checked = value.choices.glue;
    root.querySelector('[data-order-version]').textContent = `Kode ${value.code} · versi ${value.revision}. Berlaku sampai ${new Date(value.expiresAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })}.`;
    edit.hidden = false; dirty = false; render();
  }
  async function load() {
    if (busy || !getSession()?.authenticated) return;
    const code = normalizeOrderCode(input.value); if (!validOrderCode(code)) { status.textContent = 'Isi kode pilihan 5 karakter.'; return; }
    const current = generation; setBusy(true); status.textContent = 'Memuat rincian…';
    try {
      const value = await request({ action: 'lookup', code });
      const snapshot = await getPrices(); if (!validPriceSnapshot(snapshot)) throw new Error('Harga terbaru belum tersedia. Coba muat ulang.');
      if (current !== generation) return; prices = snapshot.prices; fill(value); status.textContent = 'Rincian dimuat. Ubah pilihan, lalu simpan.';
    } catch (error) { if (current === generation) status.textContent = error.message; }
    finally { if (current === generation) setBusy(false); }
  }
  find.addEventListener('submit', event => { event.preventDefault(); if (dirty) { status.textContent = 'Simpan perubahan atau muat ulang versi tersimpan sebelum mencari kode lain.'; return; } load(); });
  edit.addEventListener('change', event => {
    const field = serviceChoices.find(item => item.id === event.target.dataset.orderChoice);
    if (field) {
      const control = controls.get(field.id); if (control.quantity) control.quantity.disabled = !control.input.checked;
      if (control.input.checked && field.alternative) { const other = controls.get(field.alternative); other.input.checked = false; if (other.quantity) other.quantity.disabled = true; }
    }
    dirty = true; render(); status.textContent = 'Ada perubahan yang belum disimpan.';
  });
  edit.addEventListener('input', event => { if (event.target.matches('[data-order-quantity]')) { dirty = true; render(); } });
  edit.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !order || !getSession()?.authenticated) return;
    const choice = render(); if (!choice || !edit.reportValidity()) return;
    const current = generation; setBusy(true); status.textContent = 'Menyimpan rincian…';
    try { const value = await request({ action: 'save', code: order.code, revision: order.revision, choices: choice }); if (current !== generation) return; fill(value); status.textContent = `Rincian tersimpan. Pelanggan dapat memuat ulang kode ${value.code} untuk melihat versi ${value.revision}.`; }
    catch (error) { if (current === generation) status.textContent = `${error.message} Perubahan di form belum dibuang. Jika hasil simpan tidak pasti, muat ulang versi tersimpan untuk memeriksa.`; }
    finally { if (current === generation) setBusy(false); }
  });
  root.querySelector('[data-order-reload]').addEventListener('click', () => { if (order) { input.value = order.code; load(); } });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  return { isDirty: () => dirty, setSession(session) { generation++; root.hidden = !session?.authenticated; setBusy(false); if (!session?.authenticated) { find.reset(); edit.reset(); edit.hidden = true; order = null; dirty = false; status.textContent = ''; preview.textContent = ''; } } };
}
