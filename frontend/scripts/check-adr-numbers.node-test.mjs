import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import {
  BASELINE_PATH,
  adrNumberOwners,
  citedNumbers,
  compareAdrNumbers,
} from './check-adr-numbers.mjs';

const baseline = JSON.parse(readFileSync(new URL('./adr-duplicate-baseline.json', import.meta.url), 'utf8'));
const live = adrNumberOwners(readdirSync(new URL('../../docs/adr/', import.meta.url)));

test('the template owns no number, and every real ADR owns exactly one', () => {
  const owners = adrNumberOwners(['0000-adr-template.md', '0001-use-adrs.md', '0002-a-thing.md']);
  assert.deepEqual([...owners.keys()], ['0001', '0002']);
});

test('a number owned by two decisions fails, and says which two', () => {
  const owners = adrNumberOwners(['0100-first.md', '0100-second.md']);
  const failures = compareAdrNumbers(owners, new Map([['0100', ['src/a.ts']]]), { duplicates: [] });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /ADR-0100 is owned by 2 decisions/);
  assert.match(failures[0], /0100-first\.md/);
  assert.match(failures[0], /0100-second\.md/);
  assert.match(failures[0], /cited from 1 file\(s\), starting with src\/a\.ts/);
});

test('an uncited collision is still a failure, and says to fix it while that is free', () => {
  const owners = adrNumberOwners(['0100-first.md', '0100-second.md']);
  const failures = compareAdrNumbers(owners, new Map(), { duplicates: [] });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /not cited yet/);
});

test('a baselined collision passes, because the worklist is what holds it', () => {
  const owners = adrNumberOwners(['0100-first.md', '0100-second.md']);
  assert.deepEqual(compareAdrNumbers(owners, new Map(), { duplicates: ['0100'] }), []);
});

test('a number made unique must LEAVE the baseline, or the worklist never drains', () => {
  const owners = adrNumberOwners(['0100-only.md']);
  const failures = compareAdrNumbers(owners, new Map(), { duplicates: ['0100'] });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /ADR-0100 is unique again/);
  assert.match(failures[0], /worklist, not a permanent allowance/);
});

test('a citation no ADR owns fails — the reader cannot open it at all', () => {
  const owners = adrNumberOwners(['0100-only.md']);
  const failures = compareAdrNumbers(owners, new Map([['0999', ['src/b.ts']]]), { duplicates: [] });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /ADR-0999 is cited by src\/b\.ts but no ADR file owns that number/);
});

test('citations are read from prose and comments, and counted once per file', () => {
  const found = citedNumbers('// see ADR-0433 and ADR-0433, plus [ADR-0059](0059-x.md). Not ADR-12 or ADR-99999x.');
  assert.deepEqual([...found].sort(), ['0433', '0059'].sort());
});

test('the live tree passes its own guard', () => {
  assert.deepEqual(compareAdrNumbers(live, new Map(), baseline), []);
});

test('the baseline lists only numbers that are actually shared right now', () => {
  for (const number of baseline.duplicates) {
    assert.ok(
      (live.get(number) ?? []).length > 1,
      `${BASELINE_PATH} lists ADR-${number}, which is no longer shared`,
    );
  }
});

test('the guard does not scan its own fixtures, or it fails on itself', () => {
  // This file's ADR-0100 and ADR-0999 are invented numbers proving the failure branches fire. The
  // guard excludes its own two files for exactly that reason. Verified the honest way — by running
  // the real scan, which is what caught this in CI after a local pass on an untracked file.
  const source = readFileSync(new URL('./check-adr-numbers.mjs', import.meta.url), 'utf8');
  assert.match(source, /const SELF = new Set\(\[/);
  assert.match(source, /'frontend\/scripts\/check-adr-numbers\.node-test\.mjs',/);
  assert.match(source, /!SELF\.has\(f\)/);
});

test('the baseline is complete: no unlisted collision is hiding in the tree', () => {
  const listed = new Set(baseline.duplicates);
  for (const [number, files] of live) {
    if (files.length > 1) assert.ok(listed.has(number), `ADR-${number} is shared but unlisted`);
  }
});
