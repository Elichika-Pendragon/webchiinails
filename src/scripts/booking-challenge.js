const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise;

export class BookingChallengeError extends Error {
  constructor(code = 'CHALLENGE_UNAVAILABLE') { super(code); this.name = 'BookingChallengeError'; this.code = code; }
}

function loadTurnstile() {
  if (typeof window.turnstile?.render === 'function') return Promise.resolve(window.turnstile);
  if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => finish(false), 20000);
    let settled = false;
    const finish = success => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.onload = script.onerror = null;
      if (success && typeof window.turnstile?.render === 'function') resolve(window.turnstile);
      else { script.remove(); scriptPromise = null; reject(new BookingChallengeError()); }
    };
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    document.head.append(script);
  });
  return scriptPromise;
}

/** A token is fresh for each explicit Book attempt; it is never saved in a draft. */
export function createBookingChallenge({ api, container, load = loadTurnstile, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let generation = 0, widget = null, turnstile = null, pending = null, verifying = false;
  const remove = () => {
    if (widget !== null) { try { turnstile?.remove(widget); } catch {} }
    widget = null;
    if (container) container.hidden = true;
  };
  const cancel = () => {
    generation++;
    pending?.reject(new DOMException('Aborted', 'AbortError'));
    pending = null;
    verifying = false;
    remove();
  };
  const verify = async () => {
    if (verifying) throw new BookingChallengeError('CHALLENGE_IN_PROGRESS');
    verifying = true;
    const current = ++generation;
    try {
    const session = await api('/api/booking/admission');
    if (current !== generation) throw new DOMException('Aborted', 'AbortError');
    if (!session || !/^[A-Za-z0-9_-]{10,128}$/.test(session.siteKey || '') || !/^[a-f0-9]{64}$/.test(session.nonce || '')
      || session.action !== 'booking' || !Number.isSafeInteger(session.expiresAt) || session.expiresAt < 1) throw new BookingChallengeError();
    turnstile = await load();
    if (current !== generation) throw new DOMException('Aborted', 'AbortError');
    if (!container || typeof turnstile?.render !== 'function' || typeof turnstile.execute !== 'function') throw new BookingChallengeError();
    remove();
    container.hidden = false;
    return await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimer(() => finish(new BookingChallengeError('CHALLENGE_TIMEOUT')), 120000);
      const finish = (error, token) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        if (pending?.generation === current) pending = null;
        remove();
        if (error) reject(error);
        else resolve({ nonce: session.nonce, token });
      };
      pending = { generation: current, reject: error => finish(error) };
      try {
        widget = turnstile.render(container, {
          sitekey: session.siteKey, action: 'booking', cData: session.nonce,
          execution: 'execute', appearance: 'interaction-only', size: container.clientWidth < 300 ? 'compact' : 'flexible', theme: 'light',
          'response-field': false,
          callback: token => {
            if (current !== generation) return;
            if (typeof token !== 'string' || token.length < 1 || token.length > 2048) finish(new BookingChallengeError());
            else finish(null, token);
          },
          'error-callback': () => { finish(new BookingChallengeError()); return true; },
          'expired-callback': () => finish(new BookingChallengeError('CHALLENGE_EXPIRED')),
          'timeout-callback': () => finish(new BookingChallengeError('CHALLENGE_TIMEOUT')),
        });
        if (settled) { remove(); return; }
        if (widget === null || widget === undefined) throw new BookingChallengeError();
        turnstile.execute(widget);
      } catch { finish(new BookingChallengeError()); }
    });
    } finally { if (current === generation) verifying = false; }
  };
  return { verify, cancel };
}
