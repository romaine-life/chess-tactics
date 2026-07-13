// Dev-only persistence for code-owned Chrome Lab geometry.
//
// This boundary accepts only the installed v4 tuning model. It cannot write
// media, select a candidate version, or change live-media promotion state.
import { renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULTS_FILE = join(FRONTEND, 'config', 'chrome-lab-defaults.json');
const DEFAULTS_DISPLAY_PATH = 'config/chrome-lab-defaults.json';
const MAX_BODY_BYTES = 128 * 1024;

const ROLE_COMMON_KEYS = [
  'atomSourceId',
  'railSourceId',
  'atomTurns',
  'atomSize',
  'railThickness',
  'atomX',
  'atomY',
  'atomLeftX',
  'atomRightX',
  'atomTopY',
  'atomBottomY',
  'railUnderlap',
  'railFit',
  'fillMode',
  'fillTintId',
  'fillSurfaceId',
  'fillSurfaceScale',
  'fillBoxLeft',
  'fillBoxRight',
  'fillBoxTop',
  'fillBoxBottom',
  'contentPadding',
  'fillAlpha',
  'atomAlignMode',
  'atomAnchorX',
  'atomAnchorY',
  'atomCoverX',
  'atomCoverY',
  'atomPreviewMode',
];
const OUTER_TITLE_KEYS = [
  'titleTextX',
  'titleTextY',
  'titleFontSize',
  'titleVerticalAlign',
  'titleHorizontalAlign',
];
const DIVIDER_KEYS = [
  'atomSourceId',
  'atomTurns',
  'atomSize',
  'bandHeight',
  'atomX',
  'atomY',
  'atomLeftX',
  'atomRightX',
  'atomLeftY',
  'atomRightY',
  'atomAlignMode',
  'atomAnchorX',
  'atomAnchorY',
  'atomCoverX',
  'atomCoverY',
  'atomPreviewMode',
];

const ALIGNMENT_MODES = ['manual', 'rail-center', 'anchor', 'edge-cover'];
const PREVIEW_MODES = ['live', 'baked', 'debug'];
const FILL_MODES = ['none', 'tint', 'surface'];
const FILL_TINTS = ['night', 'blue', 'steel', 'oak', 'ember'];
const FILL_SURFACES = [
  'hybrid-stone-blue',
  'hybrid-wood-oak',
  'baseline-stone-blue',
  'baseline-wood-oak',
  'stone-slate-blue',
  'stone-grey',
];
const DIVIDER_SOURCE_IDS = ['ui/chrome/divider/joint.png', 'none'];

function send(res, status, value) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(value));
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, label, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  const missing = wanted.filter((key) => !Object.hasOwn(value, key));
  const unknown = actual.filter((key) => !wanted.includes(key));
  if (missing.length || unknown.length) {
    const details = [
      missing.length ? `missing ${missing.join(', ')}` : '',
      unknown.length ? `unknown ${unknown.join(', ')}` : '',
    ].filter(Boolean).join('; ');
    throw new Error(`${label} has invalid fields (${details})`);
  }
}

