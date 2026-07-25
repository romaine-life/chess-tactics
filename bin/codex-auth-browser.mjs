import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WINDOWS_APPROVAL_URL_ENV = 'CODEX_AUTH_APPROVAL_URL';
const windowsLauncherPath = fileURLToPath(new URL('./codex-auth-browser.ps1', import.meta.url));
const OSC = '\u001b]8;;';
const STRING_TERMINATOR = '\u001b\\';

export const terminalHyperlink = (url) => {
  const safeUrl = String(url).replaceAll(/[\u0000-\u001f\u007f]/g, '');
  return `${OSC}${safeUrl}${STRING_TERMINATOR}${safeUrl}${OSC}${STRING_TERMINATOR}`;
};

export const approvalInstructions = ({ verification_uri_complete: approvalUrl, user_code: userCode }) => [
  'Opening auth.romaine.life for this environment grant.',
  'If the browser does not open, click this approval link:',
  terminalHyperlink(approvalUrl),
  `Approval code: ${userCode}`,
];

export const browserLaunch = (url, platform = process.platform, environment = process.env) => {
  if (platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        windowsLauncherPath,
      ],
      options: {
        detached: true,
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
        env: { ...environment, [WINDOWS_APPROVAL_URL_ENV]: url },
      },
    };
  }

  return {
    command: platform === 'darwin' ? 'open' : 'xdg-open',
    args: [url],
    options: { detached: true, stdio: 'ignore', windowsHide: true },
  };
};

export const openBrowser = (url, {
  platform = process.platform,
  environment = process.env,
  spawnProcess = spawn,
  warn = console.warn,
} = {}) => {
  const launch = browserLaunch(url, platform, environment);
  const child = spawnProcess(launch.command, launch.args, launch.options);
  let failureReported = false;
  let launcherError = '';
  if (child.stderr) {
    child.stderr.setEncoding?.('utf8');
    child.stderr.on('data', (chunk) => {
      launcherError = `${launcherError}${chunk}`.slice(-2_000);
    });
    child.stderr.unref?.();
  }
  child.once('error', (error) => {
    failureReported = true;
    warn(`Could not open the approval page automatically (${error.message}). Use the approval link above.`);
  });
  child.once('exit', (code) => {
    if (!failureReported && code !== 0) {
      const detail = launcherError.trim();
      const suffix = detail ? `: ${detail}` : '';
      warn(`Could not open the approval page automatically (launcher exited ${code}${suffix}). Use the approval link above.`);
    }
  });
  child.unref();
  return child;
};
