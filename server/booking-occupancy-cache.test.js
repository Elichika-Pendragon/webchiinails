import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createPublicBookingCalendar, invalidateBookingOccupancy, OCCUPANCY_TTL_MS, OCCUPANCY_LEASE_MS, OCCUPANCY_FAILURE_COOLDOWN_MS } from './booking-occupancy-cache.js';
import { GoogleCalendarError } from './google-calendar.js';
import { getBookingCalendarMonth } from './booking-month.js';

const initial = Date.parse('2026-10-21T11:00:00+07:00');
const busy = (start, end) => ({ start: Date.parse(start), end: Date.parse(end) });
const day = date => ({ timeMin: `${date}T08:00:00+07:00`, timeMax: `${date}T17:00:00+07:00` });
const unavailable = error => error instanceof GoogleCalendarError && error.code === 'CALENDAR_UNAVAILABLE';
const invalid = error => error instanceof GoogleCalendarError && error.code === 'CALENDAR_INPUT';

function fixture({ current = initial, intervals = [], provider } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE booking_requests(id TEXT PRIMARY KEY, date TEXT NOT NULL, status TEXT NOT NULL); CREATE TABLE booking_slot_claims(slot_start INTEGER PRIMARY KEY,request_id TEXT);');
  sqlite.exec(readFileSync(new URL('../migrations/0008-booking-occupancy-cache.sql', import.meta.url), 'utf8'));
  const statements = [];
  const db = {
    prepare(sql) {
      const statement = { sql, values: [], bind(...values) { return { ...this, values }; },
        async first() { statements.push(this.sql); return sqlite.prepare(this.sql).get(...this.values) ?? null; },
        async all() { statements.push(this.sql); return { success: true, results: sqlite.prepare(this.sql).all(...this.values) }; },
        async run() { statements.push(this.sql); return { success: true, meta: { changes: Number(sqlite.prepare(this.sql).run(...this.values).changes) } }; },
      };
      return statement;
    },
  };
  const state = { now: current, intervals, calls: [], reads: 0 };
  const calendar = { async availability(bounds) { state.calls.push(bounds); return provider ? provider(bounds, state) : { busyIntervals: state.intervals }; },
    async verifyCalendarWriteAccess() { state.reads++; return true; }, async readAppointmentState() { state.reads++; return { state: 'active' }; },
  };
  const env = { BOOKING_DB: db, GOOGLE_CALENDAR_ID: 'synthetic-occupancy@group.calendar.google.com' };
  const now = () => state.now;
  const create = (options = {}) => createPublicBookingCalendar(env, { calendar, now, ...options });
  return { env, db, sqlite, state, calendar, now, create, statements,
    changes: () => sqlite.prepare('SELECT total_changes() AS n').get().n,
  };
}

test('day/month and service choices reuse one private monthly snapshot with two writes and fresh non-availability methods', async () => {
  const item = fixture({ intervals: [busy('2026-10-24T00:00:00+07:00', '2026-10-25T00:00:00+07:00'), busy('2026-10-30T08:00:00+07:00','2026-10-30T10:00:00+07:00')] });
  const wrapper = item.create();
  const result = await wrapper.availability(day('2026-10-30'));
  assert.deepEqual(result.busyIntervals, [busy('2026-10-30T08:00:00+07:00','2026-10-30T10:00:00+07:00')]);
  assert.deepEqual(item.state.calls, [{ timeMin: '2026-10-21T00:00:00+07:00', timeMax: '2026-11-01T00:00:00+07:00' }]);
  assert.equal(item.changes(), 2);
  const before = item.changes();
  for (const [designType, durationMinutes] of [['plain','60'],['simple','120'],['full-art','240']]) {
    const month = await getBookingCalendarMonth(item.env, { month:'2026-10',designType,durationMinutes }, { now:item.now, calendar:item.calendar, occupancyCache:true });
    assert.ok(month.closedDates.includes('2026-10-24'));
    assert.ok(!JSON.stringify(month).includes('busyIntervals'));
  }
  await wrapper.availability(day('2026-10-24'));
  assert.equal(item.state.calls.length,1);
  assert.equal(item.changes(),before,'Cache hits/claim reads perform no writes');
  await wrapper.verifyCalendarWriteAccess(); await wrapper.readAppointmentState();
  assert.equal(item.state.reads,2,'Cached wrapper delegates fresh permission/event reads');
  await item.calendar.availability(day('2026-10-30'));
  assert.equal(item.state.calls.length,2,'Unwrapped Book/accept Calendar stays fresh');
  const stored = item.sqlite.prepare('SELECT * FROM booking_occupancy_cache').get();
  assert.equal(stored.calendar_hash.length,64);
  assert.equal(JSON.stringify(stored).includes(item.env.GOOGLE_CALENDAR_ID),false);
  assert.equal(stored.payload.includes('name'),false);
  item.sqlite.close();
});

