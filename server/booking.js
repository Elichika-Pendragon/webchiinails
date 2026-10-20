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

export const BOOKING_DESIGNS = Object.freeze({
  plain: Object.freeze({ label: 'Plain / nail gel / removal', durations: Object.freeze([60]), defaultDurationMinutes: 60 }),
  simple: Object.freeze({ label: 'Simple nail art', durations: Object.freeze([60, 120]), defaultDurationMinutes: 120 }),
  'full-art': Object.freeze({ label: 'Full nail art', durations: Object.freeze([180, 240, 300]), defaultDurationMinutes: 180 }),
});

/** Public choices only. Legacy is a trusted persisted snapshot, never an input. */
export function normalizeBookingDesign(designType = 'simple', durationMinutes) {
  if (typeof designType !== 'string' || !Object.hasOwn(BOOKING_DESIGNS, designType)) return null;
  const design = BOOKING_DESIGNS[designType];
  const duration = durationMinutes === undefined ? design.defaultDurationMinutes
    : typeof durationMinutes === 'string' && /^(?:60|120|180|240|300)$/.test(durationMinutes) ? Number(durationMinutes) : durationMinutes;
  return typeof duration === 'number' && design.durations.includes(duration) ? { designType, durationMinutes: duration } : null;
}

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
  const design = normalizeBookingDesign(options.designType, options.durationMinutes);
  if (!design || (options.includeElapsed !== undefined && typeof options.includeElapsed !== 'boolean')) throw new RangeError('Choose a supported design and exact duration.');
  if (!Number.isInteger(stepMinutes) || stepMinutes < 1 || stepMinutes > BOOKING_DEFAULTS.durationMinutes) throw new RangeError('stepMinutes must be an integer from 1 to 120.');
  if (!Number.isInteger(horizonDays) || horizonDays < 0 || horizonDays > 3650) throw new RangeError('horizonDays must be an integer from 0 to 3650.');
  if (!Number.isSafeInteger(maxAmount) || maxAmount < 1) throw new RangeError('maxAmount must be a positive safe integer rupiah limit.');
  const minDate = new Date(now + OFFSET).toISOString().slice(0, 10);
  const minDay = calendarDay(minDate);
  if (minDay === null) throw new RangeError('now must be within supported calendar years 0001 to 9999.');
  const maxDay = minDay + horizonDays * DAY;
  const maxDate = new Date(maxDay).toISOString().slice(0, 10);
  if (calendarDay(maxDate) === null) throw new RangeError('Booking horizon exceeds supported calendar years.');
  return { now, stepMinutes, horizonDays, maxAmount, minDate, maxDate, minDay, maxDay, ...design, includeElapsed: options.includeElapsed === true };
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

