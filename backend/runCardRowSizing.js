const fs = require('fs');
const path = require('path');

const RUN_CARD_ROW_SIZING_RELATIVE_PATH = path.join(
  'frontend',
  'src',
  'ui',
  'runCardRowSizing.json',
);

// Mirrors RUN_CARD_ROW_SIZING_LIMITS in frontend/src/ui/runCardRowSizing.ts.
const RUN_CARD_ROW_SIZING_LIMITS = Object.freeze({
  size: Object.freeze({ min: 40, max: 100 }),
  maxWidth: Object.freeze({ min: 200, max: 800 }),
  gap: Object.freeze({ min: 0, max: 64 }),
});

function boundedInteger(value, key) {
  const limits = RUN_CARD_ROW_SIZING_LIMITS[key];
  if (!Number.isInteger(value) || value < limits.min || value > limits.max) {
    const error = new Error(`card.${key} must be an integer from ${limits.min} through ${limits.max}`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function normalizeRunCardRowSizing(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error('sizing must be an object');
    error.statusCode = 400;
    throw error;
  }
  const card = value.card;
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    const error = new Error('sizing.card must be an object');
    error.statusCode = 400;
    throw error;
  }
  return {
    card: {
      size: boundedInteger(card.size, 'size'),
      maxWidth: boundedInteger(card.maxWidth, 'maxWidth'),
      gap: boundedInteger(card.gap, 'gap'),
    },
  };
}

async function saveRunCardRowSizing({ repoDir, value }) {
  if (typeof repoDir !== 'string' || !path.isAbsolute(repoDir)) {
    const error = new Error('DEVCTL_REPO_DIR must identify the active checkout');
    error.statusCode = 500;
    throw error;
  }
  const root = path.resolve(repoDir);
  const target = path.resolve(root, RUN_CARD_ROW_SIZING_RELATIVE_PATH);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error('card row sizing target escaped the active checkout');
    error.statusCode = 500;
    throw error;
  }
  const sizing = normalizeRunCardRowSizing(value);
  const bytes = `${JSON.stringify(sizing, null, 2)}\n`;
  const temp = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await fs.promises.writeFile(temp, bytes, { encoding: 'utf8', flag: 'wx' });
    await fs.promises.rename(temp, target);
  } catch (error) {
    await fs.promises.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
  return sizing;
}

module.exports = {
  RUN_CARD_ROW_SIZING_LIMITS,
  RUN_CARD_ROW_SIZING_RELATIVE_PATH,
  normalizeRunCardRowSizing,
  saveRunCardRowSizing,
};
