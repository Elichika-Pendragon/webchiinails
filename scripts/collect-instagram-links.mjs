import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { normalizeInstagramLinks, refreshInstagramLinks } from '../server/instagram-links.js';

// One-shot prototype. Run hourly only after an unattended collection source is verified.
const args = process.argv.slice(2);
const output = resolve(args[0] || 'tmp/instagram-links/snapshot.json');
const inputIndex = args.indexOf('--links');
let previous;
try { previous = JSON.parse(await readFile(output, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
let collect;
if (inputIndex !== -1) {
  const urls = JSON.parse(await readFile(resolve(args[inputIndex + 1]), 'utf8'));
  if (!Array.isArray(urls)) throw new Error('Expected an array of public profile-grid hrefs');
  collect = async () => normalizeInstagramLinks(urls);
}
const snapshot = await refreshInstagramLinks(previous, { collect });
await mkdir(dirname(output), { recursive: true });
await writeFile(`${output}.pending`, `${JSON.stringify(snapshot, null, 2)}\n`);
await rename(`${output}.pending`, output);
console.log(JSON.stringify({ status: snapshot.status, links: snapshot.posts.length,
  lastAttemptAt: snapshot.lastAttemptAt, lastSuccessAt: snapshot.lastSuccessAt, output }));
if (snapshot.status !== 'fresh') process.exitCode = 2;
