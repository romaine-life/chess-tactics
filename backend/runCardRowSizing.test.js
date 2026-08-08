const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  RUN_CARD_ROW_SIZING_RELATIVE_PATH,
  normalizeRunCardRowSizing,
  saveRunCardRowSizing,
} = require('./runCardRowSizing');

test('normalizes only bounded integer card sizing', () => {
  assert.deepEqual(normalizeRunCardRowSizing({
    card: { size: 100, maxWidth: 560, gap: 16 },
  }), { card: { size: 100, maxWidth: 560, gap: 16 } });
  assert.throws(
    () => normalizeRunCardRowSizing({ card: { size: 100, maxWidth: 801, gap: 16 } }),
    /card\.maxWidth must be an integer from 200 through 800/,
  );
  assert.throws(
    () => normalizeRunCardRowSizing({ card: { size: 30, maxWidth: 560, gap: 16 } }),
    /card\.size must be an integer from 40 through 100/,
  );
  assert.throws(
    () => normalizeRunCardRowSizing({ card: { size: 100, maxWidth: 560, gap: 16.5 } }),
    /card\.gap must be an integer/,
  );
  assert.throws(() => normalizeRunCardRowSizing({}), /sizing\.card must be an object/);
});

test('atomically saves only the fixed checkout-owned sizing file', async (t) => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-card-row-sizing-'));
  t.after(() => fs.rmSync(repoDir, { recursive: true, force: true }));
  const target = path.join(repoDir, RUN_CARD_ROW_SIZING_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '{}\n');

  const saved = await saveRunCardRowSizing({
    repoDir,
    value: { card: { size: 85, maxWidth: 420, gap: 20 } },
  });

  assert.deepEqual(saved, { card: { size: 85, maxWidth: 420, gap: 20 } });
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), saved);
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ['runCardRowSizing.json']);
});

test('the write route is limited to the named dev loopback and an administrator', () => {
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const start = server.indexOf("app.put('/api/studio/run-card-row-sizing/defaults'");
  const end = server.indexOf("app.put('/api/studio/run-card-gold-tier-divider/defaults'", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const route = server.slice(start, end);
  assert.match(route, /process\.env\.DEVCTL_MANAGED !== '1'/);
  assert.match(route, /!isLoopbackRequest\(req\)/);
  assert.match(route, /await requireAdmin\(req, res\)/);
  assert.match(route, /repoDir: process\.env\.DEVCTL_REPO_DIR/);
});

test('the shipped baseline stays inside the published limits', () => {
  const baseline = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', RUN_CARD_ROW_SIZING_RELATIVE_PATH),
    'utf8',
  ));
  assert.deepEqual(normalizeRunCardRowSizing(baseline), baseline);
});
