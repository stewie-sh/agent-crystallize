import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { transcriptAnchor } from '../dist/transcript.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const fixture = text => {
  const repo = mkdtempSync(join(tmpdir(), 'crystal-anchor-'));
  const path = join(repo, 'source.jsonl');
  writeFileSync(path, text);
  return { repo, path };
};
const run = (args, cwd) => spawnSync(process.execPath, [resolve('dist/index.js'), ...args], { cwd, encoding: 'utf8' });

test('transcript anchors hash exact inclusive bytes, UTF-8, CRLF and final unterminated line', () => {
  const { path } = fixture('first\r\nquyết định\r\nlast');
  const anchor = transcriptAnchor(pathToFileURL(path).href, '2-3');
  assert.equal(anchor.sha256, digest('quyết định\r\nlast'));
  assert.equal(anchor.bytes, Buffer.byteLength('quyết định\r\nlast'));
  assert.equal(anchor.lines, '2-3');
  assert.equal('body' in anchor, false);
});

test('anchors survive appends, detect edits, and handle read-chunk boundaries', () => {
  const { path } = fixture('a'.repeat(65535) + '\nselected\n');
  const a = transcriptAnchor(path, '2-2');
  assert.equal(a.sha256, digest('selected\n'));
  appendFileSync(path, 'later\n');
  assert.equal(transcriptAnchor(path, '2-2').sha256, a.sha256);
  writeFileSync(path, 'a'.repeat(65535) + '\nchanged\n');
  assert.notEqual(transcriptAnchor(path, '2-2').sha256, a.sha256);
});

test('invalid, missing, remote and oversized selections fail without inventing anchors', () => {
  const { path, repo } = fixture('one\n');
  for (const range of ['0-1', '2-1', '1:2', '1-1001', '9007199254740992-9007199254740992']) {
    assert.throws(() => transcriptAnchor(path, range), /one-based/);
  }
  assert.throws(() => transcriptAnchor(undefined, '1-1'), /requires/);
  assert.throws(() => transcriptAnchor('https://example.com/source', '1-1'), /absolute local/);
  assert.throws(() => transcriptAnchor('relative.jsonl', '1-1'), /absolute local/);
  assert.throws(() => transcriptAnchor(repo, '1-1'));
  assert.throws(() => transcriptAnchor(path, '2-2'), /not present/);
  writeFileSync(path, 'x'.repeat(256 * 1024 + 1));
  assert.throws(() => transcriptAnchor(path, '1-1'), /256 KiB/);
  writeFileSync(path, 'x'.repeat(1024 * 1024 + 1));
  assert.throws(() => transcriptAnchor(path, '2-2'), /1 MiB/);
});

test('checkpoint records verified range without raw text; read-only verification rejects changed source', () => {
  const { repo, path } = fixture('header\nPRIVATE_FIXTURE_NOT_FOR_CRYSTAL\nlast\n');
  const args = ['--transcript-uri', path, '--transcript-lines', '2-2'];
  const result = run(['checkpoint', '--repo', repo, '--body', 'Reviewed decision', ...args], repo);
  assert.equal(result.status, 0, result.stderr);
  const artifact = JSON.parse(result.stdout);
  const body = readFileSync(artifact.path, 'utf8');
  assert.match(body, /Transcript lines: 2-2/);
  assert.match(body, new RegExp(digest('PRIVATE_FIXTURE_NOT_FOR_CRYSTAL\n')));
  assert.equal(body.includes('PRIVATE_FIXTURE_NOT_FOR_CRYSTAL'), false);
  const verified = run(['transcript-anchor', ...args, '--expect-sha256', digest('PRIVATE_FIXTURE_NOT_FOR_CRYSTAL\n')], repo);
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).verified, true);
  assert.equal(verified.stdout.includes('PRIVATE_FIXTURE_NOT_FOR_CRYSTAL'), false);
  writeFileSync(path, 'header\nchanged\nlast\n');
  const changed = run(['transcript-anchor', ...args, '--expect-sha256', digest('PRIVATE_FIXTURE_NOT_FOR_CRYSTAL\n')], repo);
  assert.equal(changed.status, 1);
  assert.match(changed.stderr, /hash mismatch/);
  const validation = run(['validate', '--repo', repo, '--files', artifact.relativePath, '--fail-on-warnings'], repo);
  assert.equal(validation.status, 0, validation.stderr);
});

test('invalid range creates no checkpoint and standalone anchor writes no context artifacts', () => {
  const { repo, path } = fixture('line\n');
  const good = run(['transcript-anchor', '--transcript-uri', path, '--transcript-lines', '1-1'], repo);
  assert.equal(good.status, 0, good.stderr);
  assert.equal(existsSync(join(repo, '.agent-crystals')), false);
  const bad = run(['checkpoint', '--repo', repo, '--body', 'Example', '--transcript-uri', path, '--transcript-lines', '4-5'], repo);
  assert.equal(bad.status, 1);
  assert.equal(existsSync(join(repo, '.agent-crystals', 'checkpoints')), false);
  const unknown = run(['transcript-anchor', '--transcript-uri', path, '--transcript-lines', '1-1', '--typo'], repo);
  assert.equal(unknown.status, 1);
});
