import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { drawableAssets } from '@chess-tactics/board-render';

// Art-vs-live fidelity compare as an embedded Studio Viewer kind (ADR-0058; supersedes the
// standalone-route decision of ADR-0005). Two comparison stages in `.al-lab-main`; both source
// pickers + the speculative-CSS editors in the one `.tileset-view-controls` panel; workspace tabs
// + kind selector in the `header` slot. Reached from the Pages catalog's "Compare to art"
// affordance. Each pane picks an option that is an ACCEPTED ART image (`art:<id>`), a LIVE app
// route in a same-origin iframe (`live:<route>`), or an arbitrary asset (`img:<url>`); for live
// panes you can type speculative CSS injected into the iframe (a proposed change shown live,
// nothing saved). Look-only — nothing committed is edited (ADR-0057 N/A).
//
// A curated option list + a chosen pair can still ride the URL (?opts=<b64>&l=&r=&lcss=&rcss=)
// and is read ON MOUNT so existing deep links load. The studio owns the URL after that, so a
// *modified* comparison no longer re-serialises to the URL — the live compare is unaffected.

type ArtEntry = { id: string; label: string; src: string; route: string };
const artEntries = (): ArtEntry[] => drawableAssets('artwork-reference').map((asset) => {
  const route = asset.behavior.route;
  const concept = asset.media.concept?.media;
  if (typeof route !== 'string' || !concept) throw new Error(`artwork reference ${asset.id} is incomplete`);
  return { id: asset.id, label: asset.label, src: concept.immutableUrl, route };
});
const ART: ArtEntry[] = new Proxy([], {
  get: (_target, property) => {
    const values = artEntries();
    const value = Reflect.get(values, property);
    return typeof value === 'function' ? value.bind(values) : value;
  },
});
const routes = (): string[] => Array.from(new Set(artEntries().map((entry) => entry.route)));
const LIVE_W = 1440;
const LIVE_H = 900;

type Opt = { label: string; src: string; css: string; link?: string };
type Source = { kind: 'art'; id: string } | { kind: 'live'; route: string } | { kind: 'img'; src: string };

function b64decode(b: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
}
function parseSource(s: string): Source {
  if (s.startsWith('live:')) return { kind: 'live', route: s.slice(5) };
  if (s.startsWith('img:')) return { kind: 'img', src: s.slice(4) };
  return { kind: 'art', id: s.startsWith('art:') ? s.slice(4) : s };
}
function defaultOpts(): Opt[] {
  return [
    ...ART.map((a) => ({ label: `ART · ${a.label}`, src: `art:${a.id}`, css: '' })),
    ...routes().map((r) => ({ label: `LIVE · ${r}`, src: `live:${r}`, css: '' })),
  ];
}
function inject(ifr: HTMLIFrameElement | null, css: string): void {
  if (!ifr) return;
  try {
    const doc = ifr.contentDocument;
    if (!doc) return;
    let el = doc.getElementById('__ac_spec') as HTMLStyleElement | null;
    if (!el) { el = doc.createElement('style'); el.id = '__ac_spec'; doc.head.appendChild(el); }
    el.textContent = css;
  } catch { /* transient access during navigation — re-runs on next change */ }
}

