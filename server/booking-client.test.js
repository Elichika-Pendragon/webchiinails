import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { BOOKING_DESIGNS, calculatePayment, getBookingDateBounds, listBookingSlots, normalizeBookingDesign, validateBooking } from './booking.js';
import { PaymentProofError } from '../src/scripts/booking-proof.js';

// This deliberately small DOM/API fixture exercises the native controller without
// adding jsdom or claiming layout, browser navigation or live-provider coverage.
const source = readFileSync(new URL('../src/scripts/booking-client.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
class FixedDate extends Date { static now() { return Date.parse('2026-10-20T13:00:00Z'); } }
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function element() {
  return {
    hidden: true, textContent: '', value: '', name: '', dataset: {}, listeners: {}, attrs: {}, options: [], children: [], disabled: false,
    setAttribute(key, value) { this.attrs[key] = value; },
    removeAttribute(key) { delete this[key]; delete this.attrs[key]; },
    replaceChildren(...values) { this.children = values; this.options = values; this.value = values[0]?.value || ''; this.textContent = ''; },
    add(value) { this.options.push(value); },
    append(...values) { this.children.push(...values); },
    focus() { this.focused = true; },
    addEventListener(key, callback) { this.listeners[key] = callback; },
    querySelectorAll() { return this.children.filter(child => child.tagName === 'BUTTON'); },
    querySelector() { return this.children.find(child => child.tagName === 'BUTTON' && !child.disabled); },
  };
}

function harness(options = {}) {
  const config = { enabled: true, statusFailure: false, requestFailures: 0, hold: false, availabilityFailures: 0, blockedTimes: [], holdAvailability: false, clipboardFailure: false, proofFailure: false, holdProof: false, ...options };
  const nodes = Object.fromEntries([...source.matchAll(/querySelector\('([^']+)'\)/g)].map(match => [match[1], element()]));
  const inputs = Object.fromEntries(['name', 'whatsapp', 'agreedPrice', 'paymentMode', 'deposit', 'designType', 'durationMinutes', 'date', 'time', 'paymentProof'].map(name => {
    const node = element(); node.name = name; return [name, node];
  }));
  nodes['#booking-paymentProof'] = inputs.paymentProof;
  inputs.paymentProof.files = [];
  inputs.paymentMode.value = 'deposit';
  inputs.paymentMode.options = [{ value: 'deposit', disabled: false }, { value: 'full', disabled: false }];
  inputs.designType.value = 'simple';
  inputs.durationMinutes.value = '120';
  const form = nodes['#booking-form'];
  form.hidden = false;
  form.dataset.whatsapp = 'https://wa.me/6281234567890';
  form.elements = { namedItem: name => inputs[name] };
  const fieldsets = [element(), element(), element()];
  form.querySelectorAll = () => fieldsets;
  const errorList = element();
  nodes['#booking-errors'].querySelector = () => errorList;
  const values = Object.fromEntries(['name', 'whatsapp', 'design', 'date', 'time', 'agreedPrice', 'deposit', 'remainingBalance'].map(name => [name, element()]));
  nodes['#booking-review-panel'].querySelector = selector => values[selector.match(/"([^"]+)"/)[1]];
  nodes['#booking-review'].textContent = 'Book';
  for (const name of Object.keys(inputs)) nodes[`#error-${name}`] = element();
  const calls = [];
  const redirects = [];
  const clipboardWrites = [];
  const timeoutBudgets = [];
  const objectUrls = [];
  const revokedUrls = [];
  const proofReleases = [];
  const intervals = new Map();
  let nextInterval = 0;
  class TestURL extends URL {
    static createObjectURL() { const url = `blob:synthetic-${objectUrls.length}`; objectUrls.push(url); return url; }
    static revokeObjectURL(url) { revokedUrls.push(url); }
  }
  const copyButtons = ['shopeepay', 'blu'].map((name, index) => {
    const button = element(); button.dataset.copyPayment = `booking-${name}-number`; button.dataset.paymentLabel = name;
    nodes[`#booking-${name}-number`] = { ...element(), textContent: index ? '001234567890' : '081234567890' };
    return button;
  });
  let release = () => {};
  const availabilityReleases = [];
  const window = {
    location: { href: 'https://chiinails.pages.dev/book', origin: 'https://chiinails.pages.dev', assign: url => redirects.push(url) },
    crypto: webcrypto, setTimeout(callback, milliseconds) { timeoutBudgets.push(milliseconds); return setTimeout(callback, milliseconds); }, clearTimeout, listeners: {},
    setInterval(callback, milliseconds) { const id = ++nextInterval; intervals.set(id, { callback, milliseconds }); return id; },
    clearInterval(id) { intervals.delete(id); },
    addEventListener(key, callback) { this.listeners[key] = callback; },
  };
  const document = { visibilityState: 'visible', listeners: {}, addEventListener(key, callback) { this.listeners[key] = callback; }, querySelector: selector => nodes[selector], getElementById: id => nodes[`#${id}`], querySelectorAll: () => copyButtons, createElement: tag => ({ ...element(), tagName: tag.toUpperCase() }) };
  const navigator = { clipboard: { async writeText(value) { if (config.clipboardFailure) throw new Error('synthetic clipboard denied'); clipboardWrites.push(value); } } };
  const fetch = async (path, request) => {
    calls.push({ path, request });
    if (path.endsWith('/status')) {
      if (config.statusFailure) throw new Error('synthetic offline');
      return { ok: true, status: 200, json: async () => ({ enabled: config.enabled }) };
    }
    if (path === '/api/booking/availability') {
      assert.equal(request.method, 'POST');
      const query = JSON.parse(request.body);
      const date = query.date;
      const design = normalizeBookingDesign(query.designType, query.durationMinutes);
      const blocked = [...config.blockedTimes];
      if (config.holdAvailability) await new Promise(resolve => availabilityReleases.push(resolve));
      if (config.availabilityFailures-- > 0) throw new Error('synthetic availability offline');
      const slots = listBookingSlots(date, { now: FixedDate.now(), ...design, includeElapsed: true }).map(slot => ({ time: slot.time, available: slot.start > FixedDate.now() && !blocked.includes(slot.time) }));
      return { ok: true, status: 200, json: async () => ({ date, ...design, timeZone: 'Asia/Jakarta', slots }) };
    }
    if (config.hold) await new Promise(resolve => { release = resolve; });
    if (config.requestFailures-- > 0) return { ok: false, status: config.requestFailureStatus || 503, json: async () => ({ code: config.requestFailureCode || 'SYNTHETIC_UNAVAILABLE' }) };
    const payload = JSON.parse(request.body);
    const result = validateBooking(payload, { now: FixedDate.now() });
    assert.equal(result.valid, true, 'controller must send valid canonical input');
    const booking = { ...result.value, ...result.preview, id: 'synthetic-request', status: 'pending', hasPaymentProof: true };
    const data = {
      requestId: 'synthetic-request', status: 'pending',
      reviewUrl: config.reviewUrl || `https://chiinails.pages.dev/book/approve?r=${'a'.repeat(43)}`, booking,
    };
    return { ok: true, status: 201, json: async () => data };
  };
  const Option = function (text, value) { return { text, value }; };
  const calendar = { refresh() {}, setInvalid() {}, focus() {} };
  const preparePaymentProof = async (file, { signal }) => {
    if (config.holdProof) await new Promise(resolve => proofReleases.push(resolve));
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (config.proofFailure) throw new PaymentProofError('PROOF_TYPE', 'Gunakan gambar JPEG, PNG, atau WebP.');
    const bytes = Buffer.from(file.syntheticBytes || 'synthetic image');
    const digest = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
    return { contentType: 'image/jpeg', base64: bytes.toString('base64'), digest, blob: new Blob([bytes], { type: 'image/jpeg' }) };
  };
  vm.runInNewContext(source, {
    document, window, navigator, Intl, URL: TestURL, URLSearchParams, Date: FixedDate, Option, fetch, AbortController, DOMException, Uint8Array, PaymentProofError, preparePaymentProof,
    BOOKING_DESIGNS, calculatePayment, getBookingDateBounds, listBookingSlots, normalizeBookingDesign, validateBooking, createBookingCalendar: () => calendar,
  });
  return {
    nodes, inputs, form, fieldsets, values, calls, redirects, window, document, config, availabilityReleases, copyButtons, clipboardWrites, proofReleases, objectUrls, revokedUrls, timeoutBudgets, intervals,
    tickRefresh() { [...intervals.values()].forEach(timer => timer.callback()); },
    visibility(value) { document.visibilityState = value; document.listeners.visibilitychange(); },
    release: () => release(),
    change(name, value) {
      inputs[name].value = value;
      inputs[name].listeners.change?.();
      form.listeners.input({ target: inputs[name] });
    },
    async fill() {
      for (const [name, value] of Object.entries({ name: 'Synthetic Customer', whatsapp: '081234567890', agreedPrice: '100000', paymentMode: 'deposit', designType: 'simple', durationMinutes: '120', date: '2026-10-21' })) this.change(name, value);
      await settle();
      this.change('time', '14:00');
      await this.uploadProof();
    },
    uploadProof(file = { size: 100, type: 'image/png', name: 'synthetic.png' }) { inputs.paymentProof.files = [file]; return inputs.paymentProof.listeners.change(); },
    submit: () => form.listeners.submit({ preventDefault() {} }),
    posts: () => calls.filter(call => call.path.endsWith('/requests')).map(call => JSON.parse(call.request.body)),
  };
}

test('Book requires every editable value and derives rather than trusts DP', async () => {
  const page = harness(); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  await page.fill();
  assert.equal(page.nodes['#booking-review'].disabled, false);
  assert.equal(page.inputs.deposit.value, '20000');
  for (const name of ['name', 'whatsapp', 'agreedPrice', 'date', 'time']) {
    await page.fill(); page.change(name, '');
    assert.equal(page.nodes['#booking-review'].disabled, true, `${name} is required`);
  }
  await page.fill(); page.change('deposit', '1'); await page.submit();
  assert.equal(page.inputs.deposit.value, '20000');
});

test('invalid phone, price and unavailable time cannot enable Book', async () => {
  const page = harness(); await settle();
  for (const [name, value] of [['whatsapp', 'abc'], ['agreedPrice', '1e5'], ['time', '15:00'], ['paymentMode', 'invalid']]) {
    await page.fill(); page.change(name, value);
    assert.equal(page.nodes['#booking-review'].disabled, true);
  }
});

test('nonmobile prefixes and invalid Indonesian mobile lengths expose an error and cannot submit', async () => {
  const page = harness(); await settle(); await page.fill();
  for (const number of ['080012345678', '084123456789', '081234567', '08123456789012', '+081234567890', '62812345abc', '62812345678\n90']) {
    page.change('whatsapp', number);
    page.form.listeners.focusout({ target: page.inputs.whatsapp });
    assert.equal(page.nodes['#booking-review'].disabled, true, number);
    assert.equal(page.nodes['#error-whatsapp'].hidden, false, number);
    assert.equal(page.inputs.whatsapp.attrs['aria-invalid'], 'true', number);
    await page.submit();
    assert.equal(page.posts().length, 0, number);
    assert.equal(page.redirects.length, 0, number);
  }
});

test('valid mobile boundaries and supported country-code formatting remain usable', async () => {
  for (const [input, canonical] of [['0812345678', '62812345678'], ['0891234567890', '62891234567890'], ['6281234567890', '6281234567890'], ['+62 (812) 3456-7890', '6281234567890']]) {
    const page = harness(); await settle(); await page.fill();
    page.change('whatsapp', input);
    page.form.listeners.focusout({ target: page.inputs.whatsapp });
    assert.equal(page.nodes['#booking-review'].disabled, false, input);
    assert.equal(page.nodes['#error-whatsapp'].hidden, true, input);
    await page.submit();
    assert.equal(page.posts()[0].whatsapp, canonical, input);
  }
});

test('online Book posts canonical strings, then prepares the unique approval link in WhatsApp', async () => {
  const page = harness(); await settle(); await page.fill(); await page.submit();
  assert.equal(page.redirects.length, 1);
  const payload = page.posts()[0];
  assert.deepEqual(Object.keys(payload).sort(), ['agreedPrice', 'date', 'designType', 'durationMinutes', 'idempotencyKey', 'name', 'paymentMode', 'proof', 'time', 'whatsapp']);
  assert.equal(payload.whatsapp, '6281234567890');
  assert.equal(payload.agreedPrice, '100000');
  assert.equal(payload.paymentMode, 'deposit');
  assert.equal(payload.designType, 'simple');
  assert.equal(payload.durationMinutes, '120');
  assert.deepEqual(Object.keys(payload.proof).sort(), ['base64', 'contentType']);
  assert.match(payload.idempotencyKey, /^[a-f0-9]{64}$/);
  const message = new URL(page.redirects[0]).searchParams.get('text');
  assert.match(message, /\/book\/approve\?r=[A-Za-z0-9_-]{43}/);
  assert.match(message, /Booking menunggu konfirmasi Chii/);
  assert.equal(page.nodes['#booking-review-panel'].hidden, false);
  assert.equal(page.nodes['#booking-whatsapp-link'].href, page.redirects[0]);
});

test('explicit disabled status keeps the labelled WhatsApp preview without a fabricated approval link', async () => {
  const page = harness({ enabled: false }); await settle(); await page.fill(); await page.submit();
  assert.equal(page.posts().length, 0);
  assert.equal(page.redirects.length, 1);
  assert.doesNotMatch(new URL(page.redirects[0]).searchParams.get('text'), /\/book\/approve/);
  assert.match(page.nodes['#booking-mode-title'].textContent, /Pratinjau/);
  assert.match(page.nodes['#booking-review-privacy'].textContent, /tidak memperbarui kalender/);
});

test('unknown service status fails closed and supports an explicit status retry', async () => {
  const page = harness({ statusFailure: true }); await settle(); await page.fill();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  await page.submit();
  assert.equal(page.redirects.length, 0);
  assert.equal(page.nodes['#booking-status-retry'].hidden, false);
  page.config.statusFailure = false;
  page.nodes['#booking-status-retry'].listeners.click(); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, false);
});

test('request failure retains values and reuses the same key on an explicit retry', async () => {
  const page = harness({ requestFailures: 1 }); await settle(); await page.fill(); await page.submit();
  assert.equal(page.redirects.length, 0);
  assert.equal(page.inputs.name.value, 'Synthetic Customer');
  assert.equal(page.nodes['#booking-review'].disabled, false);
  await page.submit();
  assert.equal(page.posts().length, 2);
  assert.equal(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
});

test('changing a canonical field creates a new key and recalculates DP', async () => {
  const page = harness({ requestFailures: 1 }); await settle(); await page.fill(); await page.submit();
  page.change('agreedPrice', '250000'); await page.submit();
  assert.notEqual(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
  assert.equal(page.inputs.deposit.value, '25000');
});

test('equivalent WhatsApp formatting preserves the canonical retry key', async () => {
  const page = harness({ requestFailures: 1 }); await settle(); await page.fill(); await page.submit();
  page.change('whatsapp', '+62 812-3456-7890'); await page.submit();
  assert.equal(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
});

test('busy submission locks fields and prevents a duplicate POST', async () => {
  const page = harness({ hold: true }); await settle(); await page.fill();
  const pending = page.submit(); await settle();
  assert(page.fieldsets.every(fieldset => fieldset.disabled));
  assert.equal(page.nodes['#booking-review'].disabled, true);
  await page.submit();
  assert.equal(page.posts().length, 1);
  page.release(); await pending;
  assert.equal(page.redirects.length, 1);
});

test('departing the page prevents a late successful response from redirecting', async () => {
  const page = harness({ hold: true }); await settle(); await page.fill();
  const pending = page.submit(); await settle();
  page.window.listeners.pagehide(); page.release(); await pending;
  assert.equal(page.redirects.length, 0);
});

test('a malformed or external approval URL cannot reach WhatsApp', async () => {
  for (const reviewUrl of ['https://evil.example/book/approve?r=' + 'a'.repeat(43), 'https://chiinails.pages.dev/book/approve?r=short', 'https://chiinails.pages.dev/book/approve?r=' + 'a'.repeat(43) + '&extra=1']) {
    const page = harness({ reviewUrl }); await settle(); await page.fill(); await page.submit();
    assert.equal(page.redirects.length, 0);
    assert.equal(page.form.hidden, false);
  }
});

test('leaving an invalid field exposes an associated error without posting', async () => {
  const page = harness(); await settle(); await page.fill(); page.change('whatsapp', 'invalid');
  page.form.listeners.focusout({ target: page.inputs.whatsapp });
  assert.equal(page.nodes['#error-whatsapp'].hidden, false);
  assert.equal(page.inputs.whatsapp.attrs['aria-invalid'], 'true');
  assert.equal(page.posts().length, 0);
});

test('editing the prepared summary retains details and does not submit again', async () => {
  const page = harness(); await settle(); await page.fill(); await page.submit();
  page.nodes['#booking-edit'].listeners.click();
  await settle();
  assert.equal(page.form.hidden, false);
  assert.equal(page.inputs.date.value, '2026-10-21');
  assert.equal(page.inputs.time.value, '14:00');
  assert.equal(page.inputs.name.value, 'Synthetic Customer');
  assert.equal(page.posts().length, 1);
  assert.equal(page.nodes['#booking-form-title'].focused, true);
});

test('full payment updates the amount, zero balance, WhatsApp brief and request identity', async () => {
  const page = harness({ requestFailures: 1 }); await settle(); await page.fill(); await page.submit();
  page.change('paymentMode', 'full');
  assert.equal(page.inputs.deposit.value, '100000');
  assert.equal(page.nodes['#booking-payment-amount-label'].textContent, 'Full payment');
  await page.submit();
  assert.equal(page.posts()[1].paymentMode, 'full');
  assert.notEqual(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
  assert.match(new URL(page.redirects[0]).searchParams.get('text'), /Full payment: Rp.?100\.000/);
  assert.match(new URL(page.redirects[0]).searchParams.get('text'), /Sisa pembayaran: Rp.?0/);
  assert.match(page.values.remainingBalance.textContent, /0/);
});

test('low totals cap payment at the total and normalize full, while a later higher total restores DP', async () => {
  for (const amount of ['15000', '20000']) {
    const page = harness(); await settle(); await page.fill(); page.change('agreedPrice', amount);
    assert.equal(page.inputs.paymentMode.value, 'full');
    assert.equal(page.inputs.paymentMode.options[0].disabled, true);
    assert.equal(page.inputs.deposit.value, amount);
    await page.submit();
    assert.equal(page.posts()[0].paymentMode, 'full');
    assert.match(page.values.remainingBalance.textContent, /0/);
    page.nodes['#booking-edit'].listeners.click();
    page.change('agreedPrice', '100000');
    assert.equal(page.inputs.paymentMode.value, 'deposit');
    assert.equal(page.inputs.deposit.value, '20000');
    assert.equal(page.inputs.paymentMode.options[0].disabled, false);
  }
});

test('each agreed design duration reaches the request and WhatsApp with the actual interval', async () => {
  for (const [designType, durationMinutes] of [['plain', 60], ['simple', 60], ['simple', 120], ['full-art', 180], ['full-art', 240], ['full-art', 300]]) {
    const page = harness(); await settle(); await page.fill();
    page.change('designType', designType);
    page.change('durationMinutes', String(durationMinutes));
    await settle();
    const time = designType === 'full-art' ? '12:00' : '14:00';
    const button = page.nodes['#booking-slots'].children.find(node => node.dataset.time === time);
    assert.equal(button.disabled, false);
    button.listeners.click();
    assert.equal(button.attrs['aria-pressed'], 'true');
    assert.equal(page.inputs.time.hidden, true);
    await page.submit();
    assert.equal(page.posts()[0].designType, designType);
    assert.equal(page.posts()[0].durationMinutes, String(durationMinutes));
    assert.match(new URL(page.redirects[0]).searchParams.get('text'), new RegExp(`Durasi: ${durationMinutes / 60} jam`));
    assert.equal(page.nodes['#booking-duration-summary-label'].textContent, `Waktu · ${durationMinutes / 60} jam`);
  }
});

test('weekend full-art windows honor closing at noon for three, four and five hours', async () => {
  for (const [duration, last] of [[180, '09:00'], [240, '08:00'], [300, null]]) {
    const page = harness(); await settle(); await page.fill();
    page.change('designType', 'full-art'); page.change('durationMinutes', String(duration)); page.change('date', '2026-10-24');
    await settle();
    const available = page.nodes['#booking-slots'].children.filter(button => !button.disabled);
    assert.equal(available.at(-1)?.dataset.time || null, last);
    if (last === null) {
      assert.equal(page.nodes['#booking-review'].disabled, true);
      assert.match(page.nodes['#booking-slot-status'].textContent, /tidak muat/);
    }
  }
});

test('busy starts remain visible as disabled labelled buttons while the chosen start stays selected', async () => {
  const page = harness({ blockedTimes: ['10:00', '10:30'] }); await settle(); await page.fill();
  const blocked = page.nodes['#booking-slots'].children.find(button => button.dataset.time === '10:00');
  assert.equal(blocked.disabled, true);
  assert.match(blocked.attrs['aria-label'], /tidak tersedia/);
  blocked.listeners.click();
  assert.equal(page.inputs.time.value, '14:00');
  const selected = page.nodes['#booking-slots'].children.find(button => button.dataset.time === '14:00');
  assert.equal(selected.attrs['aria-pressed'], 'true');
  assert.equal(page.nodes['#booking-review'].disabled, false);
});

test('availability loading or failure blocks Book and an explicit retry restores the retained choice', async () => {
  const page = harness(); await settle(); await page.fill();
  page.config.holdAvailability = true; page.config.availabilityFailures = 1;
  page.change('date', '2026-10-22'); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  assert.equal(page.nodes['#booking-slots'].attrs['aria-busy'], 'true');
  page.availabilityReleases[0](); await settle();
  assert.equal(page.nodes['#booking-slot-retry'].hidden, false);
  assert.equal(page.nodes['#booking-review'].disabled, true);
  assert.equal(page.inputs.name.value, 'Synthetic Customer');
  page.config.holdAvailability = false;
  page.nodes['#booking-slot-retry'].listeners.click(); await settle();
  assert.equal(page.inputs.time.value, '14:00');
  assert.equal(page.nodes['#booking-review'].disabled, false);
});

test('rapid date changes abort stale checks and only the latest result can enable Book', async () => {
  const page = harness(); await settle(); await page.fill(); page.config.holdAvailability = true;
  page.change('date', '2026-10-22'); await settle();
  page.change('date', '2026-10-23'); await settle();
  const availabilityCalls = page.calls.filter(call => call.path === '/api/booking/availability');
  assert.equal(availabilityCalls.at(-2).request.signal.aborted, true);
  page.availabilityReleases[0](); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  page.availabilityReleases[1](); await settle();
  assert.equal(page.inputs.date.value, '2026-10-23');
  assert.equal(page.nodes['#booking-review'].disabled, false);
  assert.equal(JSON.parse(availabilityCalls.at(-1).request.body).date, '2026-10-23');
});

test('history restoration rechecks availability without sending another request or opening WhatsApp', async () => {
  const page = harness(); await settle(); await page.fill();
  page.window.listeners.pagehide(); page.config.holdAvailability = true;
  page.window.listeners.pageshow({ persisted: true }); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  assert.equal(page.inputs.name.value, 'Synthetic Customer');
  assert.equal(page.posts().length, 0);
  assert.equal(page.redirects.length, 0);
  page.availabilityReleases[0](); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, false);
});

test('changing the agreed design creates a fresh request identity and one-hour plain snapshot', async () => {
  const page = harness({ requestFailures: 1 }); await settle(); await page.fill(); await page.submit();
  page.change('designType', 'plain'); await settle(); page.change('time', '14:00'); await page.submit();
  assert.notEqual(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
  assert.equal(page.posts()[1].designType, 'plain');
  assert.equal(page.posts()[1].durationMinutes, '60');
  assert.match(page.values.design.textContent, /Nail gel.*Removal/);
});

test('copy controls preserve account leading zeros and provide a manual-copy fallback', async () => {
  const page = harness(); await settle();
  await page.copyButtons[1].listeners.click();
  assert.deepEqual(page.clipboardWrites, ['001234567890']);
  assert.match(page.nodes['#booking-copy-status'].textContent, /disalin/);
  page.config.clipboardFailure = true;
  await page.copyButtons[0].listeners.click();
  assert.match(page.nodes['#booking-copy-status'].textContent, /Belum bisa menyalin/);
  assert.equal(page.posts().length, 0);
});

test('Book requires prepared proof and removing it clears the preview and disables submission', async () => {
  const page = harness(); await settle(); await page.fill();
  assert.equal(page.nodes['#booking-review'].disabled, false);
  page.nodes['#booking-proof-remove'].listeners.click();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  assert.equal(page.nodes['#booking-proof-preview'].hidden, true);
  assert.equal(page.inputs.paymentProof.value, '');
  assert.equal(page.revokedUrls.length, 1);
  await page.submit();
  assert.equal(page.posts().length, 0);
});

test('invalid proof or unfinished compression cannot enable Book and stale work cannot restore it', async () => {
  const page = harness(); await settle(); await page.fill();
  page.config.proofFailure = true; await page.uploadProof();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  assert.match(page.nodes['#booking-proof-status'].textContent, /JPEG/);
  page.config.proofFailure = false; page.config.holdProof = true;
  const pending = page.uploadProof(); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  page.nodes['#booking-proof-remove'].listeners.click();
  page.proofReleases[0](); await pending;
  assert.equal(page.nodes['#booking-proof-preview'].hidden, true);
  assert.equal(page.nodes['#booking-review'].disabled, true);
});

test('changed compressed proof creates a new request identity without putting image bytes in WhatsApp', async () => {
  const page = harness({ requestFailures: 1 }); await settle(); await page.fill(); await page.submit();
  await page.uploadProof({ size: 100, type: 'image/png', name: 'never-send-this-name.png', syntheticBytes: 'different image' });
  await page.submit();
  assert.notEqual(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
  assert.equal(page.posts()[1].proof.contentType, 'image/jpeg');
  assert.equal(page.posts()[1].proof.base64, Buffer.from('different image').toString('base64'));
  const message = new URL(page.redirects[0]).searchParams.get('text');
  assert.doesNotMatch(message, /never-send-this-name|ZGlmZmVyZW50IGltYWdl|data:image/);
  assert.match(message, /Bukti pembayaran sudah diunggah/);
});

test('history departure revokes the local proof URL and restoration creates a fresh local preview', async () => {
  const page = harness(); await settle(); await page.fill();
  const before = page.nodes['#booking-proof-image'].src;
  page.window.listeners.pagehide();
  assert(page.revokedUrls.includes(before));
  assert.equal(page.nodes['#booking-proof-image'].src, undefined);
  page.window.listeners.pageshow({ persisted: true }); await settle();
  assert.notEqual(page.nodes['#booking-proof-image'].src, before);
  assert.equal(page.nodes['#booking-proof-preview'].hidden, false);
});

test('fresh slot conflict refreshes availability, asks for another time, and keeps the proof', async () => {
  const page = harness({ requestFailures: 1, requestFailureStatus: 409, requestFailureCode: 'SLOT_CONFLICT' }); await settle(); await page.fill();
  page.config.blockedTimes = ['14:00']; await page.submit();
  assert.match(page.nodes['#booking-submit-status'].textContent, /Pilih tanggal atau jam lain/);
  assert.equal(page.inputs.time.value, '');
  assert.equal(page.nodes['#booking-slots'].children.find(button => button.dataset.time === '14:00').disabled, true);
  assert.equal(page.nodes['#booking-proof-preview'].hidden, false);
  assert.equal(page.nodes['#booking-review'].disabled, true);
});

test('receipt submission has a longer bounded upload budget while status and availability stay short', async () => {
  const page = harness({ hold: true }); await settle(); await page.fill();
  assert(page.timeoutBudgets.length > 0);
  assert(page.timeoutBudgets.every(milliseconds => milliseconds === 12000));
  const pending = page.submit(); await settle();
  assert.equal(page.timeoutBudgets.at(-1), 30000);
  assert.equal(page.nodes['#booking-review'].disabled, true);
  assert.match(page.nodes['#booking-submit-status'].textContent, /Mengunggah bukti/);
  assert.equal(page.form.attrs['aria-busy'], 'true');
  await page.submit();
  assert.equal(page.posts().length, 1);
  page.release(); await pending;
  assert.equal(page.redirects.length, 1);
});

test('availability checks use same-origin JSON POST rather than a mutating GET', async () => {
  const page = harness(); await settle(); await page.fill();
  const checks = page.calls.filter(call => call.path === '/api/booking/availability');
  assert(checks.length > 0);
  for (const call of checks) {
    assert.equal(call.request.method, 'POST');
    assert.equal(call.request.headers['Content-Type'], 'application/json');
    assert.equal(call.request.credentials, 'same-origin');
    assert.deepEqual(Object.keys(JSON.parse(call.request.body)).sort(), ['date', 'designType', 'durationMinutes']);
    assert.equal(typeof JSON.parse(call.request.body).durationMinutes, 'string');
  }
});

test('visible refresh frees cancelled slots calmly while preserving current selection and button focus', async () => {
  const page = harness({ blockedTimes: ['10:00'] }); await settle(); await page.fill();
  assert.equal(page.intervals.size, 1);
  assert.equal([...page.intervals.values()][0].milliseconds, 45000);
  const selected = page.nodes['#booking-slots'].children.find(button => button.dataset.time === '14:00');
  const released = page.nodes['#booking-slots'].children.find(button => button.dataset.time === '10:00');
  selected.focus();
  assert.equal(released.disabled, true);
  page.config.blockedTimes = [];
  page.tickRefresh();
  assert.equal(page.inputs.time.value, '14:00');
  assert.equal(page.nodes['#booking-review'].disabled, false);
  await settle();
  assert.equal(page.nodes['#booking-slots'].children.find(button => button.dataset.time === '14:00'), selected);
  assert.equal(selected.focused, true);
  assert.equal(released.disabled, false);
  assert.equal(page.inputs.time.value, '14:00');
  assert.equal(page.intervals.size, 1);
});

test('refresh clears a newly unavailable selected time without automatically choosing another', async () => {
  const page = harness(); await settle(); await page.fill();
  page.config.blockedTimes = ['14:00']; page.tickRefresh(); await settle();
  assert.equal(page.inputs.time.value, '');
  assert.equal(page.nodes['#booking-review'].disabled, true);
  assert.match(page.nodes['#booking-slot-status'].textContent, /tidak lagi tersedia/);
  page.config.blockedTimes = []; page.tickRefresh(); await settle();
  assert.equal(page.inputs.time.value, '');
  assert.equal(page.nodes['#booking-slots'].children.find(button => button.dataset.time === '14:00').disabled, false);
});

test('hidden page stops refresh and becoming visible checks again without duplicating its timer', async () => {
  const page = harness(); await settle(); await page.fill();
  const before = page.calls.length;
  page.visibility('hidden');
  assert.equal(page.intervals.size, 0);
  page.tickRefresh(); await settle();
  assert.equal(page.calls.length, before);
  page.visibility('visible'); await settle();
  assert.equal(page.calls.length, before + 1);
  assert.equal(page.intervals.size, 1);
  assert.equal(page.inputs.time.value, '14:00');
});

test('receipt preparation and customer submission pause refresh traffic', async () => {
  const page = harness(); await settle(); await page.fill();
  page.config.holdProof = true;
  const preparing = page.uploadProof(); await settle();
  const before = page.calls.length;
  assert.equal(page.intervals.size, 0);
  page.tickRefresh(); assert.equal(page.calls.length, before);
  page.proofReleases[0](); await preparing;
  assert.equal(page.intervals.size, 1);
  page.config.hold = true;
  const sending = page.submit(); await settle();
  assert.equal(page.intervals.size, 0);
  const duringPost = page.calls.length;
  page.tickRefresh(); assert.equal(page.calls.length, duringPost);
  page.release(); await sending;
  assert.equal(page.intervals.size, 0, 'prepared WhatsApp summary does not keep polling');
});

test('refresh never overlaps a pending check and date changes discard the stale refresh', async () => {
  const page = harness(); await settle(); await page.fill(); page.config.holdAvailability = true;
  page.tickRefresh(); await settle();
  const once = page.calls.length;
  page.tickRefresh(); assert.equal(page.calls.length, once);
  page.change('date', '2026-10-22'); await settle();
  const checks = page.calls.filter(call => call.path === '/api/booking/availability');
  assert.equal(checks.at(-2).request.signal.aborted, true);
  page.availabilityReleases[0](); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  page.availabilityReleases[1](); await settle();
  assert.equal(page.inputs.date.value, '2026-10-22');
  assert.equal(page.nodes['#booking-review'].disabled, false);
});

test('departure clears the refresh timer, aborts its request and restores one fresh timer on return', async () => {
  const page = harness(); await settle(); await page.fill(); page.config.holdAvailability = true;
  page.tickRefresh(); await settle();
  const request = page.calls.at(-1).request;
  page.window.listeners.pagehide();
  assert.equal(page.intervals.size, 0);
  assert.equal(request.signal.aborted, true);
  page.availabilityReleases[0](); await settle();
  page.config.holdAvailability = false;
  page.window.listeners.pageshow({ persisted: true }); await settle();
  assert.equal(page.intervals.size, 1);
  assert.equal(page.posts().length, 0);
  assert.equal(page.redirects.length, 0);
});
