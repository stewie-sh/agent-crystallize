import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkUpdates } from '../dist/updates.js';

test('update awareness caches npm checks and notifies once per version pair', async () => {
  const cachePath = join(mkdtempSync(join(tmpdir(), 'crystal-updates-')), 'cache.json');
  let calls = 0;
  let latest = '0.1.17';
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(new URL(url).hostname, 'registry.npmjs.org');
    assert.ok(options.signal);
    return Response.json({ version: latest });
  };
  const base = { current: '0.1.16', source: 'registry', cachePath, fetcher, now: 100_000_000 };
  const first = await checkUpdates(base);
  assert.equal(first.status, 'update_available');
  assert.equal(first.shouldNotify, true);
  assert.match(first.message, /Ask the user/);
  assert.equal((await checkUpdates(base)).shouldNotify, false);
  assert.equal(calls, 1);
  assert.equal((await checkUpdates({ ...base, now: base.now + 86_400_001 })).shouldNotify, false);
  latest = '0.1.18';
  assert.equal((await checkUpdates({ ...base, now: base.now + 172_800_002 })).shouldNotify, true);
});

test('offline failure is bounded by cache and does not fail the caller', async () => {
  const cachePath = join(mkdtempSync(join(tmpdir(), 'crystal-offline-')), 'cache.json');
  writeFileSync(cachePath, 'broken json');
  let calls = 0;
  const options = { current: '0.1.16', source: 'unknown', cachePath,
    fetcher: async () => { calls++; throw new Error('offline'); } };
  assert.equal((await checkUpdates(options)).status, 'unavailable');
  assert.equal((await checkUpdates(options)).shouldNotify, false);
  assert.equal(calls, 1);
});

test('local candidates and unknown versions never receive a blind upgrade instruction', async () => {
  for (const current of ['0.1.16', '0.2.0', '0.2.0-dev']) {
    const result = await checkUpdates({ current, source: 'local',
      cachePath: join(mkdtempSync(join(tmpdir(), 'crystal-local-')), 'cache.json'),
      fetcher: async () => Response.json({ version: '0.1.17' }) });
    if (current === '0.1.16') assert.match(result.message, /Verify local build/);
    else assert.equal(result.shouldNotify, false);
  }
});

test('invalid registry response is unavailable, not an upgrade', async () => {
  const result = await checkUpdates({ current: '0.1.16', source: 'registry',
    cachePath: join(mkdtempSync(join(tmpdir(), 'crystal-invalid-')), 'cache.json'),
    fetcher: async () => Response.json({ version: 'shell command' }) });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.shouldNotify, false);
});
