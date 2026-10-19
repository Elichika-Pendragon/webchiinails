// Server/Worker only. KV stores ciphertext; the encryption key stays in secrets.
export const TOKEN_KEY = 'instagram:credentials:v1';
export const STATUS_KEY = 'instagram:status:v1';
export const DAY = 86400000;
const encoder = new TextEncoder();
const bytesToBase64 = bytes => btoa(String.fromCharCode(...bytes));
const base64ToBytes = text => Uint8Array.from(atob(text), character => character.charCodeAt(0));

async function keyFor(secret) {
  try {
    const bytes = base64ToBytes(secret || '');
    if (bytes.length !== 32) throw new Error();
    return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } catch { throw new Error('Invalid token-store encryption key'); }
}

function validate(record) {
  if (!record || typeof record.accessToken !== 'string' || !record.accessToken.trim() || record.accessToken.length > 8192
    || !/^\d+$/.test(record.accountId || '') || !Number.isFinite(record.expiresAt)
    || !Number.isFinite(record.refreshAfter) || !Number.isFinite(record.updatedAt)
    || record.refreshAfter >= record.expiresAt || record.updatedAt >= record.expiresAt) {
    throw new Error('Invalid stored Instagram credentials');
  }
  return record;
}

export async function encryptTokenRecord(record, secret) {
  validate(record);
  const key = await keyFor(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(TOKEN_KEY) }, key, encoder.encode(JSON.stringify(record)));
  return JSON.stringify({ version: 1, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) });
}

export async function decryptTokenRecord(value, secret) {
  try {
    const envelope = JSON.parse(value);
    if (envelope.version !== 1) throw new Error();
    const key = await keyFor(secret);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(envelope.iv), additionalData: encoder.encode(TOKEN_KEY) }, key, base64ToBytes(envelope.ciphertext));
    return validate(JSON.parse(new TextDecoder().decode(plaintext)));
  } catch { throw new Error('Cannot read Instagram token store'); }
}

export async function readTokenRecord(env) {
  if (!env.INSTAGRAM_TOKENS?.get) throw new Error('Instagram token store is not configured');
  const value = await env.INSTAGRAM_TOKENS.get(TOKEN_KEY);
  if (!value) throw new Error('Instagram token store must be initialized');
  const record = await decryptTokenRecord(value, env.TOKEN_ENCRYPTION_KEY);
  if (record.accountId !== env.INSTAGRAM_USER_ID) throw new Error('Instagram account does not match token store');
  return record;
}

export async function getInstagramCredentials(env, now = Date.now()) {
  if (!env.INSTAGRAM_TOKENS) return env; // Local development/legacy adapters only.
  const record = await readTokenRecord(env);
  if (record.expiresAt <= now) throw new Error('Instagram authorization expired');
  return { ...env, INSTAGRAM_ACCESS_TOKEN: record.accessToken };
}

export async function maintainInstagramToken(env, request = fetch, now = Date.now()) {
  const record = await readTokenRecord(env);
  if (record.expiresAt <= now) throw new Error('Instagram reconnect required');
  if (now < record.refreshAfter || now - record.updatedAt < DAY) return { state: 'current', expiresAt: record.expiresAt };
  const url = new URL('https://graph.instagram.com/refresh_access_token');
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', record.accessToken);
  let response;
  try {
    // Meta requires the token in this server-to-server query. Never log this URL.
    response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
  } catch { throw new Error('Instagram renewal temporarily unavailable'); }
  if (!response.ok) throw new Error(response.status === 400 || response.status === 401 ? 'Instagram reconnect may be required' : 'Instagram renewal temporarily unavailable');
  let payload;
  try { payload = await response.json(); } catch { throw new Error('Invalid Instagram renewal response'); }
  const lifetime = Number(payload.expires_in) * 1000;
  if (typeof payload.access_token !== 'string' || !payload.access_token.trim() || payload.access_token.length > 8192
    || !Number.isFinite(lifetime) || lifetime < 2 * DAY || lifetime > 366 * DAY) throw new Error('Invalid Instagram renewal response');
  const next = {
    accountId: record.accountId, accessToken: payload.access_token, updatedAt: now,
    expiresAt: now + lifetime, refreshAfter: now + Math.min(30 * DAY, lifetime / 2),
  };
  // A failed refresh/response never overwrites the previous usable credentials.
  await env.INSTAGRAM_TOKENS.put(TOKEN_KEY, await encryptTokenRecord(next, env.TOKEN_ENCRYPTION_KEY));
  return { state: 'renewed', expiresAt: next.expiresAt };
}
