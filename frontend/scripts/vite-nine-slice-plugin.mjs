// Dev-only bridge so the /nine-slice-editor "Save" button can write the on-disk
// config and regenerate the asset — no copy-paste, no CLI, no round trip.
//
// `apply: 'serve'` means this middleware exists ONLY while `vite` is serving (dev
// mode). It is never part of a production build, so the write endpoint can't ship.
// The editor pairs this with import.meta.env.DEV to only show the button in dev.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { buildAsset, buildFamily, saveTheme, themeOf, assetsInTheme, normalizeConfigForAsset, writeGeneratedCss, loadConfig, logSave, CONFIG_DIR, REGISTRY } from './nine-slice-kit.mjs';

// The family a themed asset belongs to (member ids + labels), so the editor can say
// "editing the gold family — mode-button, button, panel" instead of "this asset".
function familyOf(asset) {
  const theme = themeOf(asset);
  if (!theme) return null;
  return { theme, members: assetsInTheme(theme).map((id) => ({ id, label: REGISTRY[id].label })) };
}

export function nineSliceDevSave() {
  return {
    name: 'nine-slice-dev-save',
    apply: 'serve',
    configureServer(server) {
      // Serve the on-disk config so the editor can hydrate from the real saved
      // state (not localStorage/defaults) — otherwise a fresh editor shows defaults
      // and Save overwrites the committed config with them. Also returns the family
      // (if the asset is themed) so the editor knows the shape is shared.
      server.middlewares.use('/__nine-slice/config', (req, res, next) => {
        if (req.method !== 'GET') return next();
        const send = (code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
        const asset = new URL(req.originalUrl || req.url, 'http://x').searchParams.get('asset');
        if (!REGISTRY[asset]) return send(400, { ok: false, error: `unknown asset "${asset}"` });
        try { send(200, { ok: true, config: loadConfig(asset), family: familyOf(asset) }); }
        catch { send(200, { ok: true, config: null, family: familyOf(asset) }); } // no config file yet → editor keeps defaults
      });
      server.middlewares.use('/__nine-slice/save', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
        req.on('end', () => {
          const send = (code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
          try {
            const raw = JSON.parse(body || '{}');
            if (!REGISTRY[raw.asset]) return send(400, { ok: false, error: `unknown asset "${raw.asset}" (known: ${Object.keys(REGISTRY).join(', ')})` });
            const cfg = normalizeConfigForAsset(raw.asset, raw);
            mkdirSync(CONFIG_DIR, { recursive: true });
            const theme = themeOf(raw.asset);
            let written;
            let scope;
            if (theme) {
              // Family save: the SHARED shape goes to the one theme file (every member
              // reads it); only this member's boxes go to its own file. Then rebake the
              // whole family so they stay in lockstep — you can't save one out of step.
              // Atomicity guard: verify every member's boxes file is readable BEFORE
              // mutating the shared theme, so a broken member can't leave the family
              // half-updated (shape changed on disk but PNGs not rebaked).
              for (const id of assetsInTheme(theme)) {
                if (id === raw.asset) continue; // this member's file is (re)written below
                try { JSON.parse(readFileSync(`${CONFIG_DIR}${id}.json`, 'utf8')); }
                catch (e) { return send(500, { ok: false, error: `family member "${id}" config is unreadable (${String(e?.message || e)}) — nothing written` }); }
              }
              saveTheme(theme, cfg);
              writeFileSync(`${CONFIG_DIR}${raw.asset}.json`, `${JSON.stringify({ asset: raw.asset, content: cfg.content, fill: cfg.fill }, null, 2)}\n`);
              written = buildFamily(theme);
              scope = `gold-family(${assetsInTheme(theme).join(', ')})`;
            } else {
              writeFileSync(`${CONFIG_DIR}${raw.asset}.json`, `${JSON.stringify({ asset: raw.asset, ...cfg }, null, 2)}\n`);
              written = buildAsset(raw.asset, cfg).written;
              scope = raw.asset;
            }
            const css = writeGeneratedCss();
            const entry = logSave('dev-save', raw.asset, cfg, [...written, css]);
            console.log(`[nine-slice] ${entry.ts} dev-save ${scope}: brackets=${JSON.stringify(cfg.brackets)} x${cfg.bracketScale} coolCorners=${JSON.stringify(cfg.coolCorners)} x${cfg.frameScale} pipes=${JSON.stringify(cfg.pipes)} content=${cfg.content} fill=${cfg.fill} -> ${written.join(', ')}`);
            // Push the fresh frames to the running app so a Save lands live everywhere —
            // set it here, then navigate the app and see it applied (no hard-refresh).
            server.ws.send({ type: 'full-reload' });
            send(200, { ok: true, asset: raw.asset, theme: theme ?? null, family: familyOf(raw.asset), written, css, warns: [], note: null });
          } catch (e) {
            send(500, { ok: false, error: String(e?.message || e) });
          }
        });
      });
    },
  };
}
