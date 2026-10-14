import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyHostedRelease } from './smoke-release.mjs';
const bytes = Buffer.from('reviewed');
const local = { content_sha256: 'current', release_date: '2026-10-14', files: Object.fromEntries(['index.html','data/hrm/index.json','data/hrm/income.csv'].map(name => [name, {sha256: createHash('sha256').update(bytes).digest('hex')}])) };
for (const stale of ['manifest', 'asset']) {
  test(`retries a successful HTTP response with stale ${stale}`, async () => {
    let waits = 0;
    await verifyHostedRelease(local, 'https://example.test/', {
      sleep: async () => { waits++; },
      fetch: async url => String(url).endsWith('release.json')
        ? Response.json(stale === 'manifest' && waits === 0 ? {...local, content_sha256:'old'} : local)
        : new Response(stale === 'asset' && waits === 0 ? 'old' : bytes),
    });
    assert.equal(waits, 1);
  });
}
test('persistent mismatches still block release', async () => {
  let waits = 0;
  await assert.rejects(verifyHostedRelease(local, 'https://example.test/', {
    sleep: async () => { waits++; },
    fetch: async () => Response.json({...local, content_sha256:'old'}),
  }), /Hosted release differs/);
  assert.equal(waits, 5);
});