function finiteNumber(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function integer(value, label, min, max) {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return finiteNumber(value, label, min, max);
}

function choice(value, label, choices) {
  if (typeof value !== 'string' || !choices.includes(value)) {
    throw new Error(`${label} must be one of ${choices.join(', ')}`);
  }
  return value;
}

function installedSource(value, label, expected) {
  if (value !== expected) throw new Error(`${label} must use installed slot ${expected}`);
  return value;
}

function normalizedRole(value, role) {
  const label = role;
  const tune = record(value, label);
  const keys = role === 'outer' ? [...ROLE_COMMON_KEYS, ...OUTER_TITLE_KEYS] : ROLE_COMMON_KEYS;
  exactKeys(tune, label, keys);
  const atomSlot = `ui/chrome/${role}/atom.png`;
  const railSlot = `ui/chrome/${role}/rail.png`;
  const normalized = {
    atomSourceId: installedSource(tune.atomSourceId, `${label}.atomSourceId`, atomSlot),
    railSourceId: installedSource(tune.railSourceId, `${label}.railSourceId`, railSlot),
    atomTurns: integer(tune.atomTurns, `${label}.atomTurns`, 0, 3),
    atomSize: integer(tune.atomSize, `${label}.atomSize`, 1, 256),
    railThickness: integer(tune.railThickness, `${label}.railThickness`, 1, 96),
    atomX: finiteNumber(tune.atomX, `${label}.atomX`, -256, 256),
    atomY: finiteNumber(tune.atomY, `${label}.atomY`, -256, 256),
    atomLeftX: finiteNumber(tune.atomLeftX, `${label}.atomLeftX`, -256, 256),
    atomRightX: finiteNumber(tune.atomRightX, `${label}.atomRightX`, -256, 256),
    atomTopY: finiteNumber(tune.atomTopY, `${label}.atomTopY`, -256, 256),
    atomBottomY: finiteNumber(tune.atomBottomY, `${label}.atomBottomY`, -256, 256),
    railUnderlap: integer(tune.railUnderlap, `${label}.railUnderlap`, 0, 256),
    railFit: choice(tune.railFit, `${label}.railFit`, ['stretch', 'tile']),
    fillMode: choice(tune.fillMode, `${label}.fillMode`, FILL_MODES),
    fillTintId: choice(tune.fillTintId, `${label}.fillTintId`, FILL_TINTS),
    fillSurfaceId: choice(tune.fillSurfaceId, `${label}.fillSurfaceId`, FILL_SURFACES),
    fillSurfaceScale: integer(tune.fillSurfaceScale, `${label}.fillSurfaceScale`, 64, 1536),
    fillBoxLeft: finiteNumber(tune.fillBoxLeft, `${label}.fillBoxLeft`, -256, 256),
    fillBoxRight: finiteNumber(tune.fillBoxRight, `${label}.fillBoxRight`, -256, 256),
    fillBoxTop: finiteNumber(tune.fillBoxTop, `${label}.fillBoxTop`, -256, 256),
    fillBoxBottom: finiteNumber(tune.fillBoxBottom, `${label}.fillBoxBottom`, -256, 256),
    contentPadding: finiteNumber(tune.contentPadding, `${label}.contentPadding`, 0, 256),
    fillAlpha: finiteNumber(tune.fillAlpha, `${label}.fillAlpha`, 0, 1),
    atomAlignMode: choice(tune.atomAlignMode, `${label}.atomAlignMode`, ALIGNMENT_MODES),
    atomAnchorX: finiteNumber(tune.atomAnchorX, `${label}.atomAnchorX`, -256, 512),
    atomAnchorY: finiteNumber(tune.atomAnchorY, `${label}.atomAnchorY`, -256, 512),
    atomCoverX: finiteNumber(tune.atomCoverX, `${label}.atomCoverX`, -256, 512),
    atomCoverY: finiteNumber(tune.atomCoverY, `${label}.atomCoverY`, -256, 512),
    atomPreviewMode: choice(tune.atomPreviewMode, `${label}.atomPreviewMode`, PREVIEW_MODES),
  };
  if (role === 'outer') {
    return {
      ...normalized,
      titleTextX: finiteNumber(tune.titleTextX, `${label}.titleTextX`, -512, 512),
      titleTextY: finiteNumber(tune.titleTextY, `${label}.titleTextY`, -512, 512),
      titleFontSize: integer(tune.titleFontSize, `${label}.titleFontSize`, 1, 128),
      titleVerticalAlign: choice(tune.titleVerticalAlign, `${label}.titleVerticalAlign`, ['manual', 'center']),
      titleHorizontalAlign: choice(tune.titleHorizontalAlign, `${label}.titleHorizontalAlign`, ['manual', 'content-inset']),
    };
  }
  return normalized;
}

function normalizedDivider(value, label) {
  const tune = record(value, label);
  exactKeys(tune, label, DIVIDER_KEYS);
  return {
    atomSourceId: choice(tune.atomSourceId, `${label}.atomSourceId`, DIVIDER_SOURCE_IDS),
    atomTurns: integer(tune.atomTurns, `${label}.atomTurns`, 0, 3),
    atomSize: integer(tune.atomSize, `${label}.atomSize`, 1, 128),
    bandHeight: integer(tune.bandHeight, `${label}.bandHeight`, 1, 96),
    atomX: finiteNumber(tune.atomX, `${label}.atomX`, -256, 256),
    atomY: finiteNumber(tune.atomY, `${label}.atomY`, -256, 256),
    atomLeftX: finiteNumber(tune.atomLeftX, `${label}.atomLeftX`, -256, 256),
    atomRightX: finiteNumber(tune.atomRightX, `${label}.atomRightX`, -256, 256),
    atomLeftY: finiteNumber(tune.atomLeftY, `${label}.atomLeftY`, -256, 256),
    atomRightY: finiteNumber(tune.atomRightY, `${label}.atomRightY`, -256, 256),
    atomAlignMode: choice(tune.atomAlignMode, `${label}.atomAlignMode`, ALIGNMENT_MODES),
    atomAnchorX: finiteNumber(tune.atomAnchorX, `${label}.atomAnchorX`, -256, 512),
    atomAnchorY: finiteNumber(tune.atomAnchorY, `${label}.atomAnchorY`, -256, 512),
    atomCoverX: finiteNumber(tune.atomCoverX, `${label}.atomCoverX`, -256, 512),
    atomCoverY: finiteNumber(tune.atomCoverY, `${label}.atomCoverY`, -256, 512),
    atomPreviewMode: choice(tune.atomPreviewMode, `${label}.atomPreviewMode`, PREVIEW_MODES),
  };
}

/** Validate and canonicalize the complete version-4 persisted tuning document. */
export function normalizedChromeLabDefaults(raw) {
  const value = record(raw, 'payload');
  exactKeys(value, 'payload', ['target', 'outer', 'inner', 'dividers']);
  if (value.target !== 'level-editor') throw new Error('target must be level-editor');
  const dividers = record(value.dividers, 'dividers');
  exactKeys(dividers, 'dividers', ['outer', 'inner']);
  return {
    target: 'level-editor',
    outer: normalizedRole(value.outer, 'outer'),
    inner: normalizedRole(value.inner, 'inner'),
    dividers: {
      outer: normalizedDivider(dividers.outer, 'dividers.outer'),
      inner: normalizedDivider(dividers.inner, 'dividers.inner'),
    },
  };
}

/** Same-directory temp + rename keeps readers from observing a partial JSON file. */
export function writeChromeLabDefaults(file, raw) {
  const normalized = normalizedChromeLabDefaults(raw);
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(normalized, null, 2)}\n`, { flag: 'wx' });
    renameSync(temporary, file);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* temp may not exist or rename already succeeded */ }
    throw error;
  }
  return normalized;
}

export function chromeLabDefaultsSave({ defaultsFile = DEFAULTS_FILE } = {}) {
  return {
    name: 'chrome-lab-defaults-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__chrome-lab/defaults', (req, res, next) => {
        if (req.method !== 'POST') return next();
        const contentType = String(req.headers['content-type'] || '').toLowerCase();
        if (!contentType.startsWith('application/json')) {
          return send(res, 415, { ok: false, error: 'content-type must be application/json' });
        }
        let body = '';
        let tooLarge = false;
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
          if (tooLarge) return;
          body += chunk;
          if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
            tooLarge = true;
            body = '';
          }
        });
        req.on('end', () => {
          if (tooLarge) return send(res, 413, { ok: false, error: 'payload is too large' });
          try {
            writeChromeLabDefaults(defaultsFile, JSON.parse(body || '{}'));
            return send(res, 200, {
              ok: true,
              path: DEFAULTS_DISPLAY_PATH,
              mediaWritten: false,
              promotionChanged: false,
            });
          } catch (error) {
            return send(res, 400, { ok: false, error: String(error?.message || error) });
          }
        });
      });
    },
  };
}
