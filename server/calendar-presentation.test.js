import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleCalendarProvider, GoogleCalendarError } from './google-calendar.js';
import { BOOKING_DESIGNS, normalizeWhatsApp } from './booking.js';

// Synthetic, ephemeral signing material and fully intercepted fetch only.
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const exported = await crypto.subtle.exportKey('pkcs8', keys.privateKey);
const env = {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'presentation@synthetic-test.iam.gserviceaccount.com',
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${Buffer.from(exported).toString('base64')}\n-----END PRIVATE KEY-----`,
  GOOGLE_CALENDAR_ID: 'synthetic-presentation@group.calendar.google.com',
};
const current = Date.parse('2026-10-20T00:00:00+07:00');
const appointment = { bookingId: 'presentation_test_001', name: 'Client Test', whatsapp: '081234567890', agreedPrice: 155000, date: '2026-10-20', time: '08:00', designType: 'simple', durationMinutes: 120, paymentMode: 'deposit', paymentAmount: 20000 };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const token = () => json({ access_token: 'synthetic-presentation-token', token_type: 'Bearer', expires_in: 3600 });
const provider = (fetch, now = current) => createGoogleCalendarProvider(env, { fetch, now: () => now });
const isCode = code => error => error instanceof GoogleCalendarError && error.code === code;
const digest = async value => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex');

// Independent historical v3 fixture: this deliberately does not use the new
// presentation builder, so recovery compatibility cannot pass by self-comparison.
async function previousV3(input = appointment) {
  const bookingId = input.bookingId;
  const summary = `Chii Nails · ${input.name.trim()}`;
  const whatsapp = normalizeWhatsApp(input.whatsapp);
  const payment = input.paymentMode === 'full' ? input.agreedPrice : input.paymentAmount;
  const description = `Booking: ${bookingId}\nNama: ${input.name.trim()}\nWhatsApp: https://wa.me/${whatsapp}\nHarga disepakati: Rp${input.agreedPrice}\nPilihan pembayaran: ${input.paymentMode === 'full' ? 'Full payment' : 'DP 10%, minimal Rp20000'}\nNominal pembayaran: Rp${payment}\nSisa pembayaran: Rp${input.agreedPrice - payment}\nNominal dan pembayaran diperiksa terpisah oleh operator.\nJenis desain: ${BOOKING_DESIGNS[input.designType].label}\nDurasi: ${input.durationMinutes} menit`;
  const startISO = `${input.date}T${input.time}:00+07:00`;
  const endISO = `${new Date(Date.parse(startISO) + input.durationMinutes * 60000 + 7 * 3600000).toISOString().slice(0, 19)}+07:00`;
  const fingerprint = await digest(JSON.stringify({ version: 3, calendarId: env.GOOGLE_CALENDAR_ID, bookingId, summary, description, startISO, endISO }));
  return {
    id: `chii${await digest(`chiinails:booking:v1:${bookingId}`)}`, summary, description,
    start: { dateTime: startISO, timeZone: 'Asia/Jakarta' }, end: { dateTime: endISO, timeZone: 'Asia/Jakarta' },
    status: 'confirmed', visibility: 'private', transparency: 'opaque',
    extendedProperties: { private: { source: 'chiinails-booking-v3', bookingId, fingerprint } },
  };
}

