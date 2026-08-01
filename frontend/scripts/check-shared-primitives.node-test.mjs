import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCss, checkNet, checkTsx } from './check-shared-primitives.mjs';

test('rejects raw registered chrome buttons outside the canonical renderer', () => {
  const failures = checkTsx('src/ui/Feature.tsx', '<button data-chrome-unit="inner-text-button">Go</button>');
  assert.equal(failures.length, 1);
});

test('accepts canonical shared control construction', () => {
  const source = '<><ChromeButton unit="inner-text-button">Go</ChromeButton><ChoiceGroup value="a" options={[]} onChange={() => {}} ariaLabel="Pick" /><StudioCatalogCard title="A" onSelect={() => {}} /></>';
  assert.deepEqual(checkTsx('src/ui/Feature.tsx', source), []);
});

test('rejects positional row geometry and copied request helpers', () => {
  assert.equal(checkCss('.settings-row + .settings-row { padding: 2px; }').length, 1);
  assert.equal(checkNet('src/net/copied.ts', 'async function request<T>() {}').length, 1);
});