test('independent coalescers atomically share one refresh instead of stampeding Google', async () => {
  const item = fixture({ provider: async () => { await new Promise(resolve=>setTimeout(resolve,20)); return {busyIntervals:[]}; } });
  const values = await Promise.all(Array.from({length:16},()=>item.create({coalesce:false}).availability(day('2026-10-24'))));
  assert.equal(values.length,16);
  assert.equal(item.state.calls.length,1);
  assert.equal(item.changes(),2,'Only successful global lease and publication write rows');
  const pollingReads = item.statements.filter(sql=>sql.startsWith('SELECT')).length;
  assert.ok(pollingReads<16*13,'Contention polling is bounded');
  item.sqlite.close();
});

test('warm-isolate coalescing avoids unnecessary polling while global leases remain authoritative', async () => {
  const item = fixture({provider:async()=>{await new Promise(resolve=>setTimeout(resolve,10));return {busyIntervals:[]};}});
  await Promise.all(Array.from({length:20},()=>item.create().availability(day('2026-10-24'))));
  assert.equal(item.state.calls.length,1);
  assert.equal(item.statements.filter(sql=>sql.startsWith('SELECT')).length,1);
  item.sqlite.close();
});

test('warm monthly occupancy still overlays newly inserted in-flight claims from a fresh ledger read', async () => {
  const item=fixture();
  const input={month:'2026-10',designType:'plain',durationMinutes:'60'};
  const options={now:item.now,calendar:item.calendar,occupancyCache:true};
  item.sqlite.prepare('INSERT INTO booking_requests(id,date,status) VALUES(?,?,?)').run('held','2026-10-24','approving');
  assert.equal((await getBookingCalendarMonth(item.env,input,options)).closedDates.includes('2026-10-24'),false);
  for(let stamp=Date.parse('2026-10-24T08:00:00+07:00');stamp<Date.parse('2026-10-24T12:00:00+07:00');stamp+=1800000)
    item.sqlite.prepare('INSERT INTO booking_slot_claims(slot_start,request_id) VALUES(?,?)').run(stamp,'held');
  assert.equal((await getBookingCalendarMonth(item.env,input,options)).closedDates.includes('2026-10-24'),true);
  assert.equal(item.state.calls.length,1,'Provider snapshot reused while claim rows stay fresh');
  item.sqlite.close();
});

test('a D1 publication delayed beyond its TTL is not returned as fresh occupancy', async () => {
  const item=fixture();const prepare=item.db.prepare.bind(item.db);
  item.db.prepare=sql=>{
    const value=prepare(sql);
    if(!sql.startsWith('UPDATE booking_occupancy_cache SET payload'))return value;
    const bind=value.bind;
    value.bind=function(...args){const bound=bind.apply(this,args),run=bound.run;bound.run=async function(){const result=await run.call(this);item.state.now+=OCCUPANCY_TTL_MS;return result;};return bound;};
    return value;
  };
  await assert.rejects(item.create().availability(day('2026-10-24')),unavailable);
  item.sqlite.close();
});

test('expired occupancy is refreshed; stale busy or stale free data is never a success fallback', async () => {
  const item = fixture(); const wrapper=item.create();
  await wrapper.availability(day('2026-10-24'));
  item.state.intervals=[busy('2026-10-24T00:00:00+07:00','2026-10-25T00:00:00+07:00')];
  item.state.now += OCCUPANCY_TTL_MS-1;
  assert.deepEqual((await wrapper.availability(day('2026-10-24'))).busyIntervals,[]);
  item.state.now++;
  assert.equal((await wrapper.availability(day('2026-10-24'))).busyIntervals.length,1);
  assert.equal(item.state.calls.length,2);
  item.state.intervals=[]; item.state.now += OCCUPANCY_TTL_MS;
  assert.deepEqual((await wrapper.availability(day('2026-10-24'))).busyIntervals,[],'Removing all-day event reopens after bounded TTL');
  assert.equal(item.changes(),6);
  item.sqlite.close();
});

