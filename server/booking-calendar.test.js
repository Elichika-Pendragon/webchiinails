import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarMonthDays, createBookingCalendar, moveCalendarDate } from '../src/scripts/booking-calendar.js';
import { getBookingDateBounds } from './booking.js';

const bounds = { minDate: '2026-10-20', maxDate: '2027-01-18' };

test('inline calendar has six Monday-first rows and disables dates outside inclusive bounds', () => {
  const october = calendarMonthDays('2026-10', bounds);
  assert.equal(october.length, 42);
  assert.deepEqual(october.slice(0, 3), [null, null, null]);
  assert.equal(october[3].date, '2026-10-01');
  assert.equal(october.find(day => day?.date === '2026-10-19').disabled, true);
  assert.equal(october.find(day => day?.date === '2026-10-20').disabled, false);
  const january = calendarMonthDays('2027-01', bounds);
  assert.equal(january.find(day => day?.date === '2027-01-18').disabled, false);
  assert.equal(january.find(day => day?.date === '2027-01-19').disabled, true);
  assert.deepEqual(calendarMonthDays('2026-13', bounds), []);
});

test('calendar date bounds and highlights are based on WIB even before UTC midnight', () => {
  const before = getBookingDateBounds({ now: '2026-10-20T16:59:59Z' });
  const after = getBookingDateBounds({ now: '2026-10-20T17:00:00Z' });
  assert.equal(before.minDate, '2026-10-20');
  assert.equal(after.minDate, '2026-10-21');
  assert.equal(calendarMonthDays('2026-10', after).find(day => day?.date === '2026-10-20').disabled, true);
});

test('calendar keyboard moves by day, week and Monday-first row without selecting a date', () => {
  assert.equal(moveCalendarDate('2026-10-21', 'ArrowLeft', bounds), '2026-10-20');
  assert.equal(moveCalendarDate('2026-10-21', 'ArrowRight', bounds), '2026-10-22');
  assert.equal(moveCalendarDate('2026-10-21', 'ArrowUp', bounds), '2026-10-20');
  assert.equal(moveCalendarDate('2026-10-21', 'ArrowDown', bounds), '2026-10-28');
  assert.equal(moveCalendarDate('2026-11-04', 'Home', bounds), '2026-11-02');
  assert.equal(moveCalendarDate('2026-11-04', 'End', bounds), '2026-11-08');
  assert.equal(moveCalendarDate('2027-01-18', 'ArrowRight', bounds), '2027-01-18');
  assert.equal(moveCalendarDate('2026-10-19', 'ArrowLeft', bounds), '2026-10-20');
  assert.equal(moveCalendarDate('2026-10-21', 'Tab', bounds), null);
  assert.equal(moveCalendarDate('2026-02-30', 'ArrowRight', bounds), null);
});

test('month movement retains the day where possible and handles leap years and bounds', () => {
  const longBounds = { minDate: '2024-01-01', maxDate: '2028-12-31' };
  assert.equal(moveCalendarDate('2026-10-31', 'PageDown', bounds), '2026-11-30');
  assert.equal(moveCalendarDate('2026-12-31', 'PageDown', bounds), '2027-01-18');
  assert.equal(moveCalendarDate('2024-01-31', 'PageDown', longBounds), '2024-02-29');
  assert.equal(moveCalendarDate('2024-02-29', 'PageDown', longBounds, true), '2025-02-28');
  assert.equal(moveCalendarDate('2026-11-30', 'PageUp', bounds), '2026-10-30');
});

