// Dev-only persistence for code-owned nine-slice geometry.
//
// This endpoint deliberately cannot read or write media, invoke a bake, update
// a catalog, or promote an asset. ADR-0085 permits deterministic geometry in
// Git; media candidates and accepted pointers remain backend-owned.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_DIR = join(FRONTEND, 'config', 'nine-slice');
const REGISTRY = JSON.parse(readFileSync(join(FRONTEND, 'config', 'nine-slice-registry.json'), 'utf8')).assets;
const CORNERS = ['tl', 'tr', 'bl', 'br'];
const SIDES = ['top', 'bottom', 'left', 'right'];

function send(res, status, value) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(value));
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function atomicJson(file, value) {
  atomicText(file, `${JSON.stringify(value, null, 2)}\n`);
}

function atomicText(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, value);
  renameSync(temporary, file);
}

function finiteNumber(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return value;
}

function integer(value, label, min, max) {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return finiteNumber(value, label, min, max);
}

function offsets(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return Object.fromEntries(CORNERS.map((corner) => {
    const entry = value[corner];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${label}.${corner} must be an object`);
    return [corner, {
      dx: integer(entry.dx, `${label}.${corner}.dx`, -64, 64),
      dy: integer(entry.dy, `${label}.${corner}.dy`, -64, 64),
    }];
  }));
}

function pipes(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('pipes must be an object');
  return Object.fromEntries(SIDES.map((side) => [side, integer(value[side], `pipes.${side}`, -64, 64)]));
}

export function normalizedGeometry(raw) {
  const asset = typeof raw?.asset === 'string' ? raw.asset : '';
  const record = REGISTRY[asset];
  if (!record || record.kind === 'bar' || record.kind === 'junction') throw new Error(`unknown editable frame "${asset}"`);
  return {
    asset,
    coolCorners: offsets(raw.coolCorners, 'coolCorners'),
    pipes: pipes(raw.pipes),
    frameScale: finiteNumber(raw.frameScale, 'frameScale', 0.25, 4),
    brackets: offsets(raw.brackets, 'brackets'),
    bracketScale: finiteNumber(raw.bracketScale, 'bracketScale', 0.25, 4),
    content: integer(raw.content, 'content', 0, 128),
    fill: integer(raw.fill, 'fill', 0, 128),
  };
}

function themeMembers(theme) {
  return Object.entries(REGISTRY).filter(([, record]) => record.theme === theme).map(([id, record]) => ({ id, label: record.label }));
}

function mergedConfig(asset) {
  const record = REGISTRY[asset];
  const member = readJson(join(CONFIG_DIR, `${asset}.json`));
  if (!record.theme) return member;
  return { asset, ...readJson(join(CONFIG_DIR, 'themes', `${record.theme}.json`)), ...member };
}

function generatedCss() {
  const lines = [
    '/* GENERATED from code-owned nine-slice geometry — no media or promotion state. */',
    ':root {',
  ];
  for (const [asset, record] of Object.entries(REGISTRY)) {
    if (!record.consume?.cssVar) continue;
    const config = mergedConfig(asset);
    const selector = record.consume.selector || 'opt-in geometry';
    lines.push(`  ${record.consume.cssVar}: ${Number(config.content || 0)}px; /* ${asset} · ${selector} */`);
    lines.push(`  --ns-fill-${asset}: ${Number(config.fill || 0)}px; /* ${asset} · backing-surface inset */`);
  }
  lines.push('}', '');
  return lines.join('\n');
}

export function nineSliceGeometrySave() {
  return {
    name: 'nine-slice-geometry-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__nine-slice/config', (req, res, next) => {
        if (req.method !== 'GET') return next();
        const asset = new URL(req.originalUrl || req.url, 'http://local').searchParams.get('asset') || '';
        if (!REGISTRY[asset]) return send(res, 400, { ok: false, error: `unknown asset "${asset}"` });
        try {
          const theme = REGISTRY[asset].theme || null;
          return send(res, 200, { ok: true, config: mergedConfig(asset), theme, family: theme ? { theme, members: themeMembers(theme) } : null });
        } catch (error) {
          return send(res, 500, { ok: false, error: String(error?.message || error) });
        }
      });
      server.middlewares.use('/__nine-slice/geometry', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 64 * 1024) req.destroy();
        });
        req.on('end', () => {
          try {
            const geometry = normalizedGeometry(JSON.parse(body || '{}'));
            const record = REGISTRY[geometry.asset];
            let written;
            if (record.theme) {
              atomicJson(join(CONFIG_DIR, 'themes', `${record.theme}.json`), {
                theme: record.theme,
                coolCorners: geometry.coolCorners,
                pipes: geometry.pipes,
                frameScale: geometry.frameScale,
                brackets: geometry.brackets,
                bracketScale: geometry.bracketScale,
              });
              atomicJson(join(CONFIG_DIR, `${geometry.asset}.json`), {
                asset: geometry.asset,
                content: geometry.content,
                fill: geometry.fill,
              });
              written = [`config/nine-slice/themes/${record.theme}.json`, `config/nine-slice/${geometry.asset}.json`];
            } else {
              atomicJson(join(CONFIG_DIR, `${geometry.asset}.json`), geometry);
              written = [`config/nine-slice/${geometry.asset}.json`];
            }
            atomicText(join(FRONTEND, 'src', 'generated', 'nine-slice.css'), generatedCss());
            written.push('src/generated/nine-slice.css');
            server.ws.send({ type: 'full-reload' });
            return send(res, 200, {
              ok: true,
              asset: geometry.asset,
              theme: record.theme || null,
              family: record.theme ? { theme: record.theme, members: themeMembers(record.theme) } : null,
              written,
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
