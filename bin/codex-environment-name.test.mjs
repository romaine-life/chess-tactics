import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEnvironmentName } from './codex-environment-name.mjs';

test('normalizes a human feature label into one DNS label', () => {
  assert.equal(normalizeEnvironmentName('  New Campaign Tab  '), 'new-campaign-tab');
  assert.equal(normalizeEnvironmentName('Loading / Transition!'), 'loading-transition');
  assert.equal(normalizeEnvironmentName('already-valid'), 'already-valid');
});

test('collapses separators and enforces the DNS label length', () => {
  assert.equal(normalizeEnvironmentName('one___two---three'), 'one-two-three');
  assert.equal(normalizeEnvironmentName('a'.repeat(80)), 'a'.repeat(63));
});

test('rejects a label with no letters or numbers', () => {
  assert.throws(() => normalizeEnvironmentName(' --- '), /letter or number/);
});
