import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { approvalInstructions, browserLaunch, openBrowser } from './codex-auth-browser.mjs';

const approvalUrl = 'https://auth.romaine.life/cli?user_code=VK-ALPHA-BRAVO';

test('approval instructions keep the complete fallback URL as plain text', () => {
  const lines = approvalInstructions({
    verification_uri_complete: approvalUrl,
    user_code: 'ALPHA-BRAVO',
  });

  assert.deepEqual(lines, [
    'Opening auth.romaine.life for this environment grant.',
    'Fallback approval URL:',
    approvalUrl,
    'Approval code: ALPHA-BRAVO',
  ]);
  assert.doesNotMatch(lines.join('\n'), /\u001b|\u0007/);
});

test('Windows uses the standard Command Prompt URL-opening path', () => {
  const launch = browserLaunch(approvalUrl, 'win32', {
    ComSpec: 'C:\\Windows\\System32\\cmd.exe',
  });

  assert.equal(launch.command, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(launch.args, [
    '/d',
    '/s',
    '/c',
    `start "" "${approvalUrl}"`,
  ]);
  assert.equal(launch.options.detached, false);
  assert.deepEqual(launch.options.stdio, ['ignore', 'ignore', 'pipe']);
  assert.equal(launch.options.windowsHide, true);
  assert.equal(launch.options.windowsVerbatimArguments, true);
  assert.doesNotMatch(launch.args.join(' '), /explorer|powershell/i);
});

test('the grant waits for browser launch diagnostics before polling', () => {
  const grantScript = readFileSync(new URL('./codex-auth-grant.mjs', import.meta.url), 'utf8');

  assert.match(grantScript, /await openBrowser\(request\.verification_uri_complete\);/);
});

test('browser launch errors preserve the plain fallback URL', async () => {
  const child = new EventEmitter();
  const warnings = [];

  const launched = openBrowser(approvalUrl, {
    platform: 'linux',
    spawnProcess: () => child,
    warn: (message) => warnings.push(message),
  });
  child.emit('error', new Error('launcher unavailable'));

  assert.equal(await launched, false);
  assert.deepEqual(warnings, [
    'Could not open the approval page automatically (launcher unavailable). Use the fallback URL above.',
  ]);
});

test('non-zero browser launcher exits include captured diagnostics', async () => {
  const child = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stderr.setEncoding = () => {};
  const warnings = [];

  const launched = openBrowser(approvalUrl, {
    platform: 'win32',
    spawnProcess: () => child,
    warn: (message) => warnings.push(message),
  });
  child.stderr.emit('data', 'no visible approval window');
  child.emit('exit', 7);

  assert.equal(await launched, false);
  assert.deepEqual(warnings, [
    'Could not open the approval page automatically (launcher exited 7: no visible approval window). Use the fallback URL above.',
  ]);
});

test('zero browser launcher exit reports success', async () => {
  const child = new EventEmitter();
  const launched = openBrowser(approvalUrl, {
    platform: 'win32',
    spawnProcess: () => child,
  });

  child.emit('exit', 0);
  assert.equal(await launched, true);
});
