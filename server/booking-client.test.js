import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { BOOKING_DESIGNS, calculatePayment, getBookingDateBounds, listBookingSlots, normalizeBookingDesign, validateBooking } from './booking.js';
import { PaymentProofError } from '../src/scripts/booking-proof.js';
import { BookingChallengeError } from '../src/scripts/booking-challenge.js';
import { createBookingDraft } from '../src/scripts/booking-draft.js';
import { calendarMonthDays } from '../src/scripts/booking-calendar.js';

// This deliberately small DOM/API fixture exercises the native controller without
// adding jsdom or claiming layout, browser navigation or live-provider coverage.
const source = readFileSync(new URL('../src/scripts/booking-client.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
class FixedDate extends Date { static now() { return Date.parse('2026-10-20T13:00:00Z'); } }
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
let challengeSequence = 0;
const syntheticJpeg = value => Buffer.concat([Buffer.from([255,216,255,219]),Buffer.from(value || 'synthetic image'),Buffer.from([255,217])]);
const postPayload = call => {
  assert.ok(call.request.body instanceof FormData, 'receipt transport stays binary multipart');
  assert.deepEqual([...call.request.body.keys()].sort(), ['booking','proof']);
  const proof = call.request.body.get('proof');
  assert.ok(proof instanceof Blob);
  return {...JSON.parse(call.request.body.get('booking')),proof:{contentType:proof.type,blob:proof}};
};
const proofBytes = async payload => Buffer.from(await payload.proof.blob.arrayBuffer());

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
  const config = { enabled: true, statusFailure: false, requestFailures: 0, hold: false, availabilityFailures: 0, blockedTimes: [], busyIntervals: [], holdAvailability: false, closedDates: [], closedByDesign: {}, monthFailures: 0, holdMonth: false, monthResponse: null, clipboardFailure: false, proofFailure: false, holdProof: false, challengeFailure: false, holdChallenge: false, ...options };
  const nodes = Object.fromEntries([...source.matchAll(/querySelector\('([^']+)'\)/g)].map(match => [match[1], element()]));
  const inputs = Object.fromEntries(['name', 'whatsapp', 'agreedPrice', 'paymentMode', 'deposit', 'serviceDuration', 'date', 'time', 'paymentProof'].map(name => {
    const node = element(); node.name = name; return [name, node];
  }));
  nodes['#booking-paymentProof'] = inputs.paymentProof;
  inputs.paymentProof.files = [];
  inputs.paymentMode.value = 'deposit';
  inputs.paymentMode.options = [{ value: 'deposit', disabled: false }, { value: 'full', disabled: false }];
  inputs.serviceDuration.value = 'simple:120';
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
  const challengeCalls = [];
  const challengeReleases = [];
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
  const monthReleases = [];
  const window = {
    location: { href: 'https://chiinails.pages.dev/book', origin: 'https://chiinails.pages.dev', assign: url => redirects.push(url) },
    crypto: webcrypto, setTimeout(callback, milliseconds) { timeoutBudgets.push(milliseconds); return setTimeout(callback, milliseconds); }, clearTimeout, listeners: {},
    setInterval(callback, milliseconds) { const id = ++nextInterval; intervals.set(id, { callback, milliseconds }); return id; },
    clearInterval(id) { intervals.delete(id); },
    addEventListener(key, callback) { this.listeners[key] = callback; },
  };
  const document = { visibilityState: 'visible', listeners: {}, addEventListener(key, callback) { this.listeners[key] = callback; }, querySelector: selector => nodes[selector], getElementById: id => nodes[`#${id}`], querySelectorAll: () => copyButtons, createElement: tag => ({ ...element(), tagName: tag.toUpperCase() }) };
  const navigator = { onLine: config.online !== false, clipboard: { async writeText(value) { if (config.clipboardFailure) throw new Error('synthetic clipboard denied'); clipboardWrites.push(value); } } };
  const fetch = async (path, request) => {
    calls.push({ path, request });
    if (path === '/api/booking/admission') return {ok:true,status:200,json:async()=>({nonce:'a'.repeat(64)})};
    if (path.endsWith('/status')) {
      if (config.statusFailure) throw new Error('synthetic offline');
      return { ok: true, status: 200, json: async () => ({ enabled: config.enabled }) };
    }
    if (path === '/api/booking/calendar') {
      assert.equal(request.method, 'POST');
      const query = JSON.parse(request.body);
      const { month } = query;
      const design = normalizeBookingDesign(query.designType, query.durationMinutes);
      assert(design, 'monthly requests include a canonical service and exact duration');
      const dates = calendarMonthDays(month, getBookingDateBounds({ now: FixedDate.now() })).filter(day => day && !day.disabled).map(day => day.date);
      const explicitlyClosed = [...config.closedDates, ...(config.closedByDesign[`${design.designType}:${design.durationMinutes}`] || [])];
      const closedDates = dates.filter(date => explicitlyClosed.includes(date) || !listBookingSlots(date, { now: FixedDate.now(), ...design, busyIntervals: config.busyIntervals }).some(slot => !config.blockedTimes.includes(slot.time)));
      if (config.holdMonth) await new Promise(resolve => monthReleases.push(resolve));
      if (config.monthFailures-- > 0) throw new Error('synthetic calendar offline');
      const result = { month, ...design, timeZone: 'Asia/Jakarta', minDate: dates[0], maxDate: dates.at(-1), closedDates };
      return { ok: true, status: 200, json: async () => config.monthResponse ? config.monthResponse(result) : result };
    }
    if (path === '/api/booking/availability') {
      assert.equal(request.method, 'POST');
      const query = JSON.parse(request.body);
      const date = query.date;
      const design = normalizeBookingDesign(query.designType, query.durationMinutes);
      const blocked = [...config.blockedTimes];
      const freeTimes = new Set(listBookingSlots(date, { now: FixedDate.now(), ...design, busyIntervals: config.busyIntervals }).map(slot => slot.time));
      if (config.holdAvailability) await new Promise(resolve => availabilityReleases.push(resolve));
      if (config.availabilityFailures-- > 0) throw new Error('synthetic availability offline');
      const slots = listBookingSlots(date, { now: FixedDate.now(), ...design, includeElapsed: true }).map(slot => ({ time: slot.time, available: freeTimes.has(slot.time) && !blocked.includes(slot.time) }));
      return { ok: true, status: 200, json: async () => ({ date, ...design, timeZone: 'Asia/Jakarta', slots }) };
    }
    if (config.hold) await new Promise(resolve => { release = resolve; });
    if (config.requestFailures-- > 0) return { ok: false, status: config.requestFailureStatus || 503, json: async () => ({ code: config.requestFailureCode || 'SYNTHETIC_UNAVAILABLE' }) };
    const payload = postPayload({request});
    assert.equal(Object.keys(request.headers).some(key=>key.toLowerCase()==='content-type'),false,'browser supplies multipart boundary');
    assert.equal(request.headers['X-Booking-Nonce'],'a'.repeat(64));
    const result = validateBooking(payload, { now: FixedDate.now() });
    assert.equal(result.valid, true, 'controller must send valid canonical input');
    const booking = { ...result.value, ...result.preview, id: 'synthetic-request', status: 'pending', hasPaymentProof: true };
    const data = {
      requestId: 'synthetic-request', status: 'pending',
      reviewUrl: config.reviewUrl || `https://chiinails.pages.dev/book/approve?r=${'a'.repeat(43)}`, booking,
    };
    return { ok: true, status: 201, json: async () => data };
  };
  const Option = function (text, value) { return { text, value, disabled: false }; };
  let month = getBookingDateBounds({ now: FixedDate.now() }).minDate.slice(0, 7);
  let lastCalendarValue = '';
  let onMonthChange;
  const calendar = {
    state: null, applications: [],
    refresh() {
      if (inputs.date.value !== lastCalendarValue) { month = (inputs.date.value || inputs.date.min).slice(0, 7); lastCalendarValue = inputs.date.value; }
    },
    getMonth: () => month,
    setAvailability(info) {
      if (info.month !== month) return false;
      this.state = info; this.applications.push(info); return true;
    },
    browse(value) { month = value; onMonthChange?.(month); },
    setInvalid() {}, focus() {},
  };
  const preparePaymentProof = async (file, { signal }) => {
    if (config.holdProof) await new Promise(resolve => proofReleases.push(resolve));
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (config.proofFailure) throw new PaymentProofError('PROOF_TYPE', 'Gunakan gambar JPEG, PNG, atau WebP.');
    const bytes = syntheticJpeg(file.syntheticBytes);
    const digest = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
    return { contentType: 'image/jpeg', digest, blob: new Blob([bytes], { type: 'image/jpeg' }) };
  };
  let challengeGeneration=0, rejectChallenge=null;
  const challenge = {
    async verify() {
      const generation=challengeGeneration;
      challengeCalls.push({action:'verify',generation});
      if(config.holdChallenge) await new Promise((resolve,reject)=>{challengeReleases.push(resolve);rejectChallenge=reject;});
      if(generation!==challengeGeneration)throw new DOMException('Aborted','AbortError');
      rejectChallenge=null;
      if(config.challengeFailure)throw new BookingChallengeError();
      return {nonce:'a'.repeat(64),token:`synthetic-token-${++challengeSequence}`};
    },
    cancel() {challengeCalls.push({action:'cancel',generation:challengeGeneration});challengeGeneration++;rejectChallenge?.(new DOMException('Aborted','AbortError'));rejectChallenge=null;},
  };
  vm.runInNewContext(source, {
    document, window, navigator, Intl, URL: TestURL, URLSearchParams, Date: FixedDate, Option, fetch, AbortController, DOMException, Uint8Array, Blob, FormData, PaymentProofError, preparePaymentProof, BookingChallengeError,
    BOOKING_DESIGNS, calculatePayment, getBookingDateBounds, listBookingSlots, normalizeBookingDesign, validateBooking, calendarMonthDays,
    createBookingDraft: options => createBookingDraft({ ...options, storage: config.storage || null, receiptStore: config.receiptStore || { async purge() {}, async put() {}, async get() {}, async remove() {} }, crypto: webcrypto, now: FixedDate.now }),
    createBookingCalendar: (root, input, options) => { onMonthChange = options?.onMonthChange; return calendar; },
    createBookingChallenge: () => challenge,
  });
  return {
    nodes, inputs, form, fieldsets, values, calls, redirects, window, document, config, calendar, monthReleases, availabilityReleases, copyButtons, clipboardWrites, proofReleases, challengeCalls, challengeReleases, objectUrls, revokedUrls, timeoutBudgets, intervals, navigator,
    tickRefresh() { [...intervals.values()].forEach(timer => timer.callback()); },
    visibility(value) { document.visibilityState = value; document.listeners.visibilitychange(); },
    release: () => release(),
    change(name, value) {
      inputs[name].value = value;
      inputs[name].listeners.change?.();
      form.listeners.input({ target: inputs[name] });
    },
    async fill() {
      for (const [name, value] of Object.entries({ name: 'Synthetic Customer', whatsapp: '081234567890', agreedPrice: '100000', paymentMode: 'deposit', deposit: '20000', serviceDuration: 'simple:120', date: '2026-10-21' })) this.change(name, value);
      await settle();
      this.change('time', '14:00');
      await this.uploadProof();
    },
    uploadProof(file = { size: 100, type: 'image/png', name: 'synthetic.png' }) { inputs.paymentProof.files = [file]; return inputs.paymentProof.listeners.change(); },
    submit: () => form.listeners.submit({ preventDefault() {} }),
    posts: () => calls.filter(call => call.path.endsWith('/requests')).map(postPayload),
  };
}

function draftStorage() {
  const values = new Map(); const images = new Map();
  return {
    values, images,
    storage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
    receiptStore: { async purge() {}, async put(value) { images.set(value.id, structuredClone(value)); }, async get(id) { return images.get(id); }, async remove(id) { images.delete(id); } },
  };
}
const recover = async () => { await settle(); await settle(); await settle(); };

test('reload restores the manual deposit, selected service, payment proof and requested time while fresh availability is pending', async () => {
  const saved = draftStorage();
  const original = harness(saved); await settle(); await original.fill();
  original.change('deposit', '35000');
  original.window.listeners.pagehide(); await recover();
  const next = harness({ ...saved, holdAvailability: true, holdMonth: true }); await recover();
  assert.equal(next.inputs.name.value, 'Synthetic Customer');
  assert.equal(next.inputs.whatsapp.value, '081234567890');
  assert.equal(next.inputs.serviceDuration.value, 'simple:120');
  assert.equal(next.inputs.deposit.value, '35000');
  assert.equal(next.inputs.date.value, '2026-10-21');
  assert.equal(next.inputs.time.value, '', 'a restored choice is not treated as checked availability');
  assert.equal(next.nodes['#booking-review'].disabled, true);
  assert.equal(next.nodes['#booking-proof-preview'].hidden, false);
  assert.match(next.nodes['#booking-proof-status'].textContent, /dipulihkan/);
  assert.equal(next.posts().length, 0); assert.equal(next.redirects.length, 0);
  next.monthReleases.forEach(release => release()); next.availabilityReleases.forEach(release => release());
  await recover();
  assert.equal(next.inputs.time.value, '14:00');
  assert.equal(next.nodes['#booking-review'].disabled, false);
});

test('an ambiguous failed upload survives reload with identical proof and retry key until explicit Book', async () => {
  const saved = draftStorage();
  const original = harness({ ...saved, requestFailures: 1 }); await settle(); await original.fill();
  original.change('deposit', '35000'); await original.submit();
  original.window.listeners.pagehide(); await recover();
  const before = original.posts()[0];
  const next = harness(saved); await recover();
  assert.equal(next.posts().length, 0); assert.equal(next.redirects.length, 0);
  await next.submit();
  const after = next.posts()[0];
  assert.equal(after.idempotencyKey, before.idempotencyKey);
  assert.deepEqual(await proofBytes(after), await proofBytes(before));
  assert.equal(after.deposit, '35000');
  assert.equal(next.redirects.length, 1);
  assert.equal(saved.values.size, 0, 'validated acknowledgement clears text and retry metadata');
  await recover(); assert.equal(saved.images.size, 0, 'acknowledgement clears the temporary receipt');
});

test('BFCache return restarts a held receipt restore and ignores the stale departed callback', async () => {
  const saved = draftStorage(); const original = harness(saved); await settle(); await original.fill();
  original.window.listeners.pagehide(); await recover();
  const releases = [];
  const next = harness({ ...saved, receiptStore: { ...saved.receiptStore, get: async id => { await new Promise(resolve => releases.push(resolve)); return saved.images.get(id); } } });
  await recover();
  assert.equal(releases.length, 1);
  assert.match(next.nodes['#booking-proof-status'].textContent, /Memulihkan bukti/);
  next.window.listeners.pagehide();
  next.window.listeners.pageshow({ persisted: true }); await recover();
  assert.equal(releases.length, 2, 'a fresh restore begins after the previous callback was invalidated');
  releases[0](); await recover();
  assert.equal(next.nodes['#booking-proof-preview'].hidden, true, 'stale callback cannot complete the new restore');
  assert.equal(next.nodes['#booking-review'].disabled, true);
  releases[1](); await recover();
  assert.equal(next.nodes['#booking-proof-preview'].hidden, false);
  assert.match(next.nodes['#booking-proof-status'].textContent, /dipulihkan dan siap/);
  assert.equal(next.nodes['#booking-review'].disabled, false);
  assert.equal(next.inputs.time.value, '14:00');
  assert.equal(next.posts().length, 0); assert.equal(next.redirects.length, 0);
});

test('temporary availability failure during reload preserves the lost-ack identity across a second reload', async () => {
  const saved = draftStorage(); const original = harness({ ...saved, requestFailures: 1 });
  await settle(); await original.fill(); await original.submit();
  const first = original.posts()[0];
  original.window.listeners.pagehide(); await recover();
  const unavailable = harness({ ...saved, availabilityFailures: 1 }); await recover();
  assert.equal(unavailable.nodes['#booking-review'].disabled, true);
  assert.equal(unavailable.posts().length, 0);
  assert.equal(JSON.parse([...saved.values.values()][0]).requestKey, first.idempotencyKey);
  unavailable.window.listeners.pagehide(); await recover();
  const recovered = harness(saved); await recover();
  assert.equal(recovered.inputs.time.value, '14:00');
  assert.equal(recovered.nodes['#booking-review'].disabled, false);
  assert.equal(recovered.posts().length, 0);
  await recovered.submit();
  assert.equal(recovered.posts()[0].idempotencyKey, first.idempotencyKey);
  assert.deepEqual(await proofBytes(recovered.posts()[0]), await proofBytes(first));
});

test('a newly occupied restored time is removed after revalidation without changing customer details or submitting', async () => {
  const saved = draftStorage(); const original = harness(saved); await settle(); await original.fill();
  original.window.listeners.pagehide(); await recover();
  const next = harness({ ...saved, blockedTimes: ['14:00'] }); await recover();
  assert.equal(next.inputs.name.value, 'Synthetic Customer');
  assert.equal(next.inputs.date.value, '2026-10-21');
  assert.equal(next.inputs.time.value, '');
  assert.equal(next.nodes['#booking-proof-preview'].hidden, false);
  assert.equal(next.nodes['#booking-review'].disabled, true);
  assert.equal(next.posts().length, 0);
});

test('offline pauses refresh and retains inputs; reconnect checks fresh slots without sending a request', async () => {
  const saved = draftStorage(); const page = harness(saved); await settle(); await page.fill();
  page.navigator.onLine = false; page.window.listeners.offline();
  const before = page.calls.length;
  assert.equal(page.intervals.size, 0);
  assert.equal(page.nodes['#booking-review'].disabled, true);
  page.tickRefresh(); page.visibility('hidden'); page.visibility('visible');
  page.change('name', 'Synthetic offline edit');
  page.change('date', '2026-10-22'); await recover();
  await page.submit();
  assert.equal(page.calls.length, before);
  assert.equal(page.inputs.name.value, 'Synthetic offline edit');
  assert.equal(page.nodes['#booking-proof-preview'].hidden, false);
  assert.match(page.nodes['#booking-slot-status'].textContent, /14.00 WIB dipertahankan/);
  page.navigator.onLine = true; page.window.listeners.online(); await recover();
  assert.equal(page.inputs.date.value, '2026-10-22');
  assert.equal(page.inputs.time.value, '14:00');
  assert.equal(page.nodes['#booking-review'].disabled, false);
  assert.equal(page.posts().length, 0); assert.equal(page.redirects.length, 0);
  assert.equal(page.intervals.size, 1);
});

test('a tab restored offline keeps its intended time and proof until the connection returns', async () => {
  const saved = draftStorage(); const original = harness(saved); await settle(); await original.fill();
  original.window.listeners.pagehide(); await recover();
  const next = harness({ ...saved, online: false }); await recover();
  assert.equal(next.calls.length, 0);
  assert.equal(next.inputs.name.value, 'Synthetic Customer');
  assert.equal(next.nodes['#booking-proof-preview'].hidden, false);
  assert.equal(next.nodes['#booking-review'].disabled, true);
  next.navigator.onLine = true; next.window.listeners.online(); await recover();
  assert.equal(next.inputs.time.value, '14:00');
  assert.equal(next.nodes['#booking-review'].disabled, false);
  assert.equal(next.posts().length, 0);
});

test('reconnection during receipt preparation waits for completion before refreshing availability', async () => {
  const saved = draftStorage(); const page = harness(saved); await settle(); await page.fill();
  page.config.holdProof = true;
  const preparing = page.uploadProof(); await settle();
  page.navigator.onLine = false; page.window.listeners.offline();
  const before = page.calls.length;
  page.navigator.onLine = true; page.window.listeners.online(); await settle();
  assert.equal(page.calls.length, before, 'no network refresh competes with image preparation');
  page.proofReleases[0](); await preparing; await recover();
  assert(page.calls.slice(before).some(call => call.path === '/api/booking/status'));
  assert(page.calls.slice(before).some(call => call.path === '/api/booking/calendar'));
  assert(page.calls.slice(before).some(call => call.path === '/api/booking/availability'));
  assert.equal(page.inputs.time.value, '14:00');
  assert.equal(page.nodes['#booking-review'].disabled, false);
  assert.equal(page.posts().length, 0);
});

test('explicit clear removes draft, proof and fields and never posts or opens WhatsApp', async () => {
  const saved = draftStorage(); const page = harness(saved); await settle(); await page.fill(); await recover();
  page.nodes['#booking-draft-clear'].listeners.click(); await recover();
  for (const name of ['name', 'whatsapp', 'agreedPrice', 'deposit', 'date', 'time']) assert.equal(page.inputs[name].value, '', name);
  assert.equal(page.nodes['#booking-proof-preview'].hidden, true);
  assert.equal(saved.values.size, 0); assert.equal(saved.images.size, 0);
  assert.equal(page.inputs.name.focused, true);
  assert.equal(page.posts().length, 0); assert.equal(page.redirects.length, 0);
});

test('receipt storage failure warns about reload recovery while keeping the current form usable', async () => {
  const saved = draftStorage(); saved.receiptStore.put = async () => { throw new Error('quota'); };
  const page = harness(saved); await settle(); await page.fill(); await recover();
  assert.equal(page.nodes['#booking-review'].disabled, false);
  assert.match(page.nodes['#booking-draft-status'].textContent, /Bukti belum tersimpan/);
  await page.submit(); assert.equal(page.redirects.length, 1);
});

test('storage metadata never contains an approval link or credentials, including malformed server acknowledgements', async () => {
  const saved = draftStorage(); const page = harness({ ...saved, reviewUrl: 'https://outside.invalid/book/approve?r=private' });
  await settle(); await page.fill(); await page.submit();
  assert.equal(page.redirects.length, 0);
  assert(saved.values.size > 0, 'an unvalidated response must retain recovery data');
  const raw = [...saved.values.values()].join('');
  assert.doesNotMatch(raw, /outside.invalid|book\/approve|authorization|accessToken|synthetic.png/);
});

test('Book requires every editable field, including an explicitly entered deposit', async () => {
  const page = harness(); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  assert.equal(page.inputs.time.options[0].text, 'Pilih tanggal terlebih dahulu');
  assert.equal(page.inputs.time.hidden, false);
  await page.fill();
  assert.equal(page.nodes['#booking-review'].disabled, false);
  assert.equal(page.inputs.deposit.value, '20000');
  assert.equal(page.inputs.deposit.readOnly, false);
  for (const name of ['name', 'whatsapp', 'agreedPrice', 'deposit', 'serviceDuration', 'date', 'time']) {
    await page.fill(); page.change(name, '');
    assert.equal(page.nodes['#booking-review'].disabled, true, `${name} is required`);
    await page.submit();
    assert.equal(page.posts().length, 0, `${name} cannot be bypassed with a submit event`);
  }
});

test('a manual deposit below Rp20.000, above the total or malformed cannot enable Book or post', async () => {
  const page = harness(); await settle(); await page.fill();
  for (const amount of ['', '19999', '100001', '1e5', '-20000', '20000.5']) {
    page.change('deposit', amount);
    page.form.listeners.focusout({ target: page.inputs.deposit });
    assert.equal(page.nodes['#booking-review'].disabled, true, amount);
    assert.equal(page.nodes['#error-deposit'].hidden, false, amount);
    await page.submit();
    assert.equal(page.posts().length, 0, amount);
  }
});

test('the customer may enter Rp20.000 for a million-rupiah quote without a percentage calculation', async () => {
  const page = harness(); await settle(); await page.fill();
  page.change('agreedPrice', '1000000');
  page.change('deposit', '20000');
  assert.equal(page.inputs.deposit.value, '20000');
  assert.equal(page.nodes['#booking-review'].disabled, false);
  await page.submit();
  assert.equal(page.posts()[0].agreedPrice, '1000000');
  assert.equal(page.posts()[0].deposit, '20000');
  assert.match(page.values.remainingBalance.textContent, /980\.000/);
  assert.doesNotMatch(new URL(page.redirects[0]).searchParams.get('text'), /10\s*%/);
});

test('a declared deposit may equal the total and leaves no remaining balance', async () => {
  const page = harness(); await settle(); await page.fill();
  page.change('deposit', '100000');
  assert.equal(page.nodes['#booking-review'].disabled, false);
  await page.submit();
  assert.equal(page.posts()[0].deposit, '100000');
  assert.match(page.values.remainingBalance.textContent, /^Rp.?0$/);
});

test('the current customer form and payment hints do not advertise a percentage DP', async () => {
  const markup = readFileSync(new URL('../src/pages/book.astro', import.meta.url), 'utf8');
  assert.doesNotMatch(markup, /10\s*%/);
  const page = harness(); await settle(); await page.fill();
  assert.doesNotMatch(page.nodes['#hint-deposit'].textContent, /10\s*%/);
  assert.doesNotMatch(page.nodes['#booking-payment-summary-label'].textContent, /10\s*%/);
});

test('invalid phone, price and unavailable time cannot enable Book', async () => {
  const page = harness(); await settle();
  for (const [name, value] of [['whatsapp', 'abc'], ['agreedPrice', '1e5'], ['time', '15:00'], ['time', '09:00'], ['paymentMode', 'invalid']]) {
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
  assert.deepEqual(Object.keys(payload).sort(), ['agreedPrice', 'date', 'deposit', 'designType', 'durationMinutes', 'idempotencyKey', 'name', 'paymentMode', 'proof', 'time', 'turnstileToken', 'whatsapp']);
  assert.equal(payload.whatsapp, '6281234567890');
  assert.equal(payload.agreedPrice, '100000');
  assert.equal(payload.paymentMode, 'deposit');
  assert.equal(payload.deposit, '20000');
  assert.equal(payload.designType, 'simple');
  assert.equal(payload.durationMinutes, '120');
  assert.deepEqual(Object.keys(payload.proof).sort(), ['blob', 'contentType']);
  assert.equal(payload.proof.blob.name,'receipt.jpg');
  assert.match(payload.turnstileToken,/^synthetic-token-\d+$/);
  assert.deepEqual(await proofBytes(payload),syntheticJpeg());
  assert.equal(JSON.parse(page.calls.find(call=>call.path.endsWith('/requests')).request.body.get('booking')).proof,undefined);
  assert.match(payload.idempotencyKey, /^[a-f0-9]{64}$/);
  const message = new URL(page.redirects[0]).searchParams.get('text');
  assert.match(message, /\/book\/approve\?r=[A-Za-z0-9_-]{43}/);
  assert.match(message, /Booking menunggu konfirmasi Chii/);
  assert.equal(page.nodes['#booking-review-panel'].hidden, false);
  assert.equal(page.nodes['#booking-whatsapp-link'].href, page.redirects[0]);
});

test('disabled booking cannot submit through the WhatsApp preview', async () => {
  const page = harness({ enabled: false }); await settle(); await page.fill(); await page.submit();
  assert.equal(page.posts().length, 0); assert.equal(page.redirects.length, 0);
  assert.equal(page.nodes['#booking-review'].disabled, true);
});
test('a complete booking submits without an invitation or calculator reference', async () => {
  const page=harness(); await settle(); await page.fill(); await page.submit();
  assert.equal(page.posts().length,1); assert.equal(page.redirects.length,1);
  assert.equal(page.posts()[0].bookingCode,undefined);
  assert(!page.calls.some(call=>call.path==='/api/booking/access'));
  assert(page.challengeCalls.length>0);
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
  assert.notEqual(page.posts()[0].turnstileToken,page.posts()[1].turnstileToken,'fresh challenge tokens stay outside immutable request identity');
});

test('changing the quote creates a new key while preserving the manually entered DP', async () => {
  const page = harness({ requestFailures: 1 }); await settle(); await page.fill(); await page.submit();
  page.change('agreedPrice', '250000'); await page.submit();
  assert.notEqual(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
  assert.equal(page.inputs.deposit.value, '20000');
  assert.equal(page.posts()[1].deposit, '20000');
});

test('changing only the manual deposit creates a new key and an unchanged deposit retries with that key', async () => {
  const page = harness({ requestFailures: 2 }); await settle(); await page.fill(); await page.submit();
  page.change('deposit', '35000'); await page.submit();
  assert.notEqual(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
  assert.equal(page.posts()[1].deposit, '35000');
  await page.submit();
  assert.equal(page.posts()[2].idempotencyKey, page.posts()[1].idempotencyKey);
  assert.equal(page.posts()[2].deposit, '35000');
});

test('equivalent digit-only deposit values keep the canonical retry key', async () => {
  const page = harness({ requestFailures: 1 }); await settle(); await page.fill(); await page.submit();
  page.change('deposit', '020000'); await page.submit();
  assert.equal(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
  assert.equal(page.posts()[1].deposit, '20000');
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
  assert.equal(page.inputs.deposit.readOnly, true);
  assert.equal(page.nodes['#booking-payment-amount-label'].textContent, 'Full payment');
  await page.submit();
  assert.equal(page.posts()[1].paymentMode, 'full');
  assert.equal(page.posts()[1].deposit, '100000');
  assert.notEqual(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
  assert.match(new URL(page.redirects[0]).searchParams.get('text'), /Full payment: Rp.?100\.000/);
  assert.match(new URL(page.redirects[0]).searchParams.get('text'), /Sisa pembayaran: Rp.?0/);
  assert.match(page.values.remainingBalance.textContent, /0/);
});

test('switching from manual DP to Full payment and back restores the typed DP', async () => {
  const page = harness(); await settle(); await page.fill();
  page.change('deposit', '35000');
  page.change('paymentMode', 'full');
  assert.equal(page.inputs.deposit.value, '100000');
  assert.equal(page.inputs.deposit.readOnly, true);
  page.change('agreedPrice', '150000');
  assert.equal(page.inputs.deposit.value, '150000');
  page.change('paymentMode', 'deposit');
  assert.equal(page.inputs.deposit.value, '35000');
  assert.equal(page.inputs.deposit.readOnly, false);
  assert.equal(page.nodes['#booking-review'].disabled, false);
  await page.submit();
  assert.equal(page.posts()[0].deposit, '35000');
});

test('low totals cap payment at the total and normalize full, while a later higher total restores DP', async () => {
  for (const amount of ['15000', '20000']) {
    const page = harness(); await settle(); await page.fill(); page.change('agreedPrice', amount);
    assert.equal(page.inputs.paymentMode.value, 'full');
    assert.equal(page.inputs.paymentMode.options[0].disabled, true);
    assert.equal(page.inputs.deposit.value, amount);
    assert.equal(page.inputs.deposit.readOnly, true);
    await page.submit();
    assert.equal(page.posts()[0].paymentMode, 'full');
    assert.match(page.values.remainingBalance.textContent, /0/);
    page.nodes['#booking-edit'].listeners.click();
    page.change('agreedPrice', '100000');
    assert.equal(page.inputs.paymentMode.value, 'deposit');
    assert.equal(page.inputs.deposit.value, '20000');
    assert.equal(page.inputs.deposit.readOnly, false);
    assert.equal(page.inputs.paymentMode.options[0].disabled, false);
  }
});

test('each combined service choice reaches the unchanged API and WhatsApp with its actual interval', async () => {
  for (const [designType, durationMinutes, starts] of [
    ['plain', 60, ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00']],
    ['gel', 60, ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00']],
    ['removal', 60, ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00']],
    ['simple', 60, ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00']],
    ['simple', 120, ['08:00', '10:00', '12:00', '14:00']],
    ['full-art', 180, ['08:00', '11:00']],
    ['full-art', 240, ['08:00', '12:00']],
    ['full-art', 300, ['08:00']],
  ]) {
    const page = harness(); await settle(); await page.fill();
    page.change('serviceDuration', `${designType}:${durationMinutes}`);
    await settle();
    assert.deepEqual(page.inputs.time.options.filter(option => option.value).map(option => option.value), starts);
    const time = starts.at(-1);
    const option = page.inputs.time.options.find(node => node.value === time);
    assert.equal(option.disabled, false);
    assert.match(option.text, /WIB/);
    page.change('time', time);
    assert.equal(page.inputs.time.value, time);
    assert.equal(page.inputs.time.hidden, false);
    await page.submit();
    assert.equal(page.posts()[0].designType, designType);
    assert.equal(page.posts()[0].durationMinutes, String(durationMinutes));
    assert.equal(Object.hasOwn(page.posts()[0], 'serviceDuration'), false);
    const availability = JSON.parse(page.calls.filter(call => call.path === '/api/booking/availability').at(-1).request.body);
    assert.equal(availability.designType, designType);
    assert.equal(availability.durationMinutes, String(durationMinutes));
    assert.equal(Object.hasOwn(availability, 'serviceDuration'), false);
    assert.match(new URL(page.redirects[0]).searchParams.get('text'), new RegExp(`Durasi: ${durationMinutes / 60} jam`));
    const label = { plain: 'Plain', gel: 'Gel', removal: 'Removal', simple: 'Simple Design', 'full-art': 'Full Art' }[designType];
    assert.match(new URL(page.redirects[0]).searchParams.get('text'), new RegExp(`Desain: ${label}(?:\\n|$)`));
    assert.equal(page.nodes['#booking-duration-summary-label'].textContent, `Waktu · ${durationMinutes / 60} jam`);
  }
});

test('invalid combined choices cannot fall back to a default design, check availability or submit', async () => {
  const page = harness(); await settle(); await page.fill();
  for (const choice of ['', 'simple:180', 'plain:120', 'plain:60:extra', 'full-art:3', 'full-art:180.0', 'constructor:120', 'simple:120\n']) {
    const checks = page.calls.filter(call => call.path === '/api/booking/availability').length;
    page.change('serviceDuration', choice); await settle();
    assert.equal(page.nodes['#booking-review'].disabled, true, choice);
    assert.equal(page.inputs.time.value, '');
    assert.equal(page.inputs.time.options[0].text, 'Pilih layanan terlebih dahulu');
    assert.equal(page.calls.filter(call => call.path === '/api/booking/availability').length, checks, choice);
    await page.submit();
    assert.equal(page.nodes['#error-serviceDuration'].hidden, false, choice);
    assert.equal(page.inputs.serviceDuration.attrs['aria-invalid'], 'true', choice);
    assert.equal(page.posts().length, 0, choice);
    assert.equal(page.redirects.length, 0, choice);
  }
  const errorLink = page.nodes['#booking-errors'].querySelector().children.find(item => item.children[0]?.href === '#booking-serviceDuration').children[0];
  errorLink.listeners.click({ preventDefault() {} });
  assert.equal(page.inputs.serviceDuration.focused, true);
});

test('service changes update the duration hint and remove a start that no longer fits', async () => {
  const page = harness(); await settle(); await page.fill();
  page.change('serviceDuration', 'full-art:300');
  assert.equal(page.nodes['#booking-review'].disabled, true);
  await settle();
  assert.equal(page.inputs.time.value, '');
  assert.equal(page.inputs.time.options.some(option => option.value === '14:00'), false);
  assert.deepEqual(page.inputs.time.options.filter(option => option.value).map(option => option.value), ['08:00']);
  assert.match(page.inputs.time.options.find(option => option.value === '08:00').text, /08\.00–13\.00 WIB/);
  assert.match(page.nodes['#hint-serviceDuration'].textContent, /Last book 12:00/);
  page.change('serviceDuration', 'plain:60'); await settle();
  assert.match(page.nodes['#hint-serviceDuration'].textContent, /Plain.*1 jam/);
  for (const service of ['gel', 'removal']) {
    page.change('serviceDuration', `${service}:60`); await settle();
    assert.match(page.nodes['#hint-serviceDuration'].textContent, new RegExp(`${service === 'gel' ? 'Gel' : 'Removal'}.*1 jam`));
  }
  page.change('serviceDuration', 'simple:60'); await settle();
  assert.match(page.nodes['#hint-serviceDuration'].textContent, /slot 1 jam/);
});

test('rapid combined service changes abort the old duration check before enabling the latest choice', async () => {
  const page = harness(); await settle(); await page.fill(); page.config.holdAvailability = true;
  page.change('serviceDuration', 'full-art:300'); await settle();
  page.change('serviceDuration', 'plain:60'); await settle();
  const checks = page.calls.filter(call => call.path === '/api/booking/availability');
  assert.equal(checks.at(-2).request.signal.aborted, true);
  assert.deepEqual(JSON.parse(checks.at(-1).request.body), { date: '2026-10-21', designType: 'plain', durationMinutes: '60' });
  page.availabilityReleases[0](); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  page.availabilityReleases[1](); await settle();
  assert.equal(page.inputs.serviceDuration.value, 'plain:60');
  assert.equal(page.inputs.time.value, '14:00');
  assert.equal(page.nodes['#booking-review'].disabled, false);
  assert.match(page.inputs.time.options.find(option => option.value === '14:00').text, /14\.00–15\.00 WIB/);
});

test('weekend native choices follow each agreed duration and finish before noon', async () => {
  for (const [designType, duration, starts] of [
    ['plain', 60, ['08:00', '09:00', '10:00']],
    ['simple', 60, ['08:00', '09:00', '10:00']],
    ['simple', 120, ['08:00', '10:00']],
    ['full-art', 180, ['08:00']],
    ['full-art', 240, ['08:00']],
    ['full-art', 300, []],
  ]) {
    const page = harness(); await settle(); await page.fill();
    page.change('serviceDuration', `${designType}:${duration}`); page.change('date', '2026-10-24');
    await settle();
    const available = page.inputs.time.options.filter(option => option.value && !option.disabled);
    assert.deepEqual(available.map(option => option.value), starts);
    if (starts.length === 0) {
      assert.equal(page.nodes['#booking-review'].disabled, true);
      assert.equal(page.inputs.time.options[0].text, 'Tidak ada jam untuk pilihan ini');
      assert.match(page.nodes['#booking-slot-status'].textContent, /tidak muat/);
    }
  }
});

test('busy starts are absent from the time dropdown and forged selections cannot submit', async () => {
  const page = harness({ blockedTimes: ['10:00'] }); await settle(); await page.fill();
  const blocked = page.inputs.time.options.find(option => option.value === '10:00');
  assert.equal(blocked, undefined);
  assert.equal(page.inputs.time.options.find(option => option.value === '12:00').disabled, false, 'a start at the end of the blocked 10:00–12:00 interval remains available');
  assert.equal(page.inputs.time.value, '14:00');
  assert.equal(page.nodes['#booking-review'].disabled, false);
  page.change('time', '10:00');
  assert.equal(page.nodes['#booking-review'].disabled, true);
  await page.submit();
  assert.equal(page.posts().length, 0);
  assert.equal(page.redirects.length, 0);
});

test('availability loading or failure blocks Book and an explicit retry restores the retained choice', async () => {
  const page = harness(); await settle(); await page.fill();
  page.config.holdAvailability = true; page.config.availabilityFailures = 1;
  page.change('date', '2026-10-22'); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  assert.equal(page.inputs.time.attrs['aria-busy'], 'true');
  assert.deepEqual(page.inputs.time.options.filter(option => option.value), [], 'loading does not show unverified starts');
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
  page.change('serviceDuration', 'plain:60'); await settle(); page.change('time', '14:00'); await page.submit();
  assert.notEqual(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
  assert.equal(page.posts()[1].designType, 'plain');
  assert.equal(page.posts()[1].durationMinutes, '60');
  assert.equal(page.values.design.textContent, 'Plain');
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

test('Book requires prepared proof and removing it clears the preview and immediately disables submission', async () => {
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
  await page.submit();
  assert.equal(page.posts().length, 0, 'a failed proof cannot be bypassed with a submit event');
  page.config.proofFailure = false; page.config.holdProof = true;
  const pending = page.uploadProof(); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, true);
  await page.submit();
  assert.equal(page.posts().length, 0, 'proof preparation must finish before any request');
  page.nodes['#booking-proof-remove'].listeners.click();
  page.proofReleases[0](); await pending;
  assert.equal(page.nodes['#booking-proof-preview'].hidden, true);
  assert.equal(page.nodes['#booking-review'].disabled, true);
  await page.submit();
  assert.equal(page.posts().length, 0, 'a removed proof cannot be restored by stale compression');
});

test('all text fields and fresh availability cannot enable Book before the first proof upload', async () => {
  const page = harness(); await settle();
  for (const [name, value] of Object.entries({ name: 'Synthetic Customer', whatsapp: '081234567890', agreedPrice: '100000', paymentMode: 'deposit', deposit: '20000', serviceDuration: 'simple:120', date: '2026-10-21' })) page.change(name, value);
  await settle(); page.change('time', '14:00');
  assert.equal(page.nodes['#booking-review'].disabled, true);
  await page.submit();
  assert.equal(page.posts().length, 0);
  await page.uploadProof();
  assert.equal(page.nodes['#booking-review'].disabled, false);
});

test('changed compressed proof creates a new request identity without putting image bytes in WhatsApp', async () => {
  const page = harness({ requestFailures: 1 }); await settle(); await page.fill(); await page.submit();
  await page.uploadProof({ size: 100, type: 'image/png', name: 'never-send-this-name.png', syntheticBytes: 'different image' });
  await page.submit();
  assert.notEqual(page.posts()[0].idempotencyKey, page.posts()[1].idempotencyKey);
  assert.equal(page.posts()[1].proof.contentType, 'image/jpeg');
  assert.deepEqual(await proofBytes(page.posts()[1]),syntheticJpeg('different image'));
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
  assert.equal(page.inputs.time.options.find(option => option.value === '14:00'), undefined);
  assert.equal(page.nodes['#booking-proof-preview'].hidden, false);
  assert.equal(page.nodes['#booking-review'].disabled, true);
});

test('receipt submission has a longer bounded upload budget while status and availability stay short', async () => {
  const page = harness({ hold: true }); await settle(); await page.fill();
  assert(page.timeoutBudgets.length > 0);
  assert(page.timeoutBudgets.filter(milliseconds => milliseconds !== 200).every(milliseconds => milliseconds === 12000));
  const pending = page.submit(); await settle();
  assert.equal(page.timeoutBudgets.at(-1), 120000);
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

test('visible refresh restores cancelled slots while preserving the selected value and native control focus', async () => {
  const page = harness({ blockedTimes: ['10:00'] }); await settle(); await page.fill();
  assert.equal(page.intervals.size, 1);
  assert.equal([...page.intervals.values()][0].milliseconds, 45000);
  const released = page.inputs.time.options.find(option => option.value === '10:00');
  page.inputs.time.focus();
  assert.equal(released, undefined);
  page.config.blockedTimes = [];
  page.tickRefresh();
  assert.equal(page.inputs.time.value, '14:00');
  assert.equal(page.nodes['#booking-review'].disabled, false);
  await settle();
  assert.equal(page.inputs.time.focused, true);
  assert.equal(page.inputs.time.options.find(option => option.value === '10:00').disabled, false);
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
  assert.equal(page.inputs.time.options.find(option => option.value === '14:00').disabled, false);
});

test('hidden page stops refresh and becoming visible checks again without duplicating its timer', async () => {
  const page = harness(); await settle(); await page.fill();
  const before = page.calls.length;
  page.visibility('hidden');
  assert.equal(page.intervals.size, 0);
  page.tickRefresh(); await settle();
  assert.equal(page.calls.length, before);
  page.visibility('visible'); await settle();
  assert.equal(page.calls.length, before + 2, 'returning checks one month summary and the selected day');
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
  const page = harness(); await settle(); await page.fill(); page.config.holdAvailability = true; page.config.holdMonth = true;
  page.tickRefresh(); await settle();
  const once = page.calls.length;
  page.tickRefresh(); assert.equal(page.calls.length, once);
  page.change('date', '2026-10-22'); await settle();
  const checks = page.calls.filter(call => call.path === '/api/booking/availability');
  assert.equal(checks.at(-2).request.signal.aborted, true);
  page.monthReleases[0](); await settle();
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

test('calendar reads one clipped summary per service and duration, and reuses an unchanged choice', async () => {
  const page = harness({ closedDates: ['2026-10-19', '2026-10-24', '2026-11-01'] }); await settle();
  const checks = () => page.calls.filter(call => call.path === '/api/booking/calendar');
  assert.equal(checks().length, 1);
  assert.equal(page.calls.filter(call => call.path === '/api/booking/availability').length, 0, 'a month does not fan out into daily requests');
  const call = checks()[0];
  assert.equal(call.request.method, 'POST');
  assert.equal(call.request.credentials, 'same-origin');
  assert.equal(call.request.cache, 'no-store');
  assert.equal(call.request.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(call.request.body), { month: '2026-10', designType: 'simple', durationMinutes: '120' });
  assert.equal(page.calendar.state.status, 'ready');
  assert.deepEqual([...page.calendar.state.closedDates], ['2026-10-20', '2026-10-24']);
  for (const choice of ['plain:60', 'gel:60', 'removal:60', 'simple:60', 'simple:120', 'full-art:180', 'full-art:240', 'full-art:300']) {
    page.change('serviceDuration', choice); await settle();
  }
  assert.equal(checks().length, 8, 'each exact service has one cached monthly summary');
  for (const check of checks()) {
    const query = JSON.parse(check.request.body);
    assert.deepEqual(Object.keys(query).sort(), ['designType', 'durationMinutes', 'month']);
    assert.equal(typeof query.durationMinutes, 'string');
  }
  page.change('serviceDuration', 'simple:120'); await settle();
  page.change('serviceDuration', 'simple:120'); await settle();
  assert.equal(checks().length, 8, 'returning to a fresh same-choice summary does not refetch it');
});

test('pending month summary keeps Book disabled even when selected-day availability and proof are ready', async () => {
  const page = harness({ holdMonth: true }); await settle(); await page.fill();
  assert.equal(page.monthReleases.length, 1, 'field changes share the active monthly request');
  assert.equal(page.calendar.state.status, 'loading');
  assert.equal(page.nodes['#booking-review'].disabled, true);
  await page.submit();
  assert.equal(page.posts().length, 0);
  assert.match(page.nodes['#error-date'].textContent, /selesai diperiksa/);
  page.monthReleases[0](); await settle();
  assert.equal(page.calendar.state.status, 'ready');
  assert.equal(page.nodes['#booking-review'].disabled, false);
});

test('failed month refresh fails closed and explicit retry restores retained customer details', async () => {
  const page = harness(); await settle(); await page.fill();
  page.config.monthFailures = 1;
  page.nodes['#booking-calendar-retry'].listeners.click(); await settle();
  assert.equal(page.calendar.state.status, 'error');
  assert.equal(page.nodes['#booking-calendar-retry'].hidden, false);
  assert.equal(page.nodes['#booking-review'].disabled, true);
  assert.equal(page.inputs.name.value, 'Synthetic Customer');
  assert.equal(page.inputs.time.value, '14:00');
  assert.equal(page.inputs.paymentProof.files.length, 1);
  page.nodes['#booking-calendar-retry'].listeners.click(); await settle();
  assert.equal(page.calendar.state.status, 'ready');
  assert.equal(page.nodes['#booking-calendar-retry'].hidden, true);
  assert.equal(page.nodes['#booking-review'].disabled, false);
});

test('month navigation aborts older summaries and late responses cannot replace the displayed month', async () => {
  const page = harness({ holdMonth: true, closedDates: ['2026-10-24'] }); await settle();
  const october = page.calls.find(call => call.path === '/api/booking/calendar');
  page.config.closedDates = ['2026-11-05'];
  page.calendar.browse('2026-11'); await settle();
  assert.equal(october.request.signal.aborted, true);
  assert.equal(page.calendar.state.month, '2026-11');
  assert.equal(page.calendar.state.status, 'loading');
  page.monthReleases[0](); await settle();
  assert.equal(page.calendar.state.month, '2026-11');
  assert.equal(page.calendar.state.status, 'loading');
  page.monthReleases[1](); await settle();
  assert.equal(page.calendar.state.status, 'ready');
  assert.deepEqual([...page.calendar.state.closedDates], ['2026-11-05']);
});

test('malformed month summaries cannot imply availability or enable Book', async () => {
  const page = harness(); await settle(); await page.fill();
  const mutations = [
    result => ({ ...result, month: '2026-11' }),
    result => ({ ...result, timeZone: 'UTC' }),
    result => ({ ...result, designType: 'plain' }),
    result => ({ ...result, durationMinutes: 60 }),
    result => ({ ...result, durationMinutes: '120' }),
    result => ({ ...result, minDate: '2026-10-01' }),
    result => ({ ...result, maxDate: '2026-11-01' }),
    result => ({ ...result, closedDates: ['2026-10-24', '2026-10-24'] }),
    result => ({ ...result, closedDates: ['2026-10-25', '2026-10-24'] }),
    result => ({ ...result, closedDates: ['2026-10-19'] }),
    result => ({ ...result, closedDates: [24] }),
    result => ({ ...result, closedDates: null }),
    result => ({ ...result, events: [] }),
  ];
  for (const mutate of mutations) {
    page.config.monthResponse = mutate;
    page.nodes['#booking-calendar-retry'].listeners.click(); await settle();
    assert.equal(page.calendar.state.status, 'error');
    assert.equal(page.nodes['#booking-review'].disabled, true);
    assert.equal(page.inputs.time.value, '14:00');
  }
  page.config.monthResponse = null;
  page.nodes['#booking-calendar-retry'].listeners.click(); await settle();
  assert.equal(page.nodes['#booking-review'].disabled, false);
});

test('a new full-day block clears selected time and removal reopens the date without silently choosing a time', async () => {
  const page = harness(); await settle(); await page.fill();
  page.config.closedDates = ['2026-10-21'];
  page.tickRefresh(); await settle();
  assert.equal(page.calendar.state.closedDates.includes('2026-10-21'), true);
  assert.equal(page.inputs.date.value, '2026-10-21');
  assert.equal(page.inputs.time.value, '');
  assert.equal(page.nodes['#booking-review'].disabled, true);
  page.config.closedDates = [];
  page.tickRefresh(); await settle();
  assert.equal(page.calendar.state.closedDates.includes('2026-10-21'), false);
  assert.equal(page.inputs.time.value, '');
  page.change('time', '14:00');
  assert.equal(page.nodes['#booking-review'].disabled, false);
});

test('a forged selected time cannot bypass a trusted closed-day summary', async () => {
  const page = harness(); await settle(); await page.fill();
  page.config.closedDates = ['2026-10-21'];
  page.tickRefresh(); await settle();
  page.change('time', '14:00'); await page.submit();
  assert.equal(page.posts().length, 0);
  assert.equal(page.nodes['#booking-review'].disabled, true);
  assert.match(page.nodes['#error-date'].textContent, /tidak tersedia/);
});

test('hidden page aborts pending month work and resumes with one fresh month and one day check', async () => {
  const page = harness(); await settle(); await page.fill();
  page.config.holdMonth = true;
  page.config.closedDates = ['2026-10-21'];
  page.tickRefresh(); await settle();
  const old = page.calls.filter(call => call.path === '/api/booking/calendar').at(-1);
  page.visibility('hidden');
  assert.equal(old.request.signal.aborted, true);
  assert.equal(page.intervals.size, 0);
  const before = page.calls.length;
  page.config.closedDates = [];
  page.config.holdMonth = false;
  page.visibility('visible'); await settle();
  assert.equal(page.calls.length, before + 2);
  assert.equal(page.calendar.state.status, 'ready');
  assert.equal(page.calendar.state.closedDates.includes('2026-10-21'), false);
  page.monthReleases[0](); await settle();
  assert.equal(page.calendar.state.closedDates.includes('2026-10-21'), false, 'late hidden-page block cannot replace fresh reopened state');
  assert.equal(page.inputs.time.value, '14:00');
  assert.equal(page.nodes['#booking-review'].disabled, false);
  assert.equal(page.intervals.size, 1);
});

test('each visible 45-second refresh uses at most one month summary and one selected-day request', async () => {
  const page = harness(); await settle(); await page.fill();
  const before = page.calls.length;
  page.tickRefresh(); await settle();
  const refresh = page.calls.slice(before);
  assert.deepEqual(refresh.map(call => call.path).sort(), ['/api/booking/availability', '/api/booking/calendar']);
  assert.equal(page.inputs.time.value, '14:00');
  assert.equal(page.nodes['#booking-review'].disabled, false);
});

test('an unchanged available-time list retains option nodes and native focus during quiet refresh', async () => {
  const page = harness(); await settle(); await page.fill();
  const options = [...page.inputs.time.options].filter(option => option.value);
  page.inputs.time.focus();
  page.tickRefresh(); await settle();
  assert.deepEqual(page.inputs.time.options.filter(option => option.value), options);
  options.forEach(option => assert.equal(page.inputs.time.options.find(current => current.value === option.value), option));
  assert.equal(page.inputs.time.focused, true);
  assert.equal(page.inputs.time.value, '14:00');
});

test('October 30 occupied 08:00–10:00 removes overlapping starts and keeps every later service-fitting start', async () => {
  const page = harness({ busyIntervals: [{ start: '2026-10-30T08:00:00+07:00', end: '2026-10-30T10:00:00+07:00' }] });
  await settle(); await page.fill();
  page.change('date', '2026-10-30'); await settle();
  for (const [choice, starts] of [
    ['plain:60', ['10:00', '11:00', '12:00', '13:00', '14:00']],
    ['simple:60', ['10:00', '11:00', '12:00', '13:00', '14:00']],
    ['simple:120', ['10:00', '12:00', '14:00']],
    ['full-art:180', ['11:00']],
    ['full-art:240', ['12:00']],
    ['full-art:300', []],
  ]) {
    page.change('serviceDuration', choice); await settle();
    assert.deepEqual(page.inputs.time.options.filter(option => option.value).map(option => option.value), starts, choice);
    assert.equal(page.calendar.state.closedDates.includes('2026-10-30'), starts.length === 0, choice);
  }
  page.change('serviceDuration', 'simple:120'); await settle();
  page.config.busyIntervals = [];
  page.tickRefresh(); await settle();
  assert.deepEqual(page.inputs.time.options.filter(option => option.value).map(option => option.value), ['08:00', '10:00', '12:00', '14:00']);
});

test('rapid service changes abort old month checks and a late duration summary cannot close the new choice', async () => {
  const page = harness({ holdMonth: true, closedByDesign: { 'full-art:300': ['2026-10-22'] } }); await settle();
  page.change('serviceDuration', 'full-art:300'); await settle();
  page.change('serviceDuration', 'plain:60'); await settle();
  const checks = page.calls.filter(call => call.path === '/api/booking/calendar');
  assert.equal(checks.length, 3);
  assert.equal(checks[0].request.signal.aborted, true);
  assert.equal(checks[1].request.signal.aborted, true);
  assert.deepEqual(JSON.parse(checks[2].request.body), { month: '2026-10', designType: 'plain', durationMinutes: '60' });
  page.monthReleases[2](); await settle();
  assert.equal(page.calendar.state.status, 'ready');
  assert.equal(page.calendar.state.closedDates.includes('2026-10-22'), false);
  const applied = page.calendar.state;
  page.monthReleases[1](); page.monthReleases[0](); await settle();
  assert.equal(page.calendar.state, applied);
  assert.equal(page.inputs.serviceDuration.value, 'plain:60');
  assert.equal(page.calendar.state.closedDates.includes('2026-10-22'), false);
});

test('a duration-specific closed day reopens from the matching cached summary when the customer chooses a shorter service', async () => {
  const page = harness({ closedByDesign: { 'full-art:300': ['2026-10-22'] } }); await settle(); await page.fill();
  page.change('date', '2026-10-22'); await settle();
  page.change('serviceDuration', 'full-art:300'); await settle();
  assert.equal(page.calendar.state.closedDates.includes('2026-10-22'), true);
  assert.equal(page.inputs.time.value, '');
  assert.equal(page.nodes['#booking-review'].disabled, true);
  const monthlyChecks = page.calls.filter(call => call.path === '/api/booking/calendar').length;
  page.change('serviceDuration', 'simple:120'); await settle();
  assert.equal(page.calendar.state.closedDates.includes('2026-10-22'), false);
  assert.equal(page.calls.filter(call => call.path === '/api/booking/calendar').length, monthlyChecks);
  page.change('time', '14:00');
  assert.equal(page.nodes['#booking-review'].disabled, false);
});

test('an older free-time snapshot cannot restore choices after a newer month summary closes the selected day', async () => {
  const page = harness(); await settle(); await page.fill();
  page.config.holdAvailability = true;
  page.change('date', '2026-10-22'); await settle();
  assert.equal(page.availabilityReleases.length, 1);
  page.config.closedDates = ['2026-10-22'];
  page.nodes['#booking-calendar-retry'].listeners.click(); await settle();
  assert.equal(page.calendar.state.closedDates.includes('2026-10-22'), true);
  assert.deepEqual(page.inputs.time.options.filter(option => option.value), []);
  assert.equal(page.inputs.time.value, '');
  assert.equal(page.nodes['#booking-review'].disabled, true);
  page.availabilityReleases[0](); await settle();
  assert.deepEqual(page.inputs.time.options.filter(option => option.value), [], 'the older day response must respect the newer date closure');
  assert.equal(page.inputs.time.value, '');
  assert.equal(page.nodes['#booking-review'].disabled, true);
  assert.equal(page.posts().length, 0);
});

test('security verification starts only on explicit Book, and a failed challenge preserves proof and retry identity',async()=>{
  const saved=draftStorage(),page=harness({...saved,challengeFailure:true});await settle();await page.fill();
  page.tickRefresh();await recover();
  assert.equal(page.challengeCalls.filter(call=>call.action==='verify').length,0);
  await page.submit();
  assert.equal(page.posts().length,0);assert.equal(page.redirects.length,0);
  assert.equal(page.nodes['#booking-proof-preview'].hidden,false);assert.equal(page.inputs.name.value,'Synthetic Customer');
  assert.equal(page.nodes['#booking-review'].disabled,false);
  assert.match(page.nodes['#booking-submit-status'].textContent,/Pemeriksaan keamanan belum selesai/);
  const key=JSON.parse([...saved.values.values()][0]).requestKey;assert.match(key,/^[a-f0-9]{64}$/);
  page.config.challengeFailure=false;await page.submit();
  assert.equal(page.posts()[0].idempotencyKey,key);assert.equal(page.challengeCalls.filter(call=>call.action==='verify').length,2);
  assert.equal(page.redirects.length,1);
});

test('a pending challenge locks submission without uploading, and a second submit cannot start another challenge',async()=>{
  const page=harness({holdChallenge:true});await settle();await page.fill();
  const pending=page.submit();await settle();
  assert.equal(page.posts().length,0);assert.equal(page.nodes['#booking-review'].disabled,true);
  assert.ok(page.fieldsets.every(fieldset=>fieldset.disabled));
  assert.match(page.nodes['#booking-submit-status'].textContent,/Memeriksa keamanan/);
  await page.submit();assert.equal(page.challengeCalls.filter(call=>call.action==='verify').length,1);
  page.challengeReleases[0]();await pending;
  assert.equal(page.posts().length,1);assert.equal(page.redirects.length,1);
});

test('going offline cancels a pending challenge and reconnecting never submits without another explicit Book',async()=>{
  const saved=draftStorage(),page=harness({...saved,holdChallenge:true});await settle();await page.fill();
  const pending=page.submit();await settle();
  page.navigator.onLine=false;page.window.listeners.offline();await pending;await recover();
  assert.ok(page.challengeCalls.some(call=>call.action==='cancel'));
  assert.equal(page.posts().length,0);assert.equal(page.redirects.length,0);assert.equal(page.nodes['#booking-review'].disabled,true);
  assert.match(page.nodes['#booking-submit-status'].textContent,/Koneksi terputus/);
  assert.equal(page.inputs.time.value,'14:00');assert.equal(page.nodes['#booking-proof-preview'].hidden,false);
  const key=JSON.parse([...saved.values.values()][0]).requestKey;
  page.config.holdChallenge=false;page.navigator.onLine=true;page.window.listeners.online();await recover();
  assert.equal(page.posts().length,0);assert.equal(page.nodes['#booking-review'].disabled,false);
  await page.submit();assert.equal(page.posts()[0].idempotencyKey,key);assert.equal(page.redirects.length,1);
});

test('page departure cancels a pending challenge, and a late token cannot upload or redirect',async()=>{
  const page=harness({holdChallenge:true});await settle();await page.fill();
  const pending=page.submit();await settle();page.window.listeners.pagehide();await pending;
  page.challengeReleases[0]();await settle();
  assert.equal(page.posts().length,0);assert.equal(page.redirects.length,0);
  page.config.holdChallenge=false;page.window.listeners.pageshow({persisted:true});await recover();
  assert.equal(page.nodes['#booking-review'].disabled,false);await page.submit();
  assert.equal(page.posts().length,1);assert.equal(page.redirects.length,1);
});

test('admission capacity, inflight and form-update errors keep details and retry keys without automatic uploads',async()=>{
  for(const [requestFailureCode,requestFailureStatus,message] of [['ADMISSION_CAPACITY',503,/sedang dibatasi/],['ADMISSION_IN_PROGRESS',409,/sedang diproses/],['BOOKING_UPDATE_REQUIRED',409,/Formulir telah diperbarui/]]){
    const page=harness({requestFailures:1,requestFailureCode,requestFailureStatus});await settle();await page.fill();await page.submit();
    assert.equal(page.redirects.length,0);assert.equal(page.inputs.name.value,'Synthetic Customer');assert.equal(page.inputs.time.value,'14:00');
    assert.equal(page.nodes['#booking-proof-preview'].hidden,false);assert.match(page.nodes['#booking-submit-status'].textContent,message);
    const first=page.posts()[0];await recover();assert.equal(page.posts().length,1);
    await page.submit();assert.equal(page.posts()[1].idempotencyKey,first.idempotencyKey);
    assert.notEqual(page.posts()[1].turnstileToken,first.turnstileToken);assert.equal(page.redirects.length,1);
  }
});

test('server-rejected receipt requires replacement after reload while all other booking fields survive',async()=>{
  for(const [requestFailureCode,requestFailureStatus] of [['PROOF_INVALID',400],['PROOF_SIZE',413]]){
    const saved=draftStorage(),page=harness({...saved,requestFailures:1,requestFailureCode,requestFailureStatus});await settle();await page.fill();await page.submit();
    assert.equal(page.redirects.length,0);assert.equal(page.nodes['#booking-review'].disabled,true);assert.equal(page.inputs.paymentProof.attrs['aria-invalid'],'true');
    assert.match(page.nodes['#booking-proof-status'].textContent,requestFailureCode==='PROOF_SIZE'?/terlalu besar/:/belum dapat diperiksa/);
    const first=page.posts()[0];await page.submit();assert.equal(page.posts().length,1,'cannot resend a rejected receipt without replacement');
    page.window.listeners.pagehide();await recover();
    const next=harness(saved);await recover();
    assert.equal(next.inputs.name.value,'Synthetic Customer');assert.equal(next.inputs.date.value,'2026-10-21');assert.equal(next.inputs.time.value,'14:00');
    assert.equal(next.nodes['#booking-review'].disabled,true,'reload cannot make a known rejected receipt ready');
    assert.equal(next.posts().length,0);await next.uploadProof({size:100,type:'image/png',name:'replacement.png',syntheticBytes:'replacement valid image'});
    assert.equal(next.nodes['#booking-review'].disabled,false);await next.submit();
    assert.notEqual(next.posts()[0].idempotencyKey,first.idempotencyKey);assert.equal(next.redirects.length,1);
  }
});

test('a historical base64 receipt draft recovers into binary transport with its original lost-ack key',async()=>{
  const saved=draftStorage(),original=harness({...saved,requestFailures:1});await settle();await original.fill();await original.submit();
  original.window.listeners.pagehide();await recover();const first=original.posts()[0];
  for(const [id,record] of saved.images){const legacy={...record,base64:Buffer.from(await record.blob.arrayBuffer()).toString('base64')};delete legacy.blob;delete legacy.version;saved.images.set(id,legacy);}
  const next=harness(saved);await recover();assert.equal(next.nodes['#booking-proof-preview'].hidden,false);assert.equal(next.nodes['#booking-review'].disabled,false);
  assert.equal(next.posts().length,0);await next.submit();
  assert.equal(next.posts()[0].idempotencyKey,first.idempotencyKey);assert.deepEqual(await proofBytes(next.posts()[0]),await proofBytes(first));
  assert.equal(next.redirects.length,1);
});