function slot(day, minutes, durationMinutes) {
  const start = day + minutes * MINUTE - OFFSET;
  const end = start + durationMinutes * MINUTE;
  const time = clock(minutes);
  return {
    time,
    label: `${time.replace(':', '.')}–${clock(minutes + durationMinutes).replace(':', '.')} WIB`,
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
  if (digits.startsWith('+')) {
    if (!digits.startsWith('+628')) return null;
    digits = digits.slice(1);
  } else if (digits.startsWith('08')) digits = `62${digits.slice(1)}`;
  // Google libphonenumber's Indonesia mobile metadata (checked 2026-10-21):
  // national 8[1-35-9] + 7–10 digits, excluding 080 services/084.
  // https://github.com/google/libphonenumber/blob/master/resources/PhoneNumberMetadata.xml
  if (!/^628[1-35-9]\d{7,10}$/.test(digits)) return null;
  return digits;
}

/** Parse a digit-only form string; reject coercion, separators and exponents. */
export function parseRupiah(value, maxAmount = BOOKING_DEFAULTS.maxAmount) {
  if (!Number.isSafeInteger(maxAmount) || maxAmount < 1) throw new RangeError('maxAmount must be a positive safe integer.');
  if (typeof value !== 'string' || !value.length || value.length > 16 || /\D/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount <= maxAmount ? amount : null;
}

/** New requests: 10% DP, minimum Rp20,000, never above the agreed total. */
export function calculateDeposit(value, maxAmount = BOOKING_DEFAULTS.maxAmount) {
  const amount = parseRupiah(value, maxAmount);
  if (amount === null || amount <= 0) return null;
  return Math.min(amount, Math.max(20000, Math.floor(amount / 10) + (amount % 10 ? 1 : 0)));
}

/** Choose an upfront amount; orders at or below Rp20,000 are full payment. */
export function calculatePayment(value, paymentMode = 'deposit', maxAmount = BOOKING_DEFAULTS.maxAmount) {
  if (paymentMode !== 'deposit' && paymentMode !== 'full') return null;
  const amount = parseRupiah(value, maxAmount);
  const minimumDeposit = calculateDeposit(value, maxAmount);
  if (minimumDeposit === null) return null;
  const mode = amount <= 20000 ? 'full' : paymentMode;
  const deposit = mode === 'full' ? amount : minimumDeposit;
  return { paymentMode: mode, deposit, remainingBalance: amount - deposit, paymentPolicy: 'min20k-v2' };
}

/** Return operating hours for a valid YYYY-MM-DD date, or null. */
export function getOperatingHours(date, options = {}) {
  const day = calendarDay(date);
  const design = normalizeBookingDesign(options.designType, options.durationMinutes);
  if (day === null || !design) return null;
  const weekday = new Date(day).getUTCDay();
  const weekend = weekday === 0 || weekday === 6;
  return {
    day: DAY_NAMES[weekday],
    weekend,
    opens: '08:00',
    closes: weekend ? '12:00' : '17:00',
    lastStart: clock(Math.min(design.designType === 'full-art' ? 720 : weekend ? 600 : 840, (weekend ? 720 : 1020) - design.durationMinutes)),
    durationMinutes: design.durationMinutes,
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
  const hours = getOperatingHours(date, config);
  const opens = timeMinutes(hours.opens);
  const last = timeMinutes(hours.lastStart);
  const result = [];
  for (let minutes = opens; minutes <= last; minutes += config.stepMinutes) {
    const candidate = slot(day, minutes, config.durationMinutes);
    if ((candidate.start > config.now || config.includeElapsed) && !blocked.some(block => candidate.start < block.end && candidate.end > block.start)) result.push(candidate);
  }
  return result;
}

/**
 * Validate the customer fields and payment choice; derive the upfront amount.
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
  if (whatsapp === null) errors.whatsapp = 'Isi nomor HP Indonesia yang valid (08…, 628…, atau +628…), misalnya 081234567890.';
  const agreedPrice = parseRupiah(source.agreedPrice, config.maxAmount);
  const payment = calculatePayment(source.agreedPrice, source.paymentMode, config.maxAmount);
  if (source.paymentMode !== undefined && !['deposit', 'full'].includes(source.paymentMode)) errors.paymentMode = 'Pilih DP atau full payment.';
  const design = normalizeBookingDesign(source.designType, source.durationMinutes);
  if (!design) {
    if (typeof source.designType !== 'string' || !Object.hasOwn(BOOKING_DESIGNS, source.designType)) errors.designType = 'Pilih jenis desain yang valid.';
    errors.durationMinutes = 'Pilih durasi yang sudah disepakati dengan Chii.';
  }
  if (agreedPrice === null || agreedPrice <= 0) errors.agreedPrice = `Isi harga dalam angka Rupiah, maksimal ${config.maxAmount} (batas teknis formulir).`;
  const day = calendarDay(source.date);
  if (day === null) errors.date = 'Pilih tanggal yang valid.';
  else if (day < config.minDay || day > config.maxDay) errors.date = `Pilih tanggal antara ${config.minDate} dan ${config.maxDate}.`;
  const minutes = timeMinutes(source.time);
  let selected = null;
  if (minutes === null) errors.time = 'Pilih jam mulai yang valid.';
  else if (!errors.date && design) {
    selected = listBookingSlots(source.date, { ...options, ...design, includeElapsed: false }).find(candidate => candidate.time === source.time) ?? null;
    if (!selected) errors.time = 'Pilih jam mendatang dalam jam layanan yang tidak bertabrakan dengan jadwal yang diberikan.';
  }
  if (Object.keys(errors).length) return { valid: false, errors, value: null, preview: null };
  return {
    valid: true,
    errors,
    value: { name, whatsapp, agreedPrice, deposit: payment.deposit, paymentMode: payment.paymentMode, paymentPolicy: payment.paymentPolicy, ...design, date: source.date, time: source.time, quoteStatus: 'customer-declared' },
    preview: {
      ...selected,
      remainingBalance: payment.remainingBalance,
      durationMinutes: design.durationMinutes,
      timeZone: BOOKING_DEFAULTS.timeZone,
      quoteVerified: false,
      paymentVerified: false,
      availabilityVerified: false,
    },
  };
}
