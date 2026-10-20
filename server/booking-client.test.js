import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { calculateDeposit, getBookingDateBounds, listBookingSlots, validateBooking } from './booking.js';

// This deliberately small DOM/API fixture exercises the native controller without
// adding jsdom or claiming layout, browser navigation or live-provider coverage.
const source = readFileSync(new URL('../src/scripts/booking-client.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
class FixedDate extends Date { static now() { return Date.parse('2026-10-20T13:00:00Z'); } }
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function element() {
  return {
    hidden: true, textContent: '', value: '', name: '', dataset: {}, listeners: {}, attrs: {}, options: [], children: [], disabled: false,
    setAttribute(key, value) { this.attrs[key] = value; },
    replaceChildren(...values) { this.children = values; this.options = values; this.value = values[0]?.value || ''; this.textContent = ''; },
    add(value) { this.options.push(value); },
    append(...values) { this.children.push(...values); },
    focus() { this.focused = true; },
    addEventListener(key, callback) { this.listeners[key] = callback; },
  };
}

function harness(options = {}) {
  const config = { enabled: true, statusFailure: false, requestFailures: 0, hold: false, ...options };
  const nodes = Object.fromEntries([...source.matchAll(/querySelector\('([^']+)'\)/g)].map(match => [match[1], element()]));
  const inputs = Object.fromEntries(['name', 'whatsapp', 'agreedPrice', 'deposit', 'date', 'time'].map(name => {
    const node = element(); node.name = name; return [name, node];
  }));
  const form = nodes['#booking-form'];
  form.hidden = false;
  form.dataset.whatsapp = 'https://wa.me/6281234567890';
  form.elements = { namedItem: name => inputs[name] };
  const fieldsets = [element(), element(), element()];
  form.querySelectorAll = () => fieldsets;
  const errorList = element();
  nodes['#booking-errors'].querySelector = () => errorList;
  const values = Object.fromEntries(['name', 'whatsapp', 'date', 'time', 'agreedPrice', 'deposit', 'remainingBalance'].map(name => [name, element()]));
  nodes['#booking-review-panel'].querySelector = selector => values[selector.match(/"([^"]+)"/)[1]];
  nodes['#booking-review'].textContent = 'Book';
  for (const name of Object.keys(inputs)) nodes[`#error-${name}`] = element();
  const calls = [];
  const redirects = [];
  let release = () => {};
  const window = {
    location: { href: 'https://chiinails.pages.dev/book', origin: 'https://chiinails.pages.dev', assign: url => redirects.push(url) },
    crypto: webcrypto, setTimeout, clearTimeout, listeners: {},
    addEventListener(key, callback) { this.listeners[key] = callback; },
  };
  const document = { querySelector: selector => nodes[selector], createElement: () => element() };
  const fetch = async (path, request) => {
    calls.push({ path, request });
    if (path.endsWith('/status')) {
      if (config.statusFailure) throw new Error('synthetic offline');
      return { ok: true, status: 200, json: async () => ({ enabled: config.enabled }) };
    }
    if (config.hold) await new Promise(resolve => { release = resolve; });
    if (config.requestFailures-- > 0) return { ok: false, status: 503, json: async () => ({ code: 'SYNTHETIC_UNAVAILABLE' }) };
    const payload = JSON.parse(request.body);
    const result = validateBooking(payload, { now: FixedDate.now() });
    assert.equal(result.valid, true, 'controller must send valid canonical input');
    const booking = { ...result.value, ...result.preview, id: 'synthetic-request', status: 'pending' };
    const data = {
      requestId: 'synthetic-request', status: 'pending',
      reviewUrl: config.reviewUrl || `https://chiinails.pages.dev/book/approve?r=${'a'.repeat(43)}`, booking,
    };
    return { ok: true, status: 201, json: async () => data };
  };
  const Option = function (text, value) { return { text, value }; };
  const calendar = { refresh() {}, setInvalid() {}, focus() {} };
  vm.runInNewContext(source, {
    document, window, Intl, URL, Date: FixedDate, Option, fetch, AbortController, DOMException, Uint8Array,
    calculateDeposit, getBookingDateBounds, listBookingSlots, validateBooking, createBookingCalendar: () => calendar,
  });
  return {
    nodes, inputs, form, fieldsets, values, calls, redirects, window, config,
    release: () => release(),
    change(name, value) {
      inputs[name].value = value;
      if (name === 'date') inputs.date.listeners.change();
      form.listeners.input({ target: inputs[name] });
    },
    fill() {
      for (const [name, value] of Object.entries({ name: 'Synthetic Customer', whatsapp: '081234567890', agreedPrice: '100000', date: '2026-10-21', time: '14:00' })) this.change(name, value);
    },
    submit: () => form.listeners.submit({ preventDefault() {} }),
    posts: () => calls.filter(call => call.path.endsWith('/requests')).map(call => JSON.parse(call.request.body)),
  };
}

test('Book requires every editable value and derives rather than trusts DP', async () => {
  const page = harness(); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  page.fill();
  assert.equal(page.nodes['#booking-review'].disabled, false);
  assert.equal(page.inputs.deposit.value, '10000');
  for (const name of ['name', 'whatsapp', 'agreedPrice', 'date', 'time']) {
    page.fill(); page.change(name, '');
    assert.equal(page.nodes['#booking-review'].disabled, true, `${name} is required`);
  }
  page.fill(); page.change('deposit', '1'); await page.submit();
  assert.equal(page.inputs.deposit.value, '10000');
});

test('invalid phone, price and unavailable time cannot enable Book', async () => {
  const page = harness(); await settle();
  for (const [name, value] of [['whatsapp', 'abc'], ['agreedPrice', '1e5'], ['time', '15:00']]) {
    page.fill(); page.change(name, value);
    assert.equal(page.nodes['#booking-review'].disabled, true);
  }
});

test('online Book posts canonical strings, then prepares the unique approval link in WhatsApp', async () => {
  const page = harness(); await settle(); page.fill(); await page.submit();
  assert.equal(page.redirects.length, 1);
  const payload = page.posts()[0];
  assert.deepEqual(Object.keys(payload).sort(), ['agreedPrice', 'date', 'idempotencyKey', 'name', 'time', 'whatsapp']);
  assert.equal(payload.whatsapp, '6281234567890');
  assert.equal(payload.agreedPrice, '100000');
  assert.match(payload.idempotencyKey, /^[a-f0-9]{64}$/);
  const message = new URL(page.redirects[0]).searchParams.get('text');
  assert.match(message, /\/book\/approve\?r=[A-Za-z0-9_-]{43}/);
  assert.match(message, /Booking menunggu konfirmasi Chii/);
  assert.equal(page.nodes['#booking-review-panel'].hidden, false);
  assert.equal(page.nodes['#booking-whatsapp-link'].href, page.redirects[0]);
});

test('explicit disabled status keeps the labelled WhatsApp preview without a fabricated approval link', async () => {
  const page = harness({ enabled: false }); await settle(); page.fill(); await page.submit();
  assert.equal(page.posts().length, 0);
  assert.equal(page.redirects.length, 1);
  assert.doesNotMatch(new URL(page.redirects[0]).searchParams.get('text'), /\/book\/approve/);
  assert.match(page.nodes['#booking-mode-title'].textContent, /Pratinjau/);
  assert.match(page.nodes['#booking-review-privacy'].textContent, /tidak memperbarui kalender/);
});

test('unknown service status fails closed and supports an explicit status retry', async () => {
  const page = harness({ statusFailure: true }); await settle(); page.fill();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  await page.submit();
  assert.equal(page.redirects.length, 0);
  assert.equal(page.nodes['#booking-status-retry'].hidden, false);
  page.config.statusFailure = false;
  page.nodes['#booking-status-retry'].listeners.click(); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, false);
});

test('request failure retains values and reuses the same key on an explicit retry', async () => {
  const page = harness({ requestFailures: 1 }); await settle(); page.fill(); await page.submit();
  assert.equal(page.redirects.length, 0);
  assert.equal(page.inputs.name.value, 'Synthetic Customer');
  assert.equal(page.nodes['#booking-review'].disabled, false);
  await page.submit();
  assert.equal(page.posts().length, 2);
  assert.equal(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
});

test('changing a canonical field creates a new key and recalculates DP', async () => {
  const page = harness({ requestFailures: 1 }); await settle(); page.fill(); await page.submit();
  page.change('agreedPrice', '120000'); await page.submit();
  assert.notEqual(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
  assert.equal(page.inputs.deposit.value, '12000');
});

test('equivalent WhatsApp formatting preserves the canonical retry key', async () => {
  const page = harness({ requestFailures: 1 }); await settle(); page.fill(); await page.submit();
  page.change('whatsapp', '+62 812-3456-7890'); await page.submit();
  assert.equal(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
});

test('busy submission locks fields and prevents a duplicate POST', async () => {
  const page = harness({ hold: true }); await settle(); page.fill();
  const pending = page.submit(); await settle();
  assert(page.fieldsets.every(fieldset => fieldset.disabled));
  assert.equal(page.nodes['#booking-review'].disabled, true);
  await page.submit();
  assert.equal(page.posts().length, 1);
  page.release(); await pending;
  assert.equal(page.redirects.length, 1);
});

test('departing the page prevents a late successful response from redirecting', async () => {
  const page = harness({ hold: true }); await settle(); page.fill();
  const pending = page.submit(); await settle();
  page.window.listeners.pagehide(); page.release(); await pending;
  assert.equal(page.redirects.length, 0);
});

test('a malformed or external approval URL cannot reach WhatsApp', async () => {
  for (const reviewUrl of ['https://evil.example/book/approve?r=' + 'a'.repeat(43), 'https://chiinails.pages.dev/book/approve?r=short', 'https://chiinails.pages.dev/book/approve?r=' + 'a'.repeat(43) + '&extra=1']) {
    const page = harness({ reviewUrl }); await settle(); page.fill(); await page.submit();
    assert.equal(page.redirects.length, 0);
    assert.equal(page.form.hidden, false);
  }
});

test('leaving an invalid field exposes an associated error without posting', async () => {
  const page = harness(); await settle(); page.fill(); page.change('whatsapp', 'invalid');
  page.form.listeners.focusout({ target: page.inputs.whatsapp });
  assert.equal(page.nodes['#error-whatsapp'].hidden, false);
  assert.equal(page.inputs.whatsapp.attrs['aria-invalid'], 'true');
  assert.equal(page.posts().length, 0);
});

test('editing the prepared summary retains details and does not submit again', async () => {
  const page = harness(); await settle(); page.fill(); await page.submit();
  page.nodes['#booking-edit'].listeners.click();
  assert.equal(page.form.hidden, false);
  assert.equal(page.inputs.date.value, '2026-10-21');
  assert.equal(page.inputs.time.value, '14:00');
  assert.equal(page.inputs.name.value, 'Synthetic Customer');
  assert.equal(page.posts().length, 1);
  assert.equal(page.nodes['#booking-form-title'].focused, true);
});
