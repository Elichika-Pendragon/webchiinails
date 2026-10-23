import { calculateServices, defaultPrices, serviceChoices, priceRange } from './pricing.js';

// Public estimate references, never credentials. 32^5 = 33,554,432 slots.
export const ORDER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const normalizeOrderCode = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
export const validOrderCode = value => /^(?=.*[A-HJ-NP-Z])(?=.*[2-9])[A-HJ-NP-Z2-9]{5}$/.test(normalizeOrderCode(value));
export function randomOrderCode(random = crypto) {
  for (let attempt = 0; attempt < 32; attempt++) { const value = Array.from(random.getRandomValues(new Uint8Array(5)), byte => ORDER_ALPHABET[byte & 31]).join(''); if (validOrderCode(value)) return value; }
  throw new Error('Random code unavailable');
}
export function orderChoices(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'glue,kit,selections'
      || !Array.isArray(value.selections) || value.selections.some(item => !item || Object.keys(item).sort().join(',') !== 'id,quantity')) throw new TypeError('Invalid choices');
  const result = calculateServices(defaultPrices, value.selections, value);
  if (!result.lines.length) throw new TypeError('Empty order');
  return { selections: serviceChoices.flatMap(field => value.selections.filter(item => item.id === field.id).map(item => ({ id: item.id, quantity: item.quantity }))), kit: value.kit, glue: value.glue };
}
export function orderSummary(order) {
  if (!validOrderCode(order?.code) || !Array.isArray(order.estimate?.lines)) throw new TypeError('Invalid order');
  return `Kode ${order.code} · versi ${order.revision}\n${order.estimate.lines.map(line => `${line.name}${line.detail ? ` · ${line.detail}` : ''}${line.quantity > 1 ? ` × ${line.quantity}` : ''}: ${priceRange(line.min, line.max)}`).join('\n')}\nEstimasi: ${priceRange(order.estimate.min, order.estimate.max)} (belum ongkir).\nHarga akhir tetap sesuai konsultasi. Kode berlaku sampai ${new Date(order.expiresAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })}.`;
}