test('provider failure uses a shared cooldown and never returns stale free occupancy', async () => {
  let broken=false;
  const item=fixture({provider:async()=>{if(broken)throw new Error('Private credential/event failure');return {busyIntervals:[]};}});
  const wrapper=item.create(); await wrapper.availability(day('2026-10-24'));
  item.state.now+=OCCUPANCY_TTL_MS; broken=true;
  await assert.rejects(wrapper.availability(day('2026-10-24')),unavailable);
  for(let i=0;i<12;i++)await assert.rejects(item.create({coalesce:false}).availability(day('2026-10-24')),error=>unavailable(error)&&!error.message.includes('Private'));
  assert.equal(item.state.calls.length,2,'Cooldown suppresses repeated upstream attempts');
  broken=false; item.state.now+=OCCUPANCY_FAILURE_COOLDOWN_MS;
  assert.deepEqual((await wrapper.availability(day('2026-10-24'))).busyIntervals,[]);
  assert.equal(item.state.calls.length,3);
  item.sqlite.close();
});

test('in-flight invalidation prevents an older refresh from republishing free capacity', async () => {
  let resolve, started;
  const active=new Promise(ready=>{started=ready;});
  const item=fixture({provider:()=>{started();return new Promise(done=>{resolve=done;});}});
  const work=item.create().availability(day('2026-10-24'));
  await active;
  assert.equal(await invalidateBookingOccupancy(item.env,'2026-10-24'),1);
  resolve({busyIntervals:[]});
  await assert.rejects(work,unavailable);
  const saved=item.sqlite.prepare('SELECT payload,expires_at,lease_owner FROM booking_occupancy_cache').get();
  assert.equal(saved.payload,null);assert.equal(saved.expires_at,0);assert.equal(saved.lease_owner,null);
  item.sqlite.close();
});

test('approval and cancellation invalidate in the same SQLite ledger transaction', async () => {
  const item=fixture(); const wrapper=item.create();
  item.sqlite.prepare('INSERT INTO booking_requests(id,date,status) VALUES(?,?,?)').run('synthetic','2026-10-24','pending');
  await wrapper.availability(day('2026-10-24'));
  for(const status of ['approving','reconcile','accepted','cancelled']) {
    item.sqlite.exec('BEGIN');
    item.sqlite.prepare('UPDATE booking_requests SET status=? WHERE id=?').run(status,'synthetic');
    assert.equal(item.sqlite.prepare('SELECT expires_at FROM booking_occupancy_cache').get().expires_at,0);
    item.sqlite.exec('COMMIT');
    await wrapper.availability(day('2026-10-24'));
  }
  assert.equal(item.state.calls.length,5);
  item.sqlite.close();
});

test('rolled-back approval leaves the existing snapshot intact', async () => {
  const item=fixture();
  item.sqlite.prepare('INSERT INTO booking_requests(id,date,status) VALUES(?,?,?)').run('synthetic','2026-10-24','pending');
  await item.create().availability(day('2026-10-24'));
  item.sqlite.exec('BEGIN');item.sqlite.prepare("UPDATE booking_requests SET status='accepted' WHERE id='synthetic'").run();item.sqlite.exec('ROLLBACK');
  assert.ok(item.sqlite.prepare('SELECT expires_at FROM booking_occupancy_cache').get().expires_at>item.state.now);
  await item.create().availability(day('2026-10-24'));assert.equal(item.state.calls.length,1);
  item.sqlite.close();
});

test('crashed lease recovery and contention are bounded without independent upstream fallbacks', async () => {
  const item=fixture();await item.create().availability(day('2026-10-24'));
  item.state.now+=OCCUPANCY_TTL_MS;
  item.sqlite.prepare('UPDATE booking_occupancy_cache SET lease_owner=?,lease_until=?').run('crashed',item.state.now+OCCUPANCY_LEASE_MS);
  let sleeps=0;
  await assert.rejects(item.create({sleep:async()=>{sleeps++;},coalesce:false}).availability(day('2026-10-24')),unavailable);
  assert.equal(sleeps,12);assert.equal(item.state.calls.length,1);
  item.state.now+=OCCUPANCY_LEASE_MS;
  await item.create().availability(day('2026-10-24'));assert.equal(item.state.calls.length,2);
  item.sqlite.close();
});

