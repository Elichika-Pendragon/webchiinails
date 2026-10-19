// Run locally after privately filling .env.local. Output contains ciphertext only.
import { mkdir, writeFile } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { DAY, encryptTokenRecord } from '../server/instagram-tokens.js';

try {
  const env = { ...loadEnv('production', process.cwd(), ''), ...process.env };
  const now = Date.now();
  const expiresAt = Date.parse(env.INSTAGRAM_TOKEN_EXPIRES_AT || '');
  if (!Number.isFinite(expiresAt) || expiresAt <= now + 2 * DAY) throw new Error();
  const ciphertext = await encryptTokenRecord({
    accountId: env.INSTAGRAM_USER_ID, accessToken: env.INSTAGRAM_ACCESS_TOKEN,
    updatedAt: now, expiresAt,
    refreshAfter: Math.max(now + DAY, Math.min(now + 30 * DAY, expiresAt - 7 * DAY)),
  }, env.TOKEN_ENCRYPTION_KEY);
  await mkdir('.private', { recursive: true });
  await writeFile('.private/instagram-token.json', ciphertext, { mode: 0o600 });
  console.log('Encrypted seed saved to .private/instagram-token.json. Upload privately to KV; no token was printed.');
} catch {
  console.error('Seed failed. Check private token, numeric account ID, 32-byte base64 encryption key and actual expiry (>2 days away).');
  process.exitCode = 1;
}
