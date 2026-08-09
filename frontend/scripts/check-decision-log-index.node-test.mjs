import test from 'node:test';
import assert from 'node:assert/strict';
import { adrFileNames, checkIndex, decisionLogRows, run } from './check-decision-log-index.mjs';

const row = (number, file) => `| [${number}](${file}) | did a thing | accepted | 2026-01-01 |`;

test('the template owns no row, and every other ADR does', () => {
  assert.deepEqual(adrFileNames(['0000-adr-template.md', '0001-a.md', 'README.md', 'decision-log.md']), ['0001-a.md']);
});

test('a row is identified by its leading cell, not by links later in the row', () => {
  const source = [
    row('0001', '0001-a.md').replace('accepted', 'accepted; superseded by [0002](0002-b.md)'),
    row('0002', '0002-b.md'),
  ].join('\n');
  assert.deepEqual(decisionLogRows(source), [
    { number: '0001', file: '0001-a.md' },
    { number: '0002', file: '0002-b.md' },
  ]);
});

test('an ADR with no row fails', () => {
  const failures = checkIndex(['0001-a.md', '0002-b.md'], decisionLogRows(row('0001', '0001-a.md')));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /0002-b\.md has no decision-log row/);
});

test('a row pointing at a missing file fails', () => {
  const failures = checkIndex(['0001-a.md'], decisionLogRows(row('0001', '0001-renamed.md')));
  assert.equal(failures.length, 2); // the file lost its row AND the row lost its file
  assert.ok(failures.some((f) => /0001-renamed\.md, which does not exist/.test(f)));
});

test('two rows for one ADR fail', () => {
  const source = [row('0001', '0001-a.md'), row('0001', '0001-a.md')].join('\n');
  const failures = checkIndex(['0001-a.md'], decisionLogRows(source));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /has 2 decision-log rows/);
});

test('a row whose number disagrees with the file it links to fails', () => {
  const failures = checkIndex(['0001-a.md', '0002-b.md'], decisionLogRows([row('0001', '0001-a.md'), row('0003', '0002-b.md')].join('\n')));
  assert.ok(failures.some((f) => /\[0003\] links to 0002-b\.md, whose own number disagrees/.test(f)));
});

test('ADRs sharing a number are indexed separately, because filename is the identity', () => {
  const source = [row('0077', '0077-one.md'), row('0077', '0077-two.md')].join('\n');
  assert.deepEqual(checkIndex(['0077-one.md', '0077-two.md'], decisionLogRows(source)), []);
});

test('the live decision log is a complete index', () => {
  assert.deepEqual(run().failures, []);
});
