/**
 * Shared, dependency-free booking rules for the browser and a future server.
 * All scheduling uses fixed WIB (UTC+07:00), independent of the host time zone.
 * Callers must supply `now` (epoch milliseconds, Date, or ISO with an offset).
 * Busy/hold intervals use { start, end } in those same timestamp formats.
 * These helpers validate declared input and supplied intervals only: they do
 * not verify Jessica's quote, a payment, or live Google Calendar availability.
 */
export const BOOKING_DEFAULTS = Object.freeze({
  durationMinutes: 120,
  stepMinutes: 30, // Proposed interface interval; not a confirmed studio policy.
  horizonDays: 90,
  maxAmount: 10000000, // Technical input limit, not a salon price or deposit rule.
  timeZone: 'Asia/Jakarta',
  offsetMinutes: 420,
});

const MINUTE = 60000;
const DAY = 86400000;
const OFFSET = BOOKING_DEFAULTS.offsetMinutes * MINUTE;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function calendarDay(value) {
  if (typeof value !== 'string' || value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime();
}

function timeMinutes(value) {
  if (typeof value !== 'string' || value.length !== 5 || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

function epoch(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 8640000000000000) return value;
  if (value instanceof Date) return epoch(value.getTime());
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || match[0] !== value || calendarDay(match[1]) === null || timeMinutes(`${match[2]}:${match[3]}`) === null || Number(match[4] || 0) > 59) return null;
  if (match[6] !== 'Z') {
    const [hours, minutes] = match[6].slice(1).split(':').map(Number);
    if (hours > 23 || minutes > 59) return null;
  }
  const result = Date.parse(value);
  return Number.isSafeInteger(result) ? result : null;
}

function settings(options = {}) {
  const now = epoch(options.now);
  if (now === null) throw new TypeError('Supply a valid now timestamp with an explicit time zone.');
  const stepMinutes = options.stepMinutes ?? BOOKING_DEFAULTS.stepMinutes;
  const horizonDays = options.horizonDays ?? BOOKING_DEFAULTS.horizonDays;
  const maxAmount = options.maxAmount ?? BOOKING_DEFAULTS.maxAmount;
  if (!Number.isInteger(stepMinutes) || stepMinutes < 1 || stepMinutes > BOOKING_DEFAULTS.durationMinutes) throw new RangeError('stepMinutes must be an integer from 1 to 120.');
  if (!Number.isInteger(horizonDays) || horizonDays < 0 || horizonDays > 3650) throw new RangeError('horizonDays must be an integer from 0 to 3650.');
  if (!Number.isSafeInteger(maxAmount) || maxAmount < 1) throw new RangeError('maxAmount must be a positive safe integer rupiah limit.');
  const minDate = new Date(now + OFFSET).toISOString().slice(0, 10);
  const minDay = calendarDay(minDate);
  if (minDay === null) throw new RangeError('now must be within supported calendar years 0001 to 9999.');
  const maxDay = minDay + horizonDays * DAY;
  const maxDate = new Date(maxDay).toISOString().slice(0, 10);
  if (calendarDay(maxDate) === null) throw new RangeError('Booking horizon exceeds supported calendar years.');
  return { now, stepMinutes, horizonDays, maxAmount, minDate, maxDate, minDay, maxDay };
}

function intervals(options) {
  return ['busyIntervals', 'holdIntervals'].flatMap(key => {
    const values = options[key] ?? [];
    if (!Array.isArray(values)) throw new TypeError(`${key} must be an array of intervals.`);
    return values.map(value => {
      const start = epoch(value?.start);
      const end = epoch(value?.end);
      if (start === null || end === null || end <= start) throw new TypeError(`${key} contains an invalid interval.`);
      return { start, end };
    });
  });
}

function clock(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function localISO(timestamp) {
  return `${new Date(timestamp + OFFSET).toISOString().slice(0, 19)}+07:00`;
}

function slot(day, minutes) {
  const start = day + minutes * MINUTE - OFFSET;
  const end = start + BOOKING_DEFAULTS.durationMinutes * MINUTE;
  const time = clock(minutes);
  return {
    time,
    label: `${time.replace(':', '.')}–${clock(minutes + BOOKING_DEFAULTS.durationMinutes).replace(':', '.')} WIB`,
    start,
    end,
    startISO: localISO(start),
    endISO: localISO(end),
  };
}

/** Return 62-prefixed Indonesian mobile digits, or null. No codes are sent. */
export function normalizeWhatsApp(value) {
  if (typeof value !== 'string' || !value.length || value.length > 40 || /[^+\d ()-]/.test(value)) return null;
  let digits = value.trim().replace(/[ ()-]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('08')) digits = `62${digits.slice(1)}`;
  if (!/^628\d+$/.test(digits) || digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/** Parse a digit-only form string; reject coercion, separators and exponents. */
export function parseRupiah(value, maxAmount = BOOKING_DEFAULTS.maxAmount) {
  if (!Number.isSafeInteger(maxAmount) || maxAmount < 1) throw new RangeError('maxAmount must be a positive safe integer.');
  if (typeof value !== 'string' || !value.length || value.length > 16 || /\D/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount <= maxAmount ? amount : null;
}

/** Derive the fixed 10% DP, rounding fractional rupiah up to the next Rp1. */
export function calculateDeposit(value, maxAmount = BOOKING_DEFAULTS.maxAmount) {
  const amount = parseRupiah(value, maxAmount);
  if (amount === null || amount <= 0) return null;
  return Math.floor(amount / 10) + (amount % 10 ? 1 : 0);
}

/** Return operating hours for a valid YYYY-MM-DD date, or null. */
export function getOperatingHours(date) {
  const day = calendarDay(date);
  if (day === null) return null;
  const weekday = new Date(day).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  return {
    day: DAY_NAMES[weekday],
    weekend,
    opens: '08:00',
    closes: weekend ? '12:00' : '17:00',
    lastStart: weekend ? '10:00' : '14:00',
    durationMinutes: BOOKING_DEFAULTS.durationMinutes,
    timeZone: BOOKING_DEFAULTS.timeZone,
  };
}

/** Inclusive WIB calendar-day bounds; passing now keeps this deterministic. */
export function getBookingDateBounds(options) {
  const { minDate, maxDate } = settings(options);
  return { minDate, maxDate };
}

/**
 * List future starts within hours, excluding only the supplied busy/hold data.
 * With no intervals this is an hours-only preview, not live availability.
 */
export function listBookingSlots(date, options = {}) {
  const config = settings(options);
  const blocked = intervals(options);
  const day = calendarDay(date);
  if (day === null || day < config.minDay || day > config.maxDay) return [];
  const hours = getOperatingHours(date);
  const opens = timeMinutes(hours.opens);
  const last = Math.min(timeMinutes(hours.lastStart), timeMinutes(hours.closes) - BOOKING_DEFAULTS.durationMinutes);
  const result = [];
  for (let minutes = opens; minutes <= last; minutes += config.stepMinutes) {
    const candidate = slot(day, minutes);
    if (candidate.start > config.now && !blocked.some(block => candidate.start < block.end && candidate.end > block.start)) result.push(candidate);
  }
  return result;
}

/**
 * Validate the five editable customer fields and derive DP from the total.
 * Legacy/customer-supplied deposit values are ignored. A valid result is a declared
 * booking preview only. The future API must validate again and verify quote,
 * availability and provider payment separately before confirming a booking.
 */
export function validateBooking(input, options = {}) {
  const config = settings(options);
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f<>]/.test(name)) errors.name = 'Isi nama 2–80 karakter tanpa tanda < atau >.';
  const whatsapp = normalizeWhatsApp(source.whatsapp);
  if (whatsapp === null) errors.whatsapp = 'Isi nomor WhatsApp Indonesia, misalnya 081234567890.';
  const agreedPrice = parseRupiah(source.agreedPrice, config.maxAmount);
  const deposit = calculateDeposit(source.agreedPrice, config.maxAmount);
  if (agreedPrice === null || agreedPrice <= 0) errors.agreedPrice = `Isi harga dalam angka Rupiah, maksimal ${config.maxAmount} (batas teknis formulir).`;
  const day = calendarDay(source.date);
  if (day === null) errors.date = 'Pilih tanggal yang valid.';
  else if (day < config.minDay || day > config.maxDay) errors.date = `Pilih tanggal antara ${config.minDate} dan ${config.maxDate}.`;
  const minutes = timeMinutes(source.time);
  let selected = null;
  if (minutes === null) errors.time = 'Pilih jam mulai yang valid.';
  else if (!errors.date) {
    selected = listBookingSlots(source.date, options).find(candidate => candidate.time === source.time) ?? null;
    if (!selected) errors.time = 'Pilih jam mendatang dalam jam layanan yang tidak bertabrakan dengan jadwal yang diberikan.';
  }
  if (Object.keys(errors).length) return { valid: false, errors, value: null, preview: null };
  return {
    valid: true,
    errors,
    value: { name, whatsapp, agreedPrice, deposit, date: source.date, time: source.time, quoteStatus: 'customer-declared' },
    preview: {
      ...selected,
      remainingBalance: agreedPrice - deposit,
      durationMinutes: BOOKING_DEFAULTS.durationMinutes,
      timeZone: BOOKING_DEFAULTS.timeZone,
      quoteVerified: false,
      paymentVerified: false,
      availabilityVerified: false,
    },
  };
}
