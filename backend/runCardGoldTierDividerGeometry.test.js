const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  RUN_CARD_COIN_MARK_DEFAULT_FILL,
  RUN_CARD_COIN_MARK_LIMITS,
  RUN_CARD_GOLD_TIER_DIVIDER_GEOMETRY_RELATIVE_PATH,
  normalizeRunCardGoldTierDividerGeometry,
  saveRunCardGoldTierDividerGeometry,
} = require('./runCardGoldTierDividerGeometry');

test('normalizes only bounded integer coin geometry', () => {
  assert.deepEqual(normalizeRunCardGoldTierDividerGeometry({
    coin: { size: 24, x: 12, y: -2 },
  }), { coin: { size: 24, x: 12, y: -2 }, mark: { fill: RUN_CARD_COIN_MARK_DEFAULT_FILL } });
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
    value: { coin: { size: 30, x: 9, y: 4 }, mark: { fill: 82 } },
  });

  assert.deepEqual(saved, { coin: { size: 30, x: 9, y: 4 }, mark: { fill: 82 } });
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), saved);
  assert.deepEqual(fs.readdirSync(path.dirname(target)), ['runCardGoldTierDividerGeometry.json']);
});

test('the struck mark is a bounded share of the coin, and an older payload keeps the baseline', () => {
  const seat = { size: 30, x: 9, y: 4 };
  // The seat and the mark are tuned in one instrument but are not one edit, so a payload from
  // before the mark existed still saves rather than being refused (ADR-0530).
  assert.deepEqual(
    normalizeRunCardGoldTierDividerGeometry({ coin: seat }),
    { coin: seat, mark: { fill: RUN_CARD_COIN_MARK_DEFAULT_FILL } },
  );
  for (const fill of [RUN_CARD_COIN_MARK_LIMITS.fill.min, RUN_CARD_COIN_MARK_LIMITS.fill.max]) {
    assert.equal(normalizeRunCardGoldTierDividerGeometry({ coin: seat, mark: { fill } }).mark.fill, fill);
  }
  for (const fill of [RUN_CARD_COIN_MARK_LIMITS.fill.min - 1, RUN_CARD_COIN_MARK_LIMITS.fill.max + 1, 75.5, '75']) {
    assert.throws(
      () => normalizeRunCardGoldTierDividerGeometry({ coin: seat, mark: { fill } }),
      /mark\.fill must be an integer/,
    );
  }
  assert.throws(() => normalizeRunCardGoldTierDividerGeometry({ coin: seat, mark: [] }), /geometry\.mark must be an object/);
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
