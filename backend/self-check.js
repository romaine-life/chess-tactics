// The image's self-test (`--self-test`, which pipeline-templates' web image check runs on a
// read-only container): the image holds a complete frontend build (its page and every script
// and stylesheet of its own that the page loads), the trainer bundle and the board renderer,
// and every entry point the deployment starts parses. Its result is the exit code.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
// Loading the log also proves this image's Node loads @romaine-life/logline, an ES module,
// with require().
const { log } = require('./log');

const app = path.join(__dirname, '..');
const failures = [];
const nonEmptyDir = (dir) => fs.existsSync(dir) && fs.readdirSync(dir).length > 0;

const dist = process.env.FRONTEND_DIR || path.join(app, 'frontend', 'dist');
try {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  // The build's own code is under /app-code/; /assets/ is live media served from storage, never
  // part of the image.
  const assets = [...html.matchAll(/(?:src|href)="(\/app-code\/[^"]+)"/g)].map((m) => m[1]);
  if (!assets.some((p) => p.endsWith('.js'))) failures.push('the page loads no script');
  if (!assets.some((p) => p.endsWith('.css'))) failures.push('the page loads no stylesheet');
  for (const asset of assets) {
    const file = path.join(dist, asset);
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) failures.push(`${asset} is missing or empty`);
  }
} catch (error) {
  failures.push(`frontend build: ${error.message}`);
}
if (!nonEmptyDir(path.join(app, 'frontend', 'trainer-bundle'))) failures.push('the trainer bundle is missing');
if (!nonEmptyDir(path.join(app, 'packages', 'board-render', 'dist'))) failures.push('the board renderer build is missing');
for (const entry of ['server.js', 'supervisor.js', 'train-worker.mjs', 'solve-worker.mjs']) {
  const result = spawnSync(process.execPath, ['--check', path.join(__dirname, entry)], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${entry} doesn't parse: ${(result.stderr || '').trim().split('\n')[0]}`);
}

if (failures.length) {
  log.error('chess-tactics self-test failed', { failures: failures.join('; ') });
  process.exitCode = 1;
} else {
  log.info('chess-tactics self-test passed');
}
