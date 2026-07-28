import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCss, checkTsx } from './check-level-editor-chrome.mjs';

test('rejects the raw board-side dropdown regression', () => {
  const failures = checkTsx('src/ui/shared/BoardSizePanel.tsx', '<select aria-label="Width resize side"><option>Left</option></select>');
  assert.match(failures.join('\n'), /use HouseSelect/);
});

test('rejects unregistered buttons and direct box-role impersonation', () => {
  const failures = checkTsx('src/ui/shared/BoardSizePanel.tsx', '<><button>Go</button><div data-chrome-unit="inner-box" /></>');
  assert.match(failures.join('\n'), /button must inherit/);
  assert.match(failures.join('\n'), /shared ChromeBox component/);
});

test('accepts canonical controls', () => {
  const source = '<><HouseSelect value="left" options={[]} ariaLabel="Side" onChange={() => {}} /><button data-chrome-unit="inner-text-button">Go</button><InnerChromeBox /></>';
  assert.deepEqual(checkTsx('src/ui/shared/BoardSizePanel.tsx', source), []);
});

test('rejects bespoke framed control CSS', () => {
  assert.match(checkCss('.le-illegal-dropdown { background: #123; border: 1px solid red; }').join('\n'), /bespoke/);
});

test('rejects every retired native-select debt label without an allowlist', () => {
  for (const label of ['Selected zone', 'Fence artwork', 'Composite terrain footprint']) {
    const failures = checkTsx('src/ui/LevelEditor.tsx', `<select aria-label="${label}" />`);
    assert.match(failures.join('\n'), /use HouseSelect/);
  }
});