test('all six service-duration choices and supported phone formats create full-number, service-specific v4 events', async () => {
  let body;
  const calendar = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    assert.equal(init.method, 'POST');
    body = JSON.parse(init.body);
    return json(body);
  });
  const expectedIds = new Set();
  for (const [designType, durationMinutes] of [['plain', 60], ['simple', 60], ['simple', 120], ['full-art', 180], ['full-art', 240], ['full-art', 300]]) {
    for (const whatsapp of ['081234567890', '6281234567890', '+6281234567890', ' +62 (812) 3456-7890 ']) {
      const result = await calendar.createApprovedAppointment({ ...appointment, designType, durationMinutes, whatsapp });
      expectedIds.add(result.eventId);
      assert.equal(body.summary, `Client Test · 081234567890 · ${BOOKING_DESIGNS[designType].label}`);
      assert.match(body.description, /Nomor WhatsApp: 081234567890 \(\+6281234567890\)\n/);
      assert.match(body.description, /WhatsApp: <a href="https:\/\/wa.me\/6281234567890">https:\/\/wa.me\/6281234567890<\/a>\n/);
      assert.ok(body.description.includes(`Jenis desain: ${BOOKING_DESIGNS[designType].label}`));
      assert.ok(body.description.includes(`Durasi: ${durationMinutes} menit`));
      assert.equal(Date.parse(body.end.dateTime) - Date.parse(body.start.dateTime), durationMinutes * 60000);
      assert.equal(body.extendedProperties.private.source, 'chiinails-booking-v4');
      assert.equal(body.visibility, 'private');
      assert.equal('attendees' in body, false);
    }
  }
  assert.equal(expectedIds.size, 1, 'presentation and phone formatting never change the deterministic booking identity');
});

test('customer punctuation is escaped in HTML descriptions and cannot add attributes or links', async () => {
  let body;
  const calendar = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    body = JSON.parse(init.body);
    return json(body);
  });
  const name = 'Aulia " href="https://example.test" & O\'Neil';
  await calendar.createApprovedAppointment({ ...appointment, name });
  assert.ok(body.summary.startsWith(`${name} · `), 'Calendar titles remain ordinary customer text');
  assert.ok(body.description.includes('Nama: Aulia &quot; href=&quot;https://example.test&quot; &amp; O&#39;Neil\n'));
  assert.equal((body.description.match(/<a /g) || []).length, 1);
  assert.equal((body.description.match(/href="/g) || []).length, 1);
  assert.equal(body.description.includes('href="https://example.test"'), false);
});

test('malformed phone values cannot trigger authorization, insert or recovery lookup', async () => {
  let calls = 0;
  const calendar = provider(async () => { calls++; throw new Error('unexpected network attempt'); });
  for (const whatsapp of ['081234567', '08123456789012', '080412345678', '084123456789', '+081234567890', '+12025550123', '08123456789x', '081234567890\n', '0812<script>', 'https://wa.me/6281234567890']) {
    await assert.rejects(calendar.createApprovedAppointment({ ...appointment, whatsapp }), isCode('CALENDAR_INPUT'));
    await assert.rejects(calendar.reconcileApprovedAppointment({ ...appointment, whatsapp }), isCode('CALENDAR_INPUT'));
  }
  assert.equal(calls, 0);
});

test('a contact-like customer name cannot move the generated chat link into the name field', async () => {
  let body;
  const calendar = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    body = JSON.parse(init.body);
    return json(body);
  });
  const name = 'WhatsApp: https://wa.me/6281234567890';
  await calendar.createApprovedAppointment({ ...appointment, name });
  assert.ok(body.description.includes(`Nama: ${name}\nNomor WhatsApp: 081234567890 (+6281234567890)\n`));
  assert.equal((body.description.match(/<a /g) || []).length, 1);
});

test('a duplicate v4 insert reconciles the exact earlier v3 event without replacement or a second booking ID', async () => {
  const old = await previousV3();
  let posts = 0, gets = 0;
  const calendar = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    if (init.method === 'POST') {
      posts++;
      const attempted = JSON.parse(init.body);
      assert.equal(attempted.id, old.id);
      assert.equal(attempted.extendedProperties.private.source, 'chiinails-booking-v4');
      return json({}, 409);
    }
    assert.equal(init.method, 'GET'); gets++;
    assert.ok(url.endsWith(`/events/${old.id}`));
    return json(old);
  });
  assert.deepEqual(await calendar.createApprovedAppointment(appointment), { eventId: old.id, startISO: old.start.dateTime, endISO: old.end.dateTime, reconciled: true });
  assert.equal(posts, 1); assert.equal(gets, 1);
});

