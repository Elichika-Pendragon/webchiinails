import { defaultPrices, priceFields, serviceChoices, calculateServices, priceRange, rupiah, validPriceSnapshot } from '../pricing.js';
import { salon } from '../content.js';

export function initPrices(root) {
  let prices = defaultPrices;
  const groups = [...root.querySelectorAll('[data-service-group]')];
  let lastControl = groups[0].querySelector('[data-service-choice]');
  const kit = root.querySelector('[data-kit-choice]');
  const glue = root.querySelector('[data-glue-choice]');
  const status = root.querySelector('[data-prices-status]');
  const retry = root.querySelector('[data-prices-retry]');
  const link = root.querySelector('[data-estimate-link]');
  const list = root.querySelector('[data-estimate-lines]');
  const feedback = root.querySelector('[data-calculator-feedback]');
  const reset = root.querySelector('[data-estimate-reset]');
  let selections = [];
  const invalidQuantities = new Set();
  const text = (selector, value) => root.querySelectorAll(selector).forEach(node => { node.textContent = value; });
  const title = field => `${field.name}${field.detail ? ` · ${field.detail}` : ''}`;
  const announce = value => { feedback.textContent = value; };
  function make(tag, className, value) {
    const node = document.createElement(tag); node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }
  function selectionInput(group) {
    const select = group.querySelector('[data-service-choice]');
    const amount = group.querySelector('[data-add-quantity]');
    const field = serviceChoices.find(item => item.id === select.value);
    group.querySelector('[data-add-quantity-label]').hidden = !field || field.quantityMax === 1;
    group.querySelector('[data-service-add]').disabled = !field;
    amount.max = String(field?.quantityMax ?? 10); amount.value = '1'; amount.setCustomValidity('');
  }
  function render({ rows = true } = {}) {
    if (!invalidQuantities.size) announce('');
    groups.forEach(group => { group.querySelector('[data-group-feedback]').textContent = ''; });
    for (const field of priceFields) {
      const item = prices.items[field.id];
      text(`[data-price-id="${field.id}"]`, priceRange(item.price, item.max));
    }
    for (const option of root.querySelectorAll('[data-service-choice] option[value]:not([value=""])')) {
      const field = serviceChoices.find(item => item.id === option.value);
      const item = prices.items[field.id];
      option.textContent = `${title(field)} · ${priceRange(item.price, item.max)}`;
    }
    text('[data-kit-price]', rupiah(prices.base)); text('[data-glue-price]', rupiah(prices.glue));
    const result = calculateServices(prices, selections, { kit: kit.checked, glue: glue.checked });
    text('[data-estimate-total]', priceRange(result.min, result.max));
    root.querySelector('[data-estimate-empty]').hidden = result.lines.length > 0;
    link.hidden = result.lines.length === 0 || invalidQuantities.size > 0; reset.hidden = result.lines.length === 0;
    if (rows) {
      invalidQuantities.clear(); link.hidden = result.lines.length === 0;
      list.replaceChildren();
      for (const line of result.lines) {
        const row = make('li', 'calculator-line'); row.dataset.hasQuantity = String(line.quantityMax > 1);
        const description = make('div', 'calculator-line-info');
        description.append(make('span', 'calculator-line-name', title(line)));
        description.append(make('strong', 'calculator-line-price', priceRange(line.min, line.max)));
        const controls = make('div', 'calculator-line-controls');
        if (line.quantityMax > 1) {
          const label = make('label', '', 'Jumlah');
          const input = make('input', ''); input.type = 'number'; input.min = '1'; input.max = String(line.quantityMax); input.step = '1'; input.inputMode = 'numeric'; input.value = String(line.quantity);
          input.setAttribute('aria-label', `Jumlah ${title(line)}`); input.dataset.lineQuantity = line.id;
          label.append(input); controls.append(label);
        }
        const remove = make('button', 'text-link calculator-remove', 'Hapus');
        remove.type = 'button'; remove.dataset.removeService = line.id;
        remove.setAttribute('aria-label', `Hapus ${title(line)}`); controls.append(remove);
        row.append(description, controls); list.append(row);
      }
    } else {
      const rows = [...list.children];
      result.lines.forEach((line, index) => { rows[index].querySelector('.calculator-line-price').textContent = priceRange(line.min, line.max); });
    }
    const message = `Halo Chii, saya ingin konsultasi layanan berikut:\n${result.lines.map(line => `- ${title(line)}${line.quantity > 1 ? ` × ${line.quantity}` : ''}: ${priceRange(line.min, line.max)}`).join('\n')}\nEstimasi: ${priceRange(result.min, result.max)} (belum ongkir). Mohon konfirmasi kombinasi layanan, satuan tambahan dan harga akhir.`;
    link.href = `${salon.whatsapp}?text=${encodeURIComponent(message)}`;
  }
  for (const group of groups) {
    const select = group.querySelector('[data-service-choice]');
    const amount = group.querySelector('[data-add-quantity]');
    const groupFeedback = group.querySelector('[data-group-feedback]');
    const announceGroup = value => { groupFeedback.textContent = value; };
    group.querySelector('[data-service-add]').addEventListener('click', () => {
      const field = serviceChoices.find(item => item.id === select.value);
      if (!field) return;
      const quantity = field.quantityMax === 1 ? 1 : Number(amount.value);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > field.quantityMax) {
        amount.setCustomValidity(`Isi jumlah antara 1 dan ${field.quantityMax}.`); amount.reportValidity(); return;
      }
      amount.setCustomValidity(''); lastControl = select;
      const existing = selections.find(item => item.id === field.id);
      if (existing && field.quantityMax === 1) { announceGroup(`${title(field)} sudah ada dalam rincian.`); return; }
      if (existing && existing.quantity + quantity > field.quantityMax) { announceGroup(`Jumlah ${title(field)} maksimum ${field.quantityMax}. Ubah jumlah pada rincian.`); return; }
      const replaced = selections.some(item => item.id === field.alternative);
      selections = selections.filter(item => item.id !== field.alternative);
      if (existing) existing.quantity += quantity;
      else selections.push({ id: field.id, quantity });
      render();
      const result = calculateServices(prices, selections, { kit: kit.checked, glue: glue.checked });
      announceGroup(`${title(field)} ditambahkan. Total ${priceRange(result.min, result.max)}.${replaced ? ' Pilihan 1 / 10 kuku sebelumnya diganti.' : ''}`);
    });
    amount.addEventListener('input', () => amount.setCustomValidity(''));
    select.addEventListener('change', () => { selectionInput(group); groupFeedback.textContent = ''; });
    selectionInput(group);
  }
  kit.addEventListener('change', () => render()); glue.addEventListener('change', () => render());
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-service]'); if (!button) return;
    const id = button.dataset.removeService;
    if (id === 'kit') kit.checked = false;
    else if (id === 'glue') glue.checked = false;
    else selections = selections.filter(item => item.id !== id);
    render(); announce('Pilihan dihapus.'); lastControl.focus();
  });
  list.addEventListener('input', event => {
    const input = event.target.closest('[data-line-quantity]'); if (!input) return;
    const field = serviceChoices.find(item => item.id === input.dataset.lineQuantity);
    const quantity = Number(input.value);
    const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= field.quantityMax;
    input.setCustomValidity(valid ? '' : `Isi jumlah antara 1 dan ${field.quantityMax}.`);
    if (valid) invalidQuantities.delete(field.id); else invalidQuantities.add(field.id);
    link.hidden = invalidQuantities.size > 0;
    if (!valid) { announce('Jumlah belum valid. Estimasi masih memakai jumlah valid terakhir.'); return; }
    selections.find(item => item.id === field.id).quantity = quantity;
    render({ rows: false }); if (!invalidQuantities.size) announce('');
  });
  reset.addEventListener('click', () => { selections = []; kit.checked = false; glue.checked = false; render(); groups.forEach(group => { group.querySelector('[data-group-feedback]').textContent = ''; }); announce('Pilihan dikosongkan.'); lastControl.focus(); });
  root.querySelector('[data-calculator-controls]').hidden = false;
  render();
  let loading = false;
  async function refresh() {
    if (loading) return;
    loading = true; retry.hidden = true;
    status.textContent = 'Memeriksa harga…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/prices', { credentials: 'omit', signal: controller.signal, headers: { Accept: 'application/json' } });
      const snapshot = await response.json();
      if (!response.ok || !validPriceSnapshot(snapshot)) throw new Error('unavailable');
      prices = snapshot.prices; render();
      status.textContent = 'Harga terbaru dimuat.';
    } catch {
      status.textContent = 'Harga terbaru belum dapat diperiksa. Estimasi memakai daftar terakhir di halaman; konfirmasikan melalui WhatsApp atau coba lagi.';
      retry.hidden = false;
    } finally { clearTimeout(timeout); loading = false; }
  }
  retry.addEventListener('click', refresh);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); refresh(); }
    }, { rootMargin: '200px' });
    observer.observe(root);
  } else refresh();
}
