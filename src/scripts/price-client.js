import { defaultPrices, priceFields, DEFAULT_DESIGN, calculatePressOn, priceRange, rupiah, validPriceSnapshot } from '../pricing.js';
import { salon } from '../content.js';

export function initPrices(root) {
  let prices = defaultPrices;
  const select = root.querySelector('[data-design-choice]');
  const glue = root.querySelector('[data-glue-choice]');
  const status = root.querySelector('[data-prices-status]');
  const retry = root.querySelector('[data-prices-retry]');
  const link = root.querySelector('[data-estimate-link]');
  const text = (selector, value) => root.querySelectorAll(selector).forEach(node => { node.textContent = value; });
  function render() {
    for (const field of priceFields) {
      const item = prices.items[field.id];
      text(`[data-price-id="${field.id}"]`, priceRange(item.price, item.max));
    }
    text('[data-kit-price]', rupiah(prices.base));
    text('[data-glue-price]', rupiah(prices.glue));
    const design = priceFields.find(item => item.id === select.value && item.design);
    const result = calculatePressOn(prices, design?.id || DEFAULT_DESIGN, glue.checked);
    text('[data-design-label]', design?.name || 'Cat eye / silky cat eye');
    text('[data-design-price]', priceRange(result.design, result.designMax));
    text('[data-selected-glue]', rupiah(result.glue));
    text('[data-estimate-total]', priceRange(result.min, result.max));
    root.querySelector('[data-glue-row]').hidden = !glue.checked;
    const message = `Halo Chii, saya ingin konsultasi press-on 1 set (10 kuku).\nDesain: ${design?.name || 'Cat eye'}.\nBase kit: ${rupiah(prices.base)}.\nDesain: ${priceRange(result.design, result.designMax)}.${glue.checked ? `\nSuper glue nails MXBON: ${rupiah(result.glue)}.` : ''}\nEstimasi: ${priceRange(result.min, result.max)} (belum ongkir). Mohon konfirmasi harga akhir dan ukuran kuku.`;
    link.href = `${salon.whatsapp}?text=${encodeURIComponent(message)}`;
  }
  select.addEventListener('change', render);
  glue.addEventListener('change', render);
  root.querySelector('[data-calculator-controls]').hidden = false;
  render();
  let loading = false;
  async function refresh() {
    if (loading) return;
    loading = true; retry.hidden = true;
    status.textContent = 'Memeriksa harga terbaru…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/prices', { credentials: 'omit', signal: controller.signal, headers: { Accept: 'application/json' } });
      const snapshot = await response.json();
      if (!response.ok || !validPriceSnapshot(snapshot)) throw new Error('unavailable');
      prices = snapshot.prices; render();
      status.textContent = 'Harga terbaru dimuat. Estimasi belum termasuk ongkir; konfirmasi akhir lewat WhatsApp.';
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
