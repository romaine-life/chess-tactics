import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { approvalInstructions, browserLaunch, openBrowser, terminalHyperlink } from './codex-auth-browser.mjs';

const approvalUrl = 'https://auth.romaine.life/cli?user_code=VK-ALPHA-BRAVO';

test('approval instructions put the complete URL in an explicit terminal hyperlink', () => {
  const lines = approvalInstructions({
    verification_uri_complete: approvalUrl,
    user_code: 'ALPHA-BRAVO',
  });

  assert.deepEqual(lines, [
    'Opening auth.romaine.life for this environment grant.',
    'If the browser does not open, click this approval link:',
    terminalHyperlink(approvalUrl),
    'Approval code: ALPHA-BRAVO',
  ]);
  assert.match(lines[2], /^\u001b]8;;https:\/\/auth\.romaine\.life\//);
  assert.equal(lines[2].replaceAll(/\u001b]8;;.*?\u001b\\/g, ''), approvalUrl);
});

test('Windows launches the URL through its default protocol handler without Explorer', () => {
  const launch = browserLaunch(approvalUrl, 'win32', { PATH: 'test-path' });

  assert.equal(launch.command, 'powershell.exe');
  assert.equal(launch.args.includes('explorer.exe'), false);
  assert.equal(launch.args.includes('-WindowStyle'), false);
  assert.equal(launch.args.includes('-File'), true);
  assert.equal(launch.args.at(-1).endsWith('codex-auth-browser.ps1'), true);
  assert.deepEqual(launch.options.env, {
    PATH: 'test-path',
    CODEX_AUTH_APPROVAL_URL: approvalUrl,
  });
  assert.deepEqual(launch.options.stdio, ['ignore', 'ignore', 'pipe']);
  assert.equal(launch.options.windowsHide, true);
});

test('Windows hides only the helper console and verifies an active-desktop browser window was surfaced', () => {
  const powershellLauncher = readFileSync(new URL('./codex-auth-browser.ps1', import.meta.url), 'utf8');

  assert.match(powershellLauncher, /Start-Process[^\r\n]+-WindowStyle Normal/);
  assert.match(powershellLauncher, /IsWindowOnCurrentVirtualDesktop/);
  assert.match(powershellLauncher, /SetWindowPos/);
  assert.match(powershellLauncher, /throw "The browser command ran, but no new or auth-matching window appeared/);
  assert.doesNotMatch(powershellLauncher, /powershell\.exe|explorer\.exe/i);
});

test('browser launch errors preserve the printed-link fallback', () => {
  const child = new EventEmitter();
  child.unref = () => {};
  const warnings = [];

  openBrowser(approvalUrl, {
    platform: 'linux',
    spawnProcess: () => child,
    warn: (message) => warnings.push(message),
  });
  child.emit('error', new Error('launcher unavailable'));

  assert.deepEqual(warnings, [
    'Could not open the approval page automatically (launcher unavailable). Use the approval link above.',
  ]);
});

test('non-zero browser launcher exits preserve the printed-link fallback', () => {
  const child = new EventEmitter();
  child.unref = () => {};
  child.stderr = new EventEmitter();
  child.stderr.setEncoding = () => {};
  child.stderr.unref = () => {};
  const warnings = [];

  openBrowser(approvalUrl, {
    platform: 'win32',
    spawnProcess: () => child,
    warn: (message) => warnings.push(message),
  });
  child.stderr.emit('data', 'no visible approval window');
  child.emit('exit', 7);

  assert.deepEqual(warnings, [
    'Could not open the approval page automatically (launcher exited 7: no visible approval window). Use the approval link above.',
  ]);
});