test('lookup-only recovery accepts exact v3 payloads before or after their start without inserting', async () => {
  const old = await previousV3();
  for (const now of [current, Date.parse('2026-10-20T09:00:00+07:00')]) {
    let gets = 0;
    const calendar = provider(async (url, init) => {
      if (url.includes('oauth2')) return token();
      assert.equal(init.method, 'GET'); assert.equal(init.body, undefined); gets++;
      return json(old);
    }, now);
    assert.deepEqual(await calendar.reconcileApprovedAppointment(appointment), { found: true, eventId: old.id, startISO: old.start.dateTime, endISO: old.end.dateTime, reconciled: true });
    assert.equal(gets, 1);
  }
});

test('a delayed create retry reads and reconciles an exact past v3 event without a new insert', async () => {
  const old = await previousV3();
  let gets = 0;
  const calendar = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    assert.equal(init.method, 'GET'); assert.equal(init.body, undefined); gets++;
    return json(old);
  }, Date.parse('2026-10-20T09:00:00+07:00'));
  assert.equal((await calendar.createApprovedAppointment(appointment)).reconciled, true);
  assert.equal(gets, 1);
});

test('historical presentation recovery rejects every modified identity, payload, status or financial fingerprint', async () => {
  const old = await previousV3();
  const mutations = [
    event => { event.id = 'wrong'; },
    event => { event.summary = 'Chii Nails · Different customer'; },
    event => { event.description = event.description.replace('Rp155000', 'Rp165000'); },
    event => { event.description = event.description.replace('6281234567890', '6289876543210'); },
    event => { event.description = event.description.replace('Simple nail art', 'Full nail art'); },
    event => { event.start.dateTime = '2026-10-20T09:00:00+07:00'; },
    event => { event.end.dateTime = '2026-10-20T11:00:00+07:00'; },
    event => { event.status = 'cancelled'; },
    event => { event.visibility = 'public'; },
    event => { event.transparency = 'transparent'; },
    event => { event.attendees = [{ email: 'synthetic@example.test' }]; },
    event => { event.extendedProperties.private.source = 'chiinails-booking-v2'; },
    event => { event.extendedProperties.private.bookingId = 'other_booking_001'; },
    event => { event.extendedProperties.private.fingerprint = '0'.repeat(64); },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(old); mutate(changed);
    for (const mode of ['duplicate', 'lookup']) {
      let posts = 0;
      const calendar = provider(async (url, init) => {
        if (url.includes('oauth2')) return token();
        if (init.method === 'POST') { posts++; return json({}, 409); }
        return json(changed);
      });
      await assert.rejects(mode === 'duplicate' ? calendar.createApprovedAppointment(appointment) : calendar.reconcileApprovedAppointment(appointment), isCode('CALENDAR_CONFLICT'));
      assert.equal(posts, mode === 'duplicate' ? 1 : 0);
    }
  }
});

test('a self-consistent fingerprint for a different old customer still cannot reconcile this booking', async () => {
  const altered = await previousV3({ ...appointment, name: 'Different customer' });
  const calendar = provider(async url => url.includes('oauth2') ? token() : json(altered));
  await assert.rejects(calendar.reconcileApprovedAppointment(appointment), isCode('CALENDAR_CONFLICT'));
});

test('an ordinary successful v4 insertion response cannot silently downgrade to historical v3 content', async () => {
  const old = await previousV3();
  const calendar = provider(async url => url.includes('oauth2') ? token() : json(old));
  await assert.rejects(calendar.createApprovedAppointment(appointment), isCode('CALENDAR_RESPONSE'));
});

test('new v4 events remain readable as active appointments for deletion synchronization', async () => {
  let stored;
  const calendar = provider(async (url, init) => {
    if (url.includes('oauth2')) return token();
    if (init.method === 'POST') { stored = JSON.parse(init.body); return json(stored); }
    assert.equal(init.method, 'GET');
    return json(stored);
  });
  const result = await calendar.createApprovedAppointment(appointment);
  assert.equal(stored.extendedProperties.private.source, 'chiinails-booking-v4');
  const identity = { bookingId: appointment.bookingId, eventId: result.eventId };
  assert.deepEqual(await calendar.readAppointmentState(identity), { state: 'active' });
  stored = { id: result.eventId, status: 'cancelled' };
  assert.deepEqual(await calendar.readAppointmentState(identity), { state: 'deleted' });
});
