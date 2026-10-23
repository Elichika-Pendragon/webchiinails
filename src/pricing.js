import { priceGroups, pressOnPricing } from './content.js';

// Stable keys belong to the existing owner-supplied menu, never user labels.
export const priceFields = priceGroups.flatMap(group => group.items.map((item, index) => ({
  id: `${group.id}-${index}`, group: group.id, title: group.title, name: item.name, detail: item.detail || '',
  design: ['nail-art', 'cat-eye'].includes(group.id), price: item.price, max: item.max ?? null,
})));
export const defaultPrices = {
  base: pressOnPricing.base, glue: pressOnPricing.glue,
  items: Object.fromEntries(priceFields.map(item => [item.id, { price: item.price, max: item.max }])),
};
export const DEFAULT_DESIGN = 'cat-eye-0';
export const MAX_PRICE = 10_000_000;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, expected) => record(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const amount = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_PRICE;
export function validPrices(value) {
  return keys(value, ['base', 'glue', 'items']) && amount(value.base) && amount(value.glue)
    && keys(value.items, priceFields.map(item => item.id))
    && priceFields.every(({ id }) => {
      const item = value.items[id];
      return keys(item, ['price', 'max']) && amount(item.price)
        && (item.max === null || (amount(item.max) && item.max >= item.price));
    });
}
export function validPriceSnapshot(value) {
  return record(value) && Number.isSafeInteger(value.revision) && value.revision >= 0
    && (value.updatedAt === null || (typeof value.updatedAt === 'string' && /^\d{4}-\d\d-\d\dT/.test(value.updatedAt) && Number.isFinite(Date.parse(value.updatedAt))))
    && validPrices(value.prices);
}
const numbers = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
export const rupiah = value => `Rp${numbers.format(value)}`;
export const priceRange = (min, max = null) => max !== null && max !== min ? `${rupiah(min)}–${numbers.format(max)}` : rupiah(min);
export function calculatePressOn(prices, designId = DEFAULT_DESIGN, glue = false) {
  if (!validPrices(prices) || !priceFields.some(field => field.id === designId && field.design) || typeof glue !== 'boolean') throw new TypeError('Invalid price estimate');
  const design = prices.items[designId];
  const extra = glue ? prices.glue : 0;
  return { base: prices.base, design: design.price, designMax: design.max, glue: extra,
    min: prices.base + design.price + extra, max: prices.base + (design.max ?? design.price) + extra };
}

// Menu quantities use only the listed units. Fixed 10-nail services are one
// line per estimate. Stickers/accessories may be repeated as requested extras.
export const serviceChoices = priceFields.map(field => ({ ...field,
  detail: field.detail || (field.design ? '10 jari' : ''),
  quantityMax: field.detail === '1 kuku' ? 10 : ['extras-3', 'extras-4'].includes(field.id) ? 50 : 1,
  alternative: ({ 'extras-0': 'extras-1', 'extras-1': 'extras-0', 'removal-0': 'removal-1', 'removal-1': 'removal-0', 'removal-2': 'removal-3', 'removal-3': 'removal-2' })[field.id] || null,
}));
export function calculateServices(prices, selections = [], { kit = false, glue = false } = {}) {
  if (!validPrices(prices) || !Array.isArray(selections) || selections.length > serviceChoices.length || typeof kit !== 'boolean' || typeof glue !== 'boolean') throw new TypeError('Invalid service estimate');
  const seen = new Set();
  const lines = selections.map(selection => {
    const field = serviceChoices.find(item => item.id === selection?.id);
    if (!field || seen.has(field.id) || seen.has(field.alternative) || !Number.isInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > field.quantityMax) throw new TypeError('Invalid service quantity');
    seen.add(field.id);
    const value = prices.items[field.id];
    return { id: field.id, name: field.name, detail: field.detail, quantity: selection.quantity, quantityMax: field.quantityMax,
      min: value.price * selection.quantity, max: (value.max ?? value.price) * selection.quantity };
  });
  if (kit) lines.push({ id: 'kit', name: 'Base kit press-on', detail: '10 kuku', quantity: 1, min: prices.base, max: prices.base });
  if (glue) lines.push({ id: 'glue', name: 'Super glue nails MXBON', detail: '', quantity: 1, min: prices.glue, max: prices.glue });
  return { lines, min: lines.reduce((total, line) => total + line.min, 0), max: lines.reduce((total, line) => total + line.max, 0) };
}
