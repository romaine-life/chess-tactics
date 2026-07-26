import { spawn } from 'node:child_process';

export const approvalInstructions = ({
  verification_uri_complete: approvalUrl,
  user_code: userCode,
}) => [
  'Opening auth.romaine.life for this environment grant.',
  'Fallback approval URL:',
  approvalUrl,
  `Approval code: ${userCode}`,
];

const cmdQuoted = (value) => `"${String(value).replaceAll('"', '""')}"`;

export const browserLaunch = (url, platform = process.platform, environment = process.env) => {
  if (platform === 'win32') {
    const command = `start "" ${cmdQuoted(url)}`;
    return {
      command: environment.ComSpec || environment.COMSPEC || 'cmd.exe',
      args: ['/d', '/s', '/c', command],
      options: {
        detached: false,
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
        windowsVerbatimArguments: true,
      },
    };
  }

  return {
    command: platform === 'darwin' ? 'open' : 'xdg-open',
    args: [url],
    options: { detached: false, stdio: 'ignore', windowsHide: true },
  };
};

export const openBrowser = async (url, {
  platform = process.platform,
  environment = process.env,
  spawnProcess = spawn,
  warn = console.warn,
} = {}) => {
  const launch = browserLaunch(url, platform, environment);
  let child;
  try {
    child = spawnProcess(launch.command, launch.args, launch.options);
  } catch (error) {
    warn(`Could not open the approval page automatically (${error.message}). Use the fallback URL above.`);
    return false;
  }

  let launcherError = '';
  if (child.stderr) {
    child.stderr.setEncoding?.('utf8');
    child.stderr.on('data', (chunk) => {
      launcherError = `${launcherError}${chunk}`.slice(-2_000);
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    child.once('error', (error) => {
      settled = true;
      warn(`Could not open the approval page automatically (${error.message}). Use the fallback URL above.`);
      resolve(false);
    });
    child.once('exit', (code) => {
      if (settled) return;
      const detail = launcherError.trim();
      const suffix = detail ? `: ${detail}` : '';
      if (code !== 0) {
        warn(`Could not open the approval page automatically (launcher exited ${code}${suffix}). Use the fallback URL above.`);
      }
      resolve(code === 0);
    });
  });
};
