// The date grid uses UTC calendar arithmetic; its allowed days come from the
// shared WIB booking bounds. It never fetches or implies live availability.
const DAY = 86400000;
const isoDay = value => new Date(value).toISOString().slice(0, 10);

function dayStamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return null;
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && isoDay(stamp) === value ? stamp : null;
}

function shiftMonth(value, amount) {
  const stamp = dayStamp(value);
  if (stamp === null) return null;
  const date = new Date(stamp);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const end = new Date(date);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, end.getUTCDate()));
  return isoDay(date.getTime());
}

/** Six fixed Monday-first rows keep month browsing from moving the form. */
export function calendarMonthDays(month, { minDate, maxDate }) {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) return [];
  const first = dayStamp(`${month}-01`);
  const min = dayStamp(minDate);
  const max = dayStamp(maxDate);
  if (first === null || min === null || max === null || min > max) return [];
  const offset = (new Date(first).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const stamp = first + (index - offset) * DAY;
    const date = isoDay(stamp);
    return date.slice(0, 7) === month ? { date, day: new Date(stamp).getUTCDate(), disabled: stamp < min || stamp > max } : null;
  });
}

/** Keyboard movement is clamped to allowed days, including short months. */
export function moveCalendarDate(value, key, bounds, shift = false) {
  const stamp = dayStamp(value);
  const min = dayStamp(bounds.minDate);
  const max = dayStamp(bounds.maxDate);
  if (stamp === null || min === null || max === null || min > max) return null;
  const weekday = (new Date(stamp).getUTCDay() + 6) % 7;
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday };
  let target;
  if (key === 'PageUp' || key === 'PageDown') target = dayStamp(shiftMonth(value, (key === 'PageUp' ? -1 : 1) * (shift ? 12 : 1)));
  else if (Object.prototype.hasOwnProperty.call(offsets, key)) target = stamp + offsets[key] * DAY;
  else return null;
  if (target === null) return key === 'PageUp' ? bounds.minDate : bounds.maxDate;
  return isoDay(Math.max(min, Math.min(max, target)));
}

export function createBookingCalendar(root, input) {
  if (!root || !input) return null;
  const monthLabel = root.querySelector('#booking-calendar-month');
  const body = root.querySelector('tbody');
  const previous = root.querySelector('[data-calendar-previous]');
  const next = root.querySelector('[data-calendar-next]');
  const selection = root.querySelector('[data-calendar-selection]');
  const monthFormat = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const dateFormat = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  let bounds;
  let month = '';
  let focusDate = '';
  let lastValue = '';
  const valid = date => dayStamp(date) !== null && date >= bounds.minDate && date <= bounds.maxDate;
  const focusedButton = () => body.querySelector('button[tabindex="0"]');

  function render() {
    const monthText = monthFormat.format(new Date(`${month}-01T00:00:00Z`));
    if (monthLabel.textContent !== monthText) monthLabel.textContent = monthText;
    previous.disabled = month <= bounds.minDate.slice(0, 7);
    next.disabled = month >= bounds.maxDate.slice(0, 7);
    const fragment = document.createDocumentFragment();
    calendarMonthDays(month, bounds).forEach((day, index) => {
      if (index % 7 === 0) fragment.append(document.createElement('tr'));
      const cell = document.createElement('td');
      if (day) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.date = day.date;
        button.textContent = String(day.day);
        button.setAttribute('aria-label', dateFormat.format(new Date(`${day.date}T00:00:00Z`)));
        button.disabled = day.disabled;
        button.tabIndex = day.date === focusDate ? 0 : -1;
        if (day.date === bounds.minDate) button.setAttribute('aria-current', 'date');
        if (day.date === input.value) cell.setAttribute('aria-selected', 'true');
        cell.append(button);
      }
      fragment.lastChild.append(cell);
    });
    body.replaceChildren(fragment);
    const selectedText = valid(input.value) ? dateFormat.format(new Date(`${input.value}T00:00:00Z`)) : 'Belum ada tanggal dipilih.';
    if (selection.textContent !== selectedText) selection.textContent = selectedText;
  }

  function refresh() {
    const restoreFocus = body.contains(document.activeElement);
    bounds = { minDate: input.min, maxDate: input.max };
    if (dayStamp(bounds.minDate) === null || dayStamp(bounds.maxDate) === null) return;
    if (input.value && !valid(input.value)) input.value = '';
    if (!month || month < bounds.minDate.slice(0, 7) || month > bounds.maxDate.slice(0, 7) || input.value !== lastValue) {
      focusDate = input.value || bounds.minDate;
      month = focusDate.slice(0, 7);
    }
    if (!valid(focusDate)) focusDate = bounds.minDate;
    lastValue = input.value;
    render();
    if (restoreFocus) focusedButton()?.focus({ preventScroll: true });
  }

  function browse(amount) {
    month = shiftMonth(`${month}-01`, amount).slice(0, 7);
    const preferred = shiftMonth(focusDate, amount);
    focusDate = preferred < bounds.minDate ? bounds.minDate : preferred > bounds.maxDate ? bounds.maxDate : preferred;
    render();
  }
  previous.addEventListener('click', () => browse(-1));
  next.addEventListener('click', () => browse(1));
  body.addEventListener('click', event => {
    const button = event.target.closest('button[data-date]');
    if (!button || button.disabled) return;
    input.value = button.dataset.date;
    focusDate = input.value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    focusedButton()?.focus({ preventScroll: true });
  });
  body.addEventListener('keydown', event => {
    const button = event.target.closest('button[data-date]');
    if (!button || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = moveCalendarDate(button.dataset.date, event.key, bounds, event.shiftKey);
    if (!target) return;
    event.preventDefault();
    focusDate = target;
    month = target.slice(0, 7);
    render();
    focusedButton()?.focus({ preventScroll: true });
  });
  refresh();
  input.hidden = true;
  document.querySelector('#booking-date-label')?.removeAttribute('for');
  root.hidden = false;
  return { refresh, focus: () => focusedButton()?.focus(), setInvalid: invalid => root.setAttribute('aria-invalid', String(invalid)) };
}
