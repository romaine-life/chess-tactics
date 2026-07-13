import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  chromeLabDefaultsSave,
  normalizedChromeLabDefaults,
  writeChromeLabDefaults,
} from './vite-chrome-lab-defaults-plugin.mjs';

const commonRole = (role) => ({
  atomSourceId: `ui/chrome/${role}/atom.png`,
  railSourceId: `ui/chrome/${role}/rail.png`,
  atomTurns: role === 'outer' ? 0 : 1,
  atomSize: role === 'outer' ? 41 : 11,
  railThickness: role === 'outer' ? 24 : 7,
  atomX: -2,
  atomY: -3,
  atomLeftX: 0,
  atomRightX: 0,
  atomTopY: 0,
  atomBottomY: 0,
  railUnderlap: 8,
  railFit: role === 'outer' ? 'stretch' : 'tile',
  fillMode: role === 'outer' ? 'surface' : 'tint',
  fillTintId: 'blue',
  fillSurfaceId: 'baseline-stone-blue',
  fillSurfaceScale: 768,
  fillBoxLeft: 0,
  fillBoxRight: 0,
  fillBoxTop: 0,
  fillBoxBottom: 0,
  contentPadding: role === 'outer' ? 31 : 0,
  fillAlpha: role === 'outer' ? 0 : 0.82,
  atomAlignMode: 'manual',
  atomAnchorX: 6,
  atomAnchorY: 6,
  atomCoverX: 6,
  atomCoverY: 6,
  atomPreviewMode: 'live',
  ...(role === 'outer' ? {
    titleTextX: -7,
    titleTextY: 12,
    titleFontSize: 26,
    titleVerticalAlign: 'center',
    titleHorizontalAlign: 'content-inset',
  } : {}),
});

const divider = (bandHeight) => ({
  atomSourceId: 'ui/chrome/divider/joint.png',
  atomTurns: 0,
  atomSize: 17,
  bandHeight,
  atomX: 0,
  atomY: 0,
  atomLeftX: 0,
  atomRightX: 0,
  atomLeftY: 0,
  atomRightY: 0,
  atomAlignMode: 'rail-center',
  atomAnchorX: 8.5,
  atomAnchorY: 8.5,
  atomCoverX: 8.5,
  atomCoverY: 8.5,
  atomPreviewMode: 'live',
});

const valid = () => ({
  target: 'level-editor',
  outer: commonRole('outer'),
  inner: commonRole('inner'),
  dividers: {
    outer: divider(34),
    inner: {
      ...divider(7),
      atomSize: 11,
      atomX: 3.5,
      atomLeftX: -0.5,
    },
  },
});

function mountedHandler(defaultsFile) {
  let route = '';
  let handler = null;
  chromeLabDefaultsSave({ defaultsFile }).configureServer({
    middlewares: {
      use(nextRoute, nextHandler) {
        route = nextRoute;
        handler = nextHandler;
      },
    },
  });
  expect(route).toBe('/__chrome-lab/defaults');
  expect(handler).toBeTypeOf('function');
  return handler;
}

function request(handler, { method = 'POST', value, contentType = 'application/json' } = {}) {
  return new Promise((resolve, reject) => {
    const body = value === undefined ? '' : JSON.stringify(value);
    const req = Readable.from([body]);
    req.method = method;
    req.headers = { 'content-type': contentType };
    req.on('error', reject);
    const headers = {};
    const res = {
      statusCode: 0,
      setHeader(name, headerValue) { headers[name] = headerValue; },
      end(responseBody = '') {
        resolve({ status: this.statusCode, headers, body: JSON.parse(responseBody || '{}'), next: false });
      },
    };
    handler(req, res, () => resolve({ status: 0, headers, body: null, next: true }));
  });
}

describe('Chrome Lab v4 defaults persistence boundary', () => {
  it('accepts only the complete installed geometry model', () => {
    const payload = valid();
    expect(normalizedChromeLabDefaults(payload)).toEqual(payload);
    expect(() => normalizedChromeLabDefaults({ ...payload, divider: payload.dividers.outer }))
      .toThrow(/unknown divider/);
    expect(() => normalizedChromeLabDefaults({ ...payload, target: '../outside' }))
      .toThrow(/target must be level-editor/);
    expect(() => normalizedChromeLabDefaults({
      ...payload,
      outer: { ...payload.outer, frameWidth: 12 },
    })).toThrow(/unknown frameWidth/);
    expect(() => normalizedChromeLabDefaults({
      ...payload,
      dividers: {
        ...payload.dividers,
        inner: { ...payload.dividers.inner, atomSourceId: 'candidate-version-uuid' },
      },
    })).toThrow(/atomSourceId/);
    expect(() => normalizedChromeLabDefaults({
      ...payload,
      dividers: {
        ...payload.dividers,
        inner: { ...payload.dividers.inner, bandHeight: 0 },
      },
    })).toThrow(/bandHeight/);
    expect(normalizedChromeLabDefaults({
      ...payload,
      dividers: {
        ...payload.dividers,
        inner: { ...payload.dividers.inner, atomSourceId: 'none' },
      },
    }).dividers.inner.atomSourceId).toBe('none');
  });

  it('writes normalized JSON atomically without leaving a temporary file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'chrome-lab-defaults-'));
    const file = join(directory, 'chrome-lab-defaults.json');
    try {
      const payload = valid();
      expect(writeChromeLabDefaults(file, payload)).toEqual(payload);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(payload);
      expect(readFileSync(file, 'utf8').endsWith('\n')).toBe(true);
      expect(readdirSync(directory)).toEqual(['chrome-lab-defaults.json']);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('mounts a dev POST endpoint and never writes rejected state', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'chrome-lab-endpoint-'));
    const file = join(directory, 'chrome-lab-defaults.json');
    try {
      const handler = mountedHandler(file);
      expect((await request(handler, { method: 'GET' })).next).toBe(true);
      expect((await request(handler, { value: valid(), contentType: 'text/plain' })).status).toBe(415);

      const saved = await request(handler, { value: valid() });
      expect(saved).toMatchObject({
        status: 200,
        body: {
          ok: true,
          path: 'config/chrome-lab-defaults.json',
          mediaWritten: false,
          promotionChanged: false,
        },
      });
      const before = readFileSync(file, 'utf8');
      const rejected = valid();
      rejected.dividers.outer.atomSourceId = 'private-candidate';
      expect((await request(handler, { value: rejected })).status).toBe(400);
      expect(readFileSync(file, 'utf8')).toBe(before);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('has no media writer, candidate promotion, or backend mutation dependency', () => {
    const source = readFileSync(fileURLToPath(new URL('./vite-chrome-lab-defaults-plugin.mjs', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/public[\\/]assets|blob|media_versions/i);
    expect(source).not.toMatch(/acceptedVersion|registeredForProduction|promot(?:e|ion)\s*\(/i);
    expect(source).toContain("join(FRONTEND, 'config', 'chrome-lab-defaults.json')");
  });
});
