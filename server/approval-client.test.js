import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BOOKING_DESIGNS, LEGACY_BOOKING_DESIGN_LABELS, calculatePayment, calculateLegacyPayment, normalizeBookingDesign } from './booking.js';

// Synthetic native-controller coverage only; real Google sign-in, rendering,
// mobile layout and Calendar writes are deliberately outside this fixture.
const source = readFileSync(new URL('../src/scripts/approval-client.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
const fixture = {
  id: 'synthetic-request', status: 'pending', name: 'Synthetic Customer', whatsapp: '+6281234567890',
  agreedPrice: 100000, deposit: 20000, remainingBalance: 80000, paymentMode: 'deposit', paymentPolicy: 'manual-min20k-v3',
  designType: 'simple', durationMinutes: 120,
  hasPaymentProof: true,
  startISO: '2026-10-21T07:00:00.000Z', endISO: '2026-10-21T09:00:00.000Z',
};
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function element() {
  return {
    hidden: true, textContent: '', dataset: {}, tagName: 'DIV', clientWidth: 300, disabled: false, listeners: {}, attrs: {},
    setAttribute(key, value) { this.attrs[key] = value; },
    removeAttribute(key) { delete this[key]; delete this.attrs[key]; },
    replaceChildren() { this.textContent = ''; },
    addEventListener(key, callback) { this.listeners[key] = callback; },
  };
}

function harness(options = {}) {
  const config = { authenticated: true, token: 'a'.repeat(43), status: 'pending', failure: 0, code: '', ...options };
  const nodes = Object.fromEntries([...source.matchAll(/getElementById\('([^']+)'\)/g)].map(match => [match[1], element()]));
  const fields = ['name', 'whatsapp', 'design', 'date', 'time', 'agreedPrice', 'deposit', 'remainingBalance'].map(key => {
    const node = element(); node.dataset.approvalValue = key; node.tagName = key === 'whatsapp' ? 'A' : 'DD'; return node;
  });
  const main = element();
  const calls = [];
  let scripts = 0;
  const objectUrls = [];
  const revokedUrls = [];
  class TestURL extends URL {
    static createObjectURL() { const url = `blob:synthetic-owner-${objectUrls.length}`; objectUrls.push(url); return url; }
    static revokeObjectURL(url) { revokedUrls.push(url); }
  }
  const window = {
    location: { href: `https://chiinails.pages.dev/book/approve?r=${config.token}` },
    setTimeout, clearTimeout, listeners: {},
    addEventListener(key, callback) { this.listeners[key] = callback; },
  };
  const document = {
    querySelector: () => main, getElementById: id => nodes[id], querySelectorAll: () => fields,
    createElement: () => element(), head: { append() { scripts++; } },
  };
  const fetch = async (path, request) => {
    calls.push({ path, request });
    if (path.endsWith('/auth/session')) return {
      ok: true, status: 200,
      json: async () => ({ authenticated: config.authenticated, csrfToken: 'x'.repeat(43), nonce: 'n'.repeat(43), clientId: '12345-example.apps.googleusercontent.com' }),
    };
    if (path.startsWith('/api/booking/proof?')) {
      const status = config.proofStatus || 200;
      return { ok: status === 200, status, headers: { get: () => 'image/jpeg' }, blob: async () => new Blob(['synthetic image'], { type: 'image/jpeg' }) };
    }
    if (request.method === 'POST') {
      if (config.failure) return { ok: false, status: config.failure, json: async () => ({ code: config.code }) };
      config.status = JSON.parse(request.body).action === 'accept' ? 'accepted' : 'cancelled';
    }
    const data = {
      ...fixture, ...config.summary, status: config.status,
      calendarEventUrl: config.status === 'accepted' ? config.calendarEventUrl || 'https://calendar.google.com/calendar/event?eid=synthetic' : undefined,
    };
    return { ok: true, status: 200, json: async () => data };
  };
  vm.runInNewContext(source, { document, window, URL: TestURL, Intl, fetch, AbortController, DOMException, BOOKING_DESIGNS, LEGACY_BOOKING_DESIGN_LABELS, calculatePayment, calculateLegacyPayment, normalizeBookingDesign });
  return { nodes, fields, main, calls, window, config, objectUrls, revokedUrls, get scripts() { return scripts; }, posts: () => calls.filter(call => call.request.method === 'POST') };
}

test('malformed approval token does not request a session or private details', async () => {
  const page = harness({ token: 'invalid' }); await settle();
  assert.equal(page.calls.length, 0);
  assert.match(page.nodes['approval-status'].textContent, /tidak lengkap/);
});

test('anonymous visit fetches only the session and does not load GIS or private fields', async () => {
  const page = harness({ authenticated: false }); await settle();
  assert.equal(page.calls.length, 1);
  assert.equal(page.nodes['approval-signin-panel'].hidden, false);
  assert.equal(page.nodes['approval-request'].hidden, true);
  assert.equal(page.scripts, 0);
  assert(page.fields.every(node => node.textContent === ''));
});

test('authenticated pending request renders the canonical brief and only pending actions', async () => {
  const page = harness(); await settle();
  assert.equal(page.calls.length, 2);
  assert.equal(page.nodes['approval-request'].hidden, false);
  assert.equal(page.nodes['approval-actions'].hidden, false);
  assert.equal(page.nodes['approval-recover'].hidden, true);
  assert.match(page.fields.find(node => node.dataset.approvalValue === 'deposit').textContent, /20\.000/);
  assert.equal(page.fields.find(node => node.dataset.approvalValue === 'whatsapp').href, 'https://wa.me/6281234567890');
});

test('explicit acceptance sends CSRF protection and shows success only after the response', async () => {
  const page = harness(); await settle();
  assert.equal(page.posts().length, 0);
  await page.nodes['approval-accept'].listeners.click();
  assert.deepEqual(JSON.parse(page.posts()[0].request.body), { action: 'accept' });
  assert.equal(page.posts()[0].request.headers['X-CSRF-Token'], 'x'.repeat(43));
  assert.equal(page.nodes['approval-state'].textContent, 'Diterima');
  assert.equal(page.nodes['approval-actions'].hidden, true);
  assert.equal(page.nodes['approval-calendar-link'].hidden, false);
  const external = harness({ status: 'accepted', calendarEventUrl: 'https://evil.example/calendar/event' }); await settle();
  assert.equal(external.nodes['approval-calendar-link'].hidden, true);
});

test('pending cancellation does not expose a Calendar event link', async () => {
  const page = harness(); await settle(); await page.nodes['approval-cancel'].listeners.click();
  assert.equal(page.nodes['approval-state'].textContent, 'Dibatalkan');
  assert.equal(page.nodes['approval-calendar-link'].hidden, true);
  assert.deepEqual(JSON.parse(page.posts()[0].request.body), { action: 'cancel' });
});

test('approving and reconcile provide an explicit accept recovery action without cancellation', async () => {
  for (const status of ['approving', 'reconcile']) {
    const page = harness({ status }); await settle();
    assert.equal(page.nodes['approval-actions'].hidden, true);
    assert.equal(page.nodes['approval-recover'].hidden, false);
    assert.equal(page.posts().length, 0);
    await page.nodes['approval-recover'].listeners.click();
    assert.deepEqual(JSON.parse(page.posts()[0].request.body), { action: 'accept' });
    assert.equal(page.nodes['approval-state'].textContent, 'Diterima');
  }
});

test('terminal statuses show no decision or recovery controls', async () => {
  for (const status of ['accepted', 'cancelled', 'expired']) {
    const page = harness({ status }); await settle();
    assert.equal(page.nodes['approval-actions'].hidden, true);
    assert.equal(page.nodes['approval-recover'].hidden, true);
  }
});

test('uncertain write retains the brief but never claims success or permits immediate repeat', async () => {
  const page = harness({ failure: 503 }); await settle(); await page.nodes['approval-accept'].listeners.click();
  assert.equal(page.nodes['approval-request'].hidden, false);
  assert.equal(page.nodes['approval-actions'].hidden, true);
  assert.equal(page.nodes['approval-retry'].hidden, false);
  assert.match(page.nodes['approval-status'].textContent, /belum dapat dipastikan/);
  assert.notEqual(page.nodes['approval-state'].textContent, 'Diterima');
});

test('expired session clears private fields and requires sign-in', async () => {
  const page = harness({ failure: 401 }); await settle(); await page.nodes['approval-accept'].listeners.click();
  assert.equal(page.nodes['approval-request'].hidden, true);
  assert(page.fields.every(node => node.textContent === ''));
  assert.equal(page.nodes['approval-signin-panel'].hidden, false);
});

test('stale CSRF clears private fields and asks to refresh the session', async () => {
  const page = harness({ failure: 403, code: 'AUTH_CSRF' }); await settle(); await page.nodes['approval-accept'].listeners.click();
  assert.match(page.nodes['approval-status'].textContent, /Sesi perlu diperbarui/);
  assert(page.fields.every(node => node.textContent === ''));
});

test('forbidden owner account cannot keep private fields or decision controls', async () => {
  const page = harness({ failure: 403, code: 'AUTH_FORBIDDEN' }); await settle(); await page.nodes['approval-accept'].listeners.click();
  assert.match(page.nodes['approval-status'].textContent, /belum memiliki akses/);
  assert(page.fields.every(node => node.textContent === ''));
  assert.equal(page.nodes['approval-actions'].hidden, true);
});

test('invalid manual amounts, mismatched balance or interval cannot render a misleading summary', async () => {
  for (const summary of [{ deposit: 19999, remainingBalance: 80001 }, { deposit: 100001, remainingBalance: -1 }, { deposit: 35000, remainingBalance: 80000 }, { endISO: '2026-10-21T08:00:00Z' }]) {
    const page = harness({ summary }); await settle();
    assert.equal(page.nodes['approval-request'].hidden, true);
    assert(page.fields.every(node => node.textContent === ''));
    assert.equal(page.nodes['approval-retry'].hidden, false);
  }
});

test('the owner brief preserves a manually declared Rp20.000 on a million-rupiah quote', async () => {
  const page = harness({ summary: { agreedPrice: 1000000, deposit: 20000, remainingBalance: 980000 } }); await settle();
  assert.equal(page.nodes['approval-request'].hidden, false);
  assert.equal(page.nodes['approval-actions'].hidden, false);
  assert.match(page.fields.find(node => node.dataset.approvalValue === 'deposit').textContent, /20\.000/);
  assert.match(page.fields.find(node => node.dataset.approvalValue === 'remainingBalance').textContent, /980\.000/);
  assert.doesNotMatch(page.nodes['approval-payment-label'].textContent, /10\s*%/);
  assert.doesNotMatch(page.nodes['approval-payment-note'].textContent, /10\s*%/);
});

test('custom manual deposit and an amount equal to the total remain actionable', async () => {
  for (const deposit of [35000, 100000]) {
    const page = harness({ summary: { deposit, remainingBalance: 100000 - deposit } }); await settle();
    assert.equal(page.nodes['approval-actions'].hidden, false);
    assert.equal(page.nodes['approval-request'].hidden, false);
  }
});

test('page departure removes private DOM and contact URLs before history restoration', async () => {
  const page = harness(); await settle(); page.window.listeners.pagehide();
  assert(page.fields.every(node => node.textContent === ''));
  assert.equal(page.nodes['approval-request'].hidden, true);
  assert.equal(page.fields.find(node => node.dataset.approvalValue === 'whatsapp').href, undefined);
});

test('legacy pending requests retain their original amount and identify the previous payment terms', async () => {
  const page = harness({ summary: { paymentMode: 'legacy', paymentPolicy: 'legacy-10pct-v1', deposit: 10000, remainingBalance: 90000 } }); await settle();
  assert.equal(page.nodes['approval-actions'].hidden, false);
  assert.match(page.nodes['approval-payment-label'].textContent, /DP.*ketentuan sebelumnya/);
  assert.match(page.fields.find(node => node.dataset.approvalValue === 'deposit').textContent, /10\.000/);
  assert.match(page.nodes['approval-payment-note'].textContent, /ketentuan pembayaran sebelumnya/);
});

test('historical minimum-DP requests retain the stored percentage amount under their original policy', async () => {
  const page = harness({ summary: { agreedPrice: 1000000, deposit: 100000, remainingBalance: 900000, paymentPolicy: 'min20k-v2' } }); await settle();
  assert.equal(page.nodes['approval-actions'].hidden, false);
  assert.match(page.fields.find(node => node.dataset.approvalValue === 'deposit').textContent, /100\.000/);
  const tampered = harness({ summary: { agreedPrice: 1000000, deposit: 20000, remainingBalance: 980000, paymentPolicy: 'min20k-v2' } }); await settle();
  assert.equal(tampered.nodes['approval-request'].hidden, true);
  assert.equal(tampered.nodes['approval-actions'].hidden, true);
});

test('historical service snapshots retain their original labels instead of being reclassified', async () => {
  for (const [designType, durationMinutes, label] of [['plain', 60, 'Plain / nail gel / removal'], ['simple', 120, 'Simple nail art'], ['full-art', 180, 'Full nail art']]) {
    const endISO = new Date(Date.parse(fixture.startISO) + durationMinutes * 60000).toISOString();
    const page = harness({ summary: { paymentPolicy: 'min20k-v2', designType, durationMinutes, endISO } }); await settle();
    assert.equal(page.nodes['approval-actions'].hidden, false);
    assert.equal(page.fields.find(node => node.dataset.approvalValue === 'design').textContent, label);
  }
});

test('full-payment summary shows the full amount and zero balance without a DP label', async () => {
  const page = harness({ summary: { paymentMode: 'full', deposit: 100000, remainingBalance: 0 } }); await settle();
  assert.equal(page.nodes['approval-actions'].hidden, false);
  assert.equal(page.nodes['approval-payment-label'].textContent, 'Full payment');
  assert.match(page.fields.find(node => node.dataset.approvalValue === 'deposit').textContent, /100\.000/);
  assert.match(page.fields.find(node => node.dataset.approvalValue === 'remainingBalance').textContent, /^Rp.?0$/);
});

test('owner brief displays each real agreed duration and preserves legacy two-hour bookings', async () => {
  for (const [designType, durationMinutes] of [['plain', 60], ['gel', 60], ['removal', 60], ['simple', 60], ['simple', 120], ['full-art', 180], ['full-art', 240], ['full-art', 300], ['legacy', 120]]) {
    const endISO = new Date(Date.parse(fixture.startISO) + durationMinutes * 60000).toISOString();
    const page = harness({ summary: { designType, durationMinutes, endISO } }); await settle();
    assert.equal(page.nodes['approval-request'].hidden, false);
    assert.equal(page.nodes['approval-duration-label'].textContent, `Waktu · ${durationMinutes / 60} jam`);
    if (designType === 'legacy') assert.match(page.fields.find(node => node.dataset.approvalValue === 'design').textContent, /ketentuan sebelumnya/);
    else assert.equal(page.fields.find(node => node.dataset.approvalValue === 'design').textContent, { plain: 'Plain', gel: 'Gel', removal: 'Removal', simple: 'Simple Design', 'full-art': 'Full Art' }[designType]);
  }
});

test('mismatched design duration cannot expose an actionable owner brief', async () => {
  for (const [designType, durationMinutes] of [['plain', 120], ['full-art', 120], ['legacy', 60], ['unknown', 120]]) {
    const endISO = new Date(Date.parse(fixture.startISO) + durationMinutes * 60000).toISOString();
    const page = harness({ summary: { designType, durationMinutes, endISO } }); await settle();
    assert.equal(page.nodes['approval-request'].hidden, true);
    assert.equal(page.nodes['approval-actions'].hidden, true);
  }
});

test('private proof loads only on an authenticated explicit click and closes without external URLs', async () => {
  const page = harness(); await settle();
  assert.equal(page.calls.some(call => call.path.startsWith('/api/booking/proof?')), false);
  assert.equal(page.nodes['approval-proof'].hidden, false);
  await page.nodes['approval-proof-toggle'].listeners.click();
  const call = page.calls.find(item => item.path.startsWith('/api/booking/proof?'));
  assert.equal(call.request.credentials, 'same-origin');
  assert.equal(call.request.cache, 'no-store');
  assert.equal(call.request.referrerPolicy, 'no-referrer');
  assert.equal(page.nodes['approval-proof-image'].hidden, false);
  assert.match(page.nodes['approval-proof-image'].src, /^blob:/);
  await page.nodes['approval-proof-toggle'].listeners.click();
  assert.equal(page.nodes['approval-proof-image'].hidden, true);
  assert.equal(page.revokedUrls.length, 1);
});

test('expired proof shows unavailable without forcing sign-in or dropping the brief', async () => {
  const page = harness({ proofStatus: 410 }); await settle();
  await page.nodes['approval-proof-toggle'].listeners.click();
  assert.match(page.nodes['approval-proof-status'].textContent, /sudah tidak tersedia/);
  assert.equal(page.nodes['approval-request'].hidden, false);
  assert.equal(page.calls.filter(call => call.path.endsWith('/auth/session')).length, 1);
});

test('legacy request without proof remains actionable and never fetches an image', async () => {
  const page = harness({ summary: { hasPaymentProof: false } }); await settle();
  assert.equal(page.nodes['approval-proof'].hidden, true);
  assert.equal(page.nodes['approval-actions'].hidden, false);
  await page.nodes['approval-proof-toggle'].listeners.click();
  assert.equal(page.calls.some(call => call.path.startsWith('/api/booking/proof?')), false);
});

test('leaving the owner page revokes a displayed private proof image', async () => {
  const page = harness(); await settle(); await page.nodes['approval-proof-toggle'].listeners.click();
  const before = page.nodes['approval-proof-image'].src;
  page.window.listeners.pagehide();
  assert(page.revokedUrls.includes(before));
  assert.equal(page.nodes['approval-proof-image'].src, undefined);
  assert.equal(page.nodes['approval-proof'].hidden, true);
});

test('Calendar-side cancellation explains that the prior booking no longer holds its slot', async () => {
  const page = harness({ status: 'cancelled', summary: { cancelledViaCalendar: true } }); await settle();
  assert.equal(page.nodes['approval-status'].textContent, 'Booking dibatalkan melalui Google Calendar. Slot tidak lagi ditahan oleh booking ini.');
  assert.equal(page.nodes['approval-outcome'].textContent, page.nodes['approval-status'].textContent);
  assert.equal(page.nodes['approval-actions'].hidden, true);
  assert.equal(page.posts().length, 0);
});
