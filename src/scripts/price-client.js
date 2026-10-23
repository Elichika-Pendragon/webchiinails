import { defaultPrices, priceFields, serviceChoices, calculateServices, priceRange, rupiah, validPriceSnapshot } from '../pricing.js';
import { salon } from '../content.js';

export function initPrices(root) {
  let prices = defaultPrices;
  let selections = [];
  const kit = root.querySelector('[data-kit-choice]');
  const glue = root.querySelector('[data-glue-choice]');
  const status = root.querySelector('[data-prices-status]');
  const retry = root.querySelector('[data-prices-retry]');
  const link = root.querySelector('[data-estimate-link]');
  const list = root.querySelector('[data-estimate-lines]');
  const feedback = root.querySelector('[data-calculator-feedback]');
  const reset = root.querySelector('[data-estimate-reset]');
  const title = field => `${field.name}${field.detail ? ` · ${field.detail}` : ''}`;
  const announce = value => { feedback.textContent = value; };
  const text = (selector, value) => root.querySelectorAll(selector).forEach(node => { node.textContent = value; });
  const controls = new Map(serviceChoices.map(field => [field.id, {
    row: root.querySelector(`[data-menu-item="${field.id}"]`),
    input: root.querySelector(`[data-menu-choice="${field.id}"]`),
    quantity: root.querySelector(`[data-menu-quantity="${field.id}"]`),
  }]));
  const inputFor = id => id === 'kit' ? kit : id === 'glue' ? glue : controls.get(id)?.input;

  function render() {
    const focusedRemove = document.activeElement?.closest('[data-remove-service]')?.dataset.removeService;
    for (const field of priceFields) {
      const item = prices.items[field.id];
      text(`[data-price-id="${field.id}"]`, priceRange(item.price, item.max));
    }
    text('[data-kit-price]', rupiah(prices.base)); text('[data-glue-price]', rupiah(prices.glue));
    for (const field of serviceChoices) {
      const control = controls.get(field.id);
      const selected = selections.find(item => item.id === field.id);
      control.input.checked = Boolean(selected);
      control.row.classList.toggle('is-selected', Boolean(selected));
      if (control.quantity) {
        control.quantity.hidden = !selected;
        control.quantity.querySelector('[data-menu-count]').textContent = String(selected?.quantity ?? 1);
        control.quantity.querySelector('[data-quantity-step="-1"]').disabled = !selected || selected.quantity <= 1;
        control.quantity.querySelector('[data-quantity-step="1"]').disabled = !selected || selected.quantity >= field.quantityMax;
      }
    }
    kit.closest('.price-menu-item').classList.toggle('is-selected', kit.checked);
    glue.closest('.price-menu-item').classList.toggle('is-selected', glue.checked);
    const result = calculateServices(prices, selections, { kit: kit.checked, glue: glue.checked });
    text('[data-estimate-total]', priceRange(result.min, result.max));
    const countLabel = result.lines.length ? `${result.lines.length} pilihanmu` : 'Belum ada pilihan';
    text('[data-estimate-count]', countLabel);
    root.querySelector('[data-estimate-summary] > summary').setAttribute('aria-label', `${countLabel}. Estimasi ${priceRange(result.min, result.max)}. Lihat rincian.`);
    root.querySelector('[data-estimate-empty]').hidden = result.lines.length > 0;
    link.hidden = reset.hidden = result.lines.length === 0;
    list.replaceChildren();
    for (const line of result.lines) {
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = `${title(line)}${line.quantity > 1 ? ` × ${line.quantity}` : ''}`;
      const value = document.createElement('strong'); value.textContent = priceRange(line.min, line.max);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'text-link'; remove.textContent = 'Hapus';
      remove.dataset.removeService = line.id; remove.setAttribute('aria-label', `Hapus ${title(line)}`);
      row.append(name, value, remove); list.append(row);
    }
    if (focusedRemove) list.querySelector(`[data-remove-service="${focusedRemove}"]`)?.focus();
    const message = `Halo Chii, saya ingin konsultasi layanan berikut:\n${result.lines.map(line => `- ${title(line)}${line.quantity > 1 ? ` × ${line.quantity}` : ''}: ${priceRange(line.min, line.max)}`).join('\n')}\nEstimasi: ${priceRange(result.min, result.max)} (belum ongkir). Mohon konfirmasi kombinasi layanan, satuan tambahan dan harga akhir.`;
    link.href = `${salon.whatsapp}?text=${encodeURIComponent(message)}`;
  }

  root.addEventListener('change', event => {
    const input = event.target.closest('[data-menu-choice]');
    if (input) {
      const field = serviceChoices.find(item => item.id === input.dataset.menuChoice);
      const replaced = input.checked && selections.some(item => item.id === field.alternative);
      selections = selections.filter(item => item.id !== field.id && (!input.checked || item.id !== field.alternative));
      if (input.checked) selections.push({ id: field.id, quantity: 1 });
      render(); announce(`${title(field)} ${input.checked ? 'dipilih' : 'dihapus'}.${replaced ? ' Pilihan 1 / 10 kuku sebelumnya diganti.' : ''}`);
    } else if (event.target === kit || event.target === glue) { render(); announce('Estimasi diperbarui.'); }
  });
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-quantity-step]');
    if (!button || button.disabled) return;
    const field = serviceChoices.find(item => item.id === button.dataset.serviceId);
    const selected = selections.find(item => item.id === field.id);
    if (!selected) return;
    selected.quantity = Math.max(1, Math.min(field.quantityMax, selected.quantity + Number(button.dataset.quantityStep)));
    render(); announce(`${title(field)}: ${selected.quantity}.`);
  });
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-service]'); if (!button) return;
    const id = button.dataset.removeService;
    if (id === 'kit') kit.checked = false;
    else if (id === 'glue') glue.checked = false;
    else selections = selections.filter(item => item.id !== id);
    render(); announce('Pilihan dihapus.'); inputFor(id)?.focus();
  });
  reset.addEventListener('click', () => {
    selections = []; kit.checked = false; glue.checked = false;
    render(); announce('Pilihan dikosongkan.'); controls.get(serviceChoices[0].id).input.focus();
  });
  for (const input of root.querySelectorAll('[data-menu-choice],[data-kit-choice],[data-glue-choice]')) input.disabled = false;
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
