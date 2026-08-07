const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  RUN_CARD_GOLD_TIER_DIVIDER_GEOMETRY_RELATIVE_PATH,
  normalizeRunCardGoldTierDividerGeometry,
  saveRunCardGoldTierDividerGeometry,
} = require('./runCardGoldTierDividerGeometry');

test('normalizes only bounded integer coin geometry', () => {
  assert.deepEqual(normalizeRunCardGoldTierDividerGeometry({
    coin: { size: 24, x: 12, y: -2 },
  }), { coin: { size: 24, x: 12, y: -2 } });
  assert.throws(
    () => normalizeRunCardGoldTierDividerGeometry({ coin: { size: 41, x: 12, y: 3 } }),
    /coin\.size must be an integer from 16 through 40/,
  );
  assert.throws(
    () => normalizeRunCardGoldTierDividerGeometry({ coin: { size: 24, x: 12.5, y: 3 } }),
    /coin\.x must be an integer/,
  );
});

test('atomically saves only the fixed checkout-owned geometry file', async (t) => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-card-divider-'));
  t.after(() => fs.rmSync(repoDir, { recursive: true, force: true }));
  const target = path.join(repoDir, RUN_CARD_GOLD_TIER_DIVIDER_GEOMETRY_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '{}\n');

  const saved = await saveRunCardGoldTierDividerGeometry({
    repoDir,
    value: { coin: { size: 30, x: 9, y: 4 } },
  });

  assert.deepEqual(saved, { coin: { size: 30, x: 9, y: 4 } });
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), saved);
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ['runCardGoldTierDividerGeometry.json']);
});

test('the write route is limited to the named dev loopback and an administrator', () => {
  const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const start = server.indexOf("app.put('/api/studio/run-card-gold-tier-divider/defaults'");
  const end = server.indexOf("app.get('/ready'", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const route = server.slice(start, end);
  assert.match(route, /process\.env\.DEVCTL_MANAGED !== '1'/);
  assert.match(route, /!isLoopbackRequest\(req\)/);
  assert.match(route, /await requireAdmin\(req, res\)/);
  assert.match(route, /repoDir: process\.env\.DEVCTL_REPO_DIR/);
});