test('stalled adapters time out, release isolate coalescing, and enter the shared cooldown', async () => {
  const item=fixture({provider:()=>new Promise(()=>{})});
  await assert.rejects(item.create({refreshTimeoutMs:5}).availability(day('2026-10-24')),unavailable);
  const row=item.sqlite.prepare('SELECT lease_owner,lease_until FROM booking_occupancy_cache').get();
  assert.equal(row.lease_owner,null);assert.equal(row.lease_until,item.state.now+OCCUPANCY_FAILURE_COOLDOWN_MS);
  await assert.rejects(item.create().availability(day('2026-10-24')),unavailable);
  assert.equal(item.state.calls.length,1);item.sqlite.close();
});

test('capacity: five continuously hot keys require 57,600 refresh writes/day; hits write zero and failure cooldown uses the same bound', () => {
  assert.equal(5*(86400000/OCCUPANCY_TTL_MS)*2,57600);
  assert.equal(OCCUPANCY_FAILURE_COOLDOWN_MS,OCCUPANCY_TTL_MS);
  assert.equal(100000-57600,42400);
});

test('five physical slots cover the inclusive January31-May1 horizon with no month collisions or calendar-ID growth', async () => {
  const item=fixture({current:Date.parse('2027-01-31T00:00:00+07:00')});
  const wrapper=item.create();
  for(const value of ['2027-01-31','2027-02-01','2027-03-01','2027-04-01','2027-05-01'])await wrapper.availability(day(value));
  assert.equal(item.sqlite.prepare('SELECT count(*) AS n FROM booking_occupancy_cache').get().n,5);
  assert.equal(item.state.calls.length,5);
  await wrapper.availability(day('2027-01-31'));assert.equal(item.state.calls.length,5);
  item.env.GOOGLE_CALENDAR_ID='different-synthetic@group.calendar.google.com';
  await item.create().availability(day('2027-01-31'));assert.equal(item.state.calls.length,6);
  assert.equal(item.sqlite.prepare('SELECT count(*) AS n FROM booking_occupancy_cache').get().n,5);
  item.sqlite.close();
});

test('changed horizon at WIB midnight refreshes canonical coverage rather than reusing a narrower range', async () => {
  const item=fixture({current:Date.parse('2026-10-21T23:59:59+07:00')});
  await item.create().availability(day('2026-10-24'));
  item.state.now+=1000;
  await item.create().availability(day('2026-10-24'));
  assert.equal(item.state.calls[0].timeMin,'2026-10-21T00:00:00+07:00');
  assert.equal(item.state.calls[1].timeMin,'2026-10-22T00:00:00+07:00');
  item.sqlite.close();
});

test('malformed cache payloads and upstream ranges fail closed without exposing their content', async () => {
  for(const content of ['{}','[[]]','[[1,2]]','[[1,1]]','[["private",42]]']) {
    const item=fixture();await item.create().availability(day('2026-10-24'));
    item.sqlite.prepare('UPDATE booking_occupancy_cache SET payload=?').run(content);
    await assert.rejects(item.create().availability(day('2026-10-24')),unavailable);
    assert.equal(item.state.calls.length,1);item.sqlite.close();
  }
  for(const value of [null,{}, {busyIntervals:'none'}, {busyIntervals:[{start:initial,end:initial}]}, {busyIntervals:[busy('2026-09-01T00:00:00+07:00','2026-09-02T00:00:00+07:00')]}]) {
    const item=fixture({provider:async()=>value});
    await assert.rejects(item.create().availability(day('2026-10-24')),unavailable);item.sqlite.close();
  }
});

test('invalid bounds and failed storage never call Calendar or invent an empty month', async () => {
  const item=fixture(); const wrapper=item.create();
  for(const bounds of [null,{}, {...day('2026-10-24'),designType:'plain'},day('2026-09-24'),day('2027-02-01'),{timeMin:'2026-10-24T25:00:00+07:00',timeMax:'2026-10-25T00:00:00+07:00'}, {timeMin:'2026-10-31T08:00:00+07:00',timeMax:'2026-11-01T08:00:00+07:00'}])await assert.rejects(wrapper.availability(bounds),invalid);
  assert.equal(item.state.calls.length,0);assert.equal(item.statements.length,0);
  item.env.BOOKING_DB={prepare(){throw new Error('Private storage');}};
  await assert.rejects(item.create().availability(day('2026-10-24')),unavailable);
  assert.equal(item.state.calls.length,0);item.sqlite.close();
});