// A small DOM fixture verifies the widget's own state and keyboard contract. It
// deliberately does not simulate layout or claim screen-reader/device coverage.
function calendarFixture() {
  let document;
  class Node {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.attrs = {};
      this.dataset = {};
      this.listeners = {};
      this.textContent = '';
      this.disabled = false;
      this.tabIndex = -1;
    }
    get lastChild() { return this.children.at(-1); }
    append(...nodes) {
      for (const node of nodes) {
        if (node.tagName === '#fragment') this.append(...node.children);
        else { node.parentElement = this; this.children.push(node); }
      }
    }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentElement = null; }); this.children = []; this.append(...nodes); }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return name === 'tabindex' ? String(this.tabIndex) : this.attrs[name] ?? null; }
    removeAttribute(name) { delete this.attrs[name]; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    focus() { document.activeElement = this; }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    matches(selector) {
      if (selector[0] === '#') return this.attrs.id === selector.slice(1);
      if (selector === 'button[data-date]') return this.tagName === 'button' && Boolean(this.dataset.date);
      if (selector === 'button[tabindex="0"]') return this.tagName === 'button' && this.tabIndex === 0;
      if (selector[0] === '[') return Object.hasOwn(this.attrs, selector.slice(1, -1));
      return this.tagName === selector;
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  document = { activeElement: null, createElement: tag => new Node(tag), createDocumentFragment: () => new Node('#fragment'), querySelector: () => label };
  const root = new Node('div');
  const label = new Node('label'); label.setAttribute('for', 'booking-date');
  const month = new Node('strong'); month.setAttribute('id', 'booking-calendar-month');
  const previous = new Node('button'); previous.setAttribute('data-calendar-previous', '');
  const next = new Node('button'); next.setAttribute('data-calendar-next', '');
  const body = new Node('tbody');
  const selection = new Node('p'); selection.setAttribute('data-calendar-selection', '');
  root.append(previous, month, next, body, selection);
  const changes = [];
  const input = { value: '', min: bounds.minDate, max: bounds.maxDate, hidden: false, dispatchEvent: event => changes.push(event.type) };
  const monthChanges = [];
  const originalDocument = globalThis.document;
  globalThis.document = document;
  let widget;
  try { widget = createBookingCalendar(root, input, { onMonthChange: month => monthChanges.push(month) }); }
  catch (error) { globalThis.document = originalDocument; throw error; }
  return {
    widget, root, input, document, body, changes, monthChanges, previous, next, selection,
    day: date => body.querySelectorAll('button[data-date]').find(button => button.dataset.date === date),
    click(button) { body.listeners.click({ target: button }); },
    key(button, key, extra = {}) { const event = { target: button, key, preventDefault() { this.prevented = true; }, ...extra }; body.listeners.keydown(event); return event; },
    close() { globalThis.document = originalDocument; },
  };
}

test('month summary blocks October 24 without replacing focused days and removal reopens it', () => {
  const page = calendarFixture();
  try {
    const day = page.day('2026-10-24');
    day.focus();
    assert.equal(page.widget.setAvailability({ month: '2026-10', status: 'ready', closedDates: ['2026-10-24'] }), true);
    assert.equal(page.day('2026-10-24'), day);
    assert.equal(page.document.activeElement, day);
    assert.equal(day.disabled, false, 'closed dates remain keyboard-explainable');
    assert.equal(day.getAttribute('aria-disabled'), 'true');
    assert.equal(day.dataset.availability, 'unavailable');
    assert.match(day.getAttribute('aria-label'), /24 Oktober 2026, tidak tersedia/);
    page.click(day);
    assert.equal(page.input.value, '');
    assert.deepEqual(page.changes, []);
    page.widget.setAvailability({ month: '2026-10', status: 'ready', closedDates: [] });
    assert.equal(day.getAttribute('aria-disabled'), null);
    assert.equal(day.dataset.availability, undefined);
    page.click(day);
    assert.equal(page.input.value, '2026-10-24');
    assert.deepEqual(page.changes, ['change']);
  } finally { page.close(); }
});

test('unknown, loading and failed summaries prevent selection while bounds stay natively disabled', () => {
  const page = calendarFixture();
  try {
    const day = page.day('2026-10-24');
    assert.deepEqual(page.monthChanges, [], 'initial rendering leaves fetching to the controller');
    assert.equal(day.dataset.availability, 'loading');
    assert.equal(page.root.getAttribute('aria-busy'), 'true');
    assert.equal(page.day('2026-10-19').disabled, true);
    for (const status of ['loading', 'error']) {
      page.widget.setAvailability({ month: '2026-10', status, closedDates: [] });
      page.click(day);
      assert.equal(page.key(day, 'Enter').prevented, true);
      assert.equal(page.key(day, ' ').prevented, true);
      assert.equal(page.input.value, '');
      assert.equal(day.dataset.availability, status);
    }
    assert.equal(page.root.getAttribute('aria-busy'), 'false');
    assert.match(day.getAttribute('aria-label'), /jadwal belum dapat diperiksa/);
    page.widget.setAvailability({ month: '2026-10', status: 'preview', closedDates: [] });
    assert.equal(day.getAttribute('aria-disabled'), null);
    page.click(day);
    assert.equal(page.input.value, '2026-10-24');
  } finally { page.close(); }
});

test('fully closed month retains roving keyboard focus without selecting unavailable dates', () => {
  const page = calendarFixture();
  try {
    const closedDates = calendarMonthDays('2026-10', bounds).filter(day => day && !day.disabled).map(day => day.date);
    page.widget.setAvailability({ month: '2026-10', status: 'ready', closedDates });
    const event = page.key(page.day('2026-10-24'), 'ArrowRight');
    const focused = page.day('2026-10-25');
    assert.equal(event.prevented, true);
    assert.equal(focused.tabIndex, 0);
    assert.equal(page.document.activeElement, focused);
    assert.equal(focused.getAttribute('aria-disabled'), 'true');
    assert.equal(page.input.value, '');
    page.click(focused);
    assert.deepEqual(page.changes, []);
  } finally { page.close(); }
});

test('month browsing ignores stale summaries and refresh retains the browsed month and focus', () => {
  const page = calendarFixture();
  try {
    page.widget.setAvailability({ month: '2026-10', status: 'ready', closedDates: [] });
    page.next.listeners.click();
    assert.equal(page.widget.getMonth(), '2026-11');
    assert.deepEqual(page.monthChanges, ['2026-11']);
    const day = page.day('2026-11-20');
    day.focus();
    assert.equal(page.widget.setAvailability({ month: '2026-10', status: 'ready', closedDates: [] }), false);
    assert.equal(day.dataset.availability, 'loading');
    page.widget.refresh();
    assert.equal(page.widget.getMonth(), '2026-11');
    assert.equal(page.day('2026-11-20'), day);
    assert.equal(page.document.activeElement, day);
    page.widget.setAvailability({ month: '2026-11', status: 'ready', closedDates: [] });
    page.key(page.day('2026-11-30'), 'ArrowRight');
    assert.equal(page.widget.getMonth(), '2026-12');
    assert.deepEqual(page.monthChanges, ['2026-11', '2026-12']);
    assert.equal(page.day('2026-12-01').dataset.availability, 'loading');
  } finally { page.close(); }
});

test('a selected date remains explicit when a refreshed summary closes it', () => {
  const page = calendarFixture();
  try {
    page.input.value = '2026-10-24';
    page.widget.refresh();
    const day = page.day('2026-10-24');
    page.widget.setAvailability({ month: '2026-10', status: 'ready', closedDates: ['2026-10-24'] });
    assert.equal(page.input.value, '2026-10-24');
    assert.equal(day.parentElement.getAttribute('aria-selected'), 'true');
    assert.equal(day.getAttribute('aria-disabled'), 'true');
    assert.equal(day.tabIndex, 0);
    assert.match(page.selection.textContent, /24 Oktober 2026/);
    assert.deepEqual(page.changes, []);
  } finally { page.close(); }
});
