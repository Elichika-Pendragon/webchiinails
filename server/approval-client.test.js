import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

// Synthetic native-controller coverage only; real Google sign-in, rendering,
// mobile layout and Calendar writes are deliberately outside this fixture.
const source = readFileSync(new URL('../src/scripts/approval-client.js', import.meta.url), 'utf8');
const fixture = {
  id: 'synthetic-request', status: 'pending', name: 'Synthetic Customer', whatsapp: '+6281234567890',
  agreedPrice: 100000, deposit: 10000, remainingBalance: 90000,
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
  const fields = ['name', 'whatsapp', 'date', 'time', 'agreedPrice', 'deposit', 'remainingBalance'].map(key => {
    const node = element(); node.dataset.approvalValue = key; node.tagName = key === 'whatsapp' ? 'A' : 'DD'; return node;
  });
  const main = element();
  const calls = [];
  let scripts = 0;
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
  vm.runInNewContext(source, { document, window, URL, Intl, fetch, AbortController, DOMException });
  return { nodes, fields, main, calls, window, config, get scripts() { return scripts; }, posts: () => calls.filter(call => call.request.method === 'POST') };
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
  assert.match(page.fields.find(node => node.dataset.approvalValue === 'deposit').textContent, /10\.000/);
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

test('invalid derived amounts or interval cannot render a misleading summary', async () => {
  for (const summary of [{ deposit: 1 }, { endISO: '2026-10-21T08:00:00Z' }]) {
    const page = harness({ summary }); await settle();
    assert.equal(page.nodes['approval-request'].hidden, true);
    assert(page.fields.every(node => node.textContent === ''));
    assert.equal(page.nodes['approval-retry'].hidden, false);
  }
});

test('page departure removes private DOM and contact URLs before history restoration', async () => {
  const page = harness(); await settle(); page.window.listeners.pagehide();
  assert(page.fields.every(node => node.textContent === ''));
  assert.equal(page.nodes['approval-request'].hidden, true);
  assert.equal(page.fields.find(node => node.dataset.approvalValue === 'whatsapp').href, undefined);
});