// The comparison STAGE only (no toolbar): a scaled live iframe or a concept image. Module-level
// so it never remounts (which would reload the iframe on every keystroke).
function CompareStage({ opt, css, reloadKey }: { opt: Opt; css: string; reloadKey: number }): ReactElement {
  const src = parseSource(opt.src);
  const stage = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const [imgAspect, setImgAspect] = useState(LIVE_H / LIVE_W);
  const [box, setBox] = useState({ w: 400, h: 250, scale: 0.28 });
  const aspect = src.kind === 'live' ? LIVE_H / LIVE_W : imgAspect;
  const isSpec = src.kind === 'live' && css.trim().length > 0;

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const recompute = () => {
      const pad = 40;
      const availW = Math.max(1, el.clientWidth - pad);
      const availH = Math.max(1, el.clientHeight - pad);
      const w = Math.min(availW, availH / aspect);
      setBox({ w: Math.round(w), h: Math.round(w * aspect), scale: w / LIVE_W });
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  useEffect(() => {
    if (src.kind === 'live') inject(iframe.current, css);
  }, [css, src.kind, reloadKey]);

  const art = src.kind === 'art' ? (ART.find((a) => a.id === src.id) ?? ART[0]) : null;

  return (
    <div className="ac-stage" ref={stage}>
      <div className={`ac-frame ${isSpec ? 'ac-frame-spec' : ''}`} style={{ width: box.w, height: box.h }}>
        {src.kind === 'art' && art ? (
          <img className="ac-art-img" src={art.src} alt={`${art.label} concept art`}
            onLoad={(e) => setImgAspect(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)} />
        ) : src.kind === 'live' ? (
          <iframe key={`${src.route}-${reloadKey}`} ref={iframe} title="Live" src={src.route}
            onLoad={() => inject(iframe.current, css)}
            style={{ width: LIVE_W, height: LIVE_H, transform: `scale(${box.scale})`, transformOrigin: 'top left', border: 0 }} />
        ) : src.kind === 'img' ? (
          <img className="ac-art-img" src={src.src} alt={opt.label}
            onLoad={(e) => setImgAspect(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)} />
        ) : null}
      </div>
    </div>
  );
}

type Pane = { idx: number; css: string };
type Config = { opts: Opt[]; left: Pane; right: Pane };

function readConfig(): Config {
  const p = new URLSearchParams(window.location.search);
  let opts = defaultOpts();
  const raw = p.get('opts');
  if (raw) {
    try {
      const parsed = JSON.parse(b64decode(decodeURIComponent(raw)));
      if (Array.isArray(parsed) && parsed.length) {
        opts = parsed.map((o) => ({ label: String(o.label ?? o.src ?? ''), src: String(o.src ?? ''), css: String(o.css ?? ''), link: o.link ? String(o.link) : undefined }));
      }
    } catch { /* malformed opts — fall back to the full list */ }
  }
  const idx = (v: string | null, def: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n < opts.length ? n : def;
  };
  const li = idx(p.get('l'), 0);
  const ri = idx(p.get('r'), Math.min(1, opts.length - 1));
  const dec = (v: string | null) => (v == null ? null : decodeURIComponent(v));
  const lcss = dec(p.get('lcss'));
  const rcss = dec(p.get('rcss'));
  return { opts, left: { idx: li, css: lcss ?? opts[li].css }, right: { idx: ri, css: rcss ?? opts[ri].css } };
}

export function ArtworkCompareLab({ header }: { header?: ReactNode }): ReactElement {
  const [cfg, setCfg] = useState(readConfig);
  const [reloadKey, setReloadKey] = useState(0);
  const { opts, left, right } = cfg;

  const pickLeft = (idx: number) => setCfg((c) => ({ ...c, left: { idx, css: c.opts[idx]?.css ?? '' } }));
  const pickRight = (idx: number) => setCfg((c) => ({ ...c, right: { idx, css: c.opts[idx]?.css ?? '' } }));
  const setLeftCss = (css: string) => setCfg((c) => ({ ...c, left: { ...c.left, css } }));
  const setRightCss = (css: string) => setCfg((c) => ({ ...c, right: { ...c.right, css } }));
  const resetLeftCss = () => setCfg((c) => ({ ...c, left: { ...c.left, css: c.opts[c.left.idx]?.css ?? '' } }));
  const resetRightCss = () => setCfg((c) => ({ ...c, right: { ...c.right, css: c.opts[c.right.idx]?.css ?? '' } }));
  const leftDrifted = left.css !== (opts[left.idx]?.css ?? '');
  const rightDrifted = right.css !== (opts[right.idx]?.css ?? '');
  const reload = () => setReloadKey((k) => k + 1);

  const leftLive = useMemo(() => parseSource(opts[left.idx]?.src ?? '').kind === 'live', [opts, left.idx]);
  const rightLive = useMemo(() => parseSource(opts[right.idx]?.src ?? '').kind === 'live', [opts, right.idx]);

  const paneControls = (side: 'left' | 'right', pane: Pane, live: boolean, drifted: boolean,
    pick: (i: number) => void, setCss: (s: string) => void, resetCss: () => void) => (
    <div className="ac-pane-controls">
      <label className="tileset-category-select">
        <span>{side === 'left' ? 'Left pane' : 'Right pane'}</span>
        <select value={pane.idx} onChange={(e) => pick(Number(e.target.value))} aria-label={`${side} pane source`}>
          {opts.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
        </select>
      </label>
      <div className="ac-edit-head">
        <span className="ac-css-label">{live ? 'Spec CSS' : 'CSS (pick a Live option)'}</span>
        <button type="button" className="ac-reset" onClick={resetCss} disabled={!drifted} title="Restore this pane's baked CSS baseline">↺ Reset</button>
      </div>
      <textarea className="ac-css" value={pane.css} onChange={(e) => setCss(e.target.value)} spellCheck={false} disabled={!live}
        placeholder=".brand-lockup-mark { height: 46px; }" />
    </div>
  );

  return (
    <>
      <style>{AC_CSS}</style>
      <section className="al-lab-main" aria-label="Art vs live compare">
        <div className="ac-panes">
          <CompareStage opt={opts[left.idx] ?? opts[0]} css={left.css} reloadKey={reloadKey} />
          <CompareStage opt={opts[right.idx] ?? opts[0]} css={right.css} reloadKey={reloadKey} />
        </div>
      </section>

      <aside className="tileset-view-controls" aria-label="Art compare controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            {paneControls('left', left, leftLive, leftDrifted, pickLeft, setLeftCss, resetLeftCss)}
            {paneControls('right', right, rightLive, rightDrifted, pickRight, setRightCss, resetRightCss)}
            <button type="button" className="tileset-view-action" onClick={reload}>↻ Reload live panes</button>
          </div>
        </section>
      </aside>
    </>
  );
}

const AC_CSS = `
.ac-panes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-self: stretch; min-height: 66vh; }
.ac-stage { min-width: 0; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 14px;
  background: #06080d; border: 1px solid #18233a; border-radius: 6px; }
.ac-frame { position: relative; overflow: hidden; background: #0b1220; border: 1px solid #233248; border-radius: 4px; }
.ac-frame-spec { border-color: #ffd479; }
.ac-art-img { width: 100%; height: 100%; object-fit: contain; display: block; image-rendering: pixelated; }
.ac-pane-controls { display: grid; gap: 6px; padding-bottom: 8px; border-bottom: 1px solid #1b2740; }
.ac-edit-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ac-css-label { font-size: 11px; letter-spacing: .06em; font-weight: 700; text-transform: uppercase; color: #8fa8cc; }
.ac-reset { flex: none; font-size: 11px; padding: 2px 8px; cursor: pointer; background: #0f1930; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 4px; }
.ac-reset:hover:not(:disabled) { background: #17223a; }
.ac-reset:disabled { opacity: .4; cursor: default; }
.ac-css { width: 100%; height: 64px; box-sizing: border-box; resize: vertical; font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px; line-height: 1.4; color: #dbe9ff; background: #0a0f1c; border: 1px solid #2a3c5e; border-radius: 4px; padding: 8px; }
.ac-css:disabled { opacity: .5; }
`;
