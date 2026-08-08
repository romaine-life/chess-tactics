const fs = require('fs');
const path = require('path');

const RUN_CARD_GOLD_TIER_DIVIDER_GEOMETRY_RELATIVE_PATH = path.join(
  'frontend',
  'src',
  'ui',
  'shared',
  'runCardGoldTierDividerGeometry.json',
);

const RUN_CARD_GOLD_TIER_COIN_LIMITS = Object.freeze({
  size: Object.freeze({ min: 16, max: 40 }),
  x: Object.freeze({ min: 0, max: 32 }),
  y: Object.freeze({ min: -6, max: 16 }),
});

/**
 * The struck mark's share of the drawn coin, as whole percent. Unlike the seat above it, this
 * is not divider geometry: a coin is a coin wherever it is drawn, so this one number sizes the
 * mark on the gallery bands and on the card face alike (ADR-0530).
 */
const RUN_CARD_COIN_MARK_LIMITS = Object.freeze({
  fill: Object.freeze({ min: 40, max: 100 }),
});

const RUN_CARD_COIN_MARK_DEFAULT_FILL = 75;

function boundedInteger(value, key) {
  const limits = RUN_CARD_GOLD_TIER_COIN_LIMITS[key];
  if (!Number.isInteger(value) || value < limits.min || value > limits.max) {
    const error = new Error(`coin.${key} must be an integer from ${limits.min} through ${limits.max}`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function boundedMarkFill(value) {
  const limits = RUN_CARD_COIN_MARK_LIMITS.fill;
  if (!Number.isInteger(value) || value < limits.min || value > limits.max) {
    const error = new Error(`mark.fill must be an integer from ${limits.min} through ${limits.max}`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function normalizeRunCardGoldTierDividerGeometry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error('geometry must be an object');
    error.statusCode = 400;
    throw error;
  }
  const coin = value.coin;
  if (!coin || typeof coin !== 'object' || Array.isArray(coin)) {
    const error = new Error('geometry.coin must be an object');
    error.statusCode = 400;
    throw error;
  }
  // An older payload carries no mark, so it keeps the baseline rather than being refused: the
  // seat and the mark are tuned in the same instrument but are not one edit.
  const mark = value.mark === undefined ? {} : value.mark;
  if (!mark || typeof mark !== 'object' || Array.isArray(mark)) {
    const error = new Error('geometry.mark must be an object');
    error.statusCode = 400;
    throw error;
  }
  return {
    coin: {
      size: boundedInteger(coin.size, 'size'),
      x: boundedInteger(coin.x, 'x'),
      y: boundedInteger(coin.y, 'y'),
    },
    mark: {
      fill: boundedMarkFill(mark.fill === undefined ? RUN_CARD_COIN_MARK_DEFAULT_FILL : mark.fill),
    },
  };
}

async function saveRunCardGoldTierDividerGeometry({ repoDir, value }) {
  if (typeof repoDir !== 'string' || !path.isAbsolute(repoDir)) {
    const error = new Error('DEVCTL_REPO_DIR must identify the active checkout');
    error.statusCode = 500;
    throw error;
  }
  const root = path.resolve(repoDir);
  const target = path.resolve(root, RUN_CARD_GOLD_TIER_DIVIDER_GEOMETRY_RELATIVE_PATH);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error('divider geometry target escaped the active checkout');
    error.statusCode = 500;
    throw error;
  }
  const geometry = normalizeRunCardGoldTierDividerGeometry(value);
  const bytes = `${JSON.stringify(geometry, null, 2)}\n`;
  const temp = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await fs.promises.writeFile(temp, bytes, { encoding: 'utf8', flag: 'wx' });
    await fs.promises.rename(temp, target);
  } catch (error) {
    await fs.promises.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
  return geometry;
}

module.exports = {
  RUN_CARD_COIN_MARK_DEFAULT_FILL,
  RUN_CARD_COIN_MARK_LIMITS,
  RUN_CARD_GOLD_TIER_COIN_LIMITS,
  RUN_CARD_GOLD_TIER_DIVIDER_GEOMETRY_RELATIVE_PATH,
  normalizeRunCardGoldTierDividerGeometry,
  saveRunCardGoldTierDividerGeometry,
};
