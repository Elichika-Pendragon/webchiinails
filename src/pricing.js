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
