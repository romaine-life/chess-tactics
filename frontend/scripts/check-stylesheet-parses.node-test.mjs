import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkStylesheet } from './check-stylesheet-parses.mjs';

const live = readFileSync(fileURLToPath(new URL('../src/style.css', import.meta.url)), 'utf8');

// A sheet big enough to clear the rule floor, so a fixture failure is about the thing under test.
const bulk = Array.from({ length: 3200 }, (_, index) => `.filler-${index} { color: #fff; }`).join('\n');
const REGIONS = `.settings-tab { color: #fff; }
.house-select-option { color: #fff; }
.play-detail-card { color: #fff; }
.chrome-divided-grid__row { color: #fff; }
.skirmish-board-lab { color: #fff; }
`;

test('the live stylesheet passes its own gate', () => {
  assert.deepEqual(checkStylesheet(live), []);
});

test('an escaped comment opener fails, and says what it costs', () => {
  const failures = checkStylesheet(`${REGIONS}${bulk}\n\\/* a comment that never opens */\n.after { color: #000; }\n`);
  assert.ok(failures.some((failure) => /begins with a backslash/.test(failure)));
});

test('a truncated sheet fails on the rule floor even when it parses cleanly', () => {
  const failures = checkStylesheet(`${REGIONS}.only { color: #fff; }`);
  assert.ok(failures.some((failure) => /under the 3000 floor/.test(failure)));
});

test('a sheet that stops before a load-bearing region names that region', () => {
  const withoutBoard = `.settings-tab { color: #fff; }
.house-select-option { color: #fff; }
.play-detail-card { color: #fff; }
.chrome-divided-grid__row { color: #fff; }
${bulk}`;
  const failures = checkStylesheet(withoutBoard);
  assert.ok(failures.some((failure) => /`\.skirmish-board-lab`/.test(failure)));
});

test('unparsable CSS is reported as unparsable, not as a missing region', () => {
  const failures = checkStylesheet('.broken { color: #fff;');
  assert.equal(failures.length, 1);
  assert.match(failures[0], /does not parse as CSS/);
});
