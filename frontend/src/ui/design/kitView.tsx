// The Kit branch of the asset catalog — the shared UI kit (generated glyphs +
// 9-slice frames) shown with a per-asset health badge from the gate. Data is the
// build-time manifest emitted by frontend/scripts/kit-manifest.mjs (re-run it to
// refresh after changing assets). This replaces the standalone kit dashboard:
// kit visibility lives in the one asset manager, not a parallel page.
import manifest from './kitManifest.json';

interface KitGlyph { name: string; url: string; w: number; h: number; magenta: number; semiPct: number; edge: number; pass: boolean; fails: string[] }
interface KitGroup { id: string; label: string; items: KitGlyph[] }
interface KitFrame { name: string; url: string; w: number; h: number }
interface KitManifest { generated: string; gate: string; summary: { pass: number; total: number; frames: number }; groups: KitGroup[]; frames: KitFrame[] }

const KIT = manifest as KitManifest;

function GlyphCell({ g }: { g: KitGlyph }): React.ReactElement {
  return (
    <figure className={`kit-cell ${g.pass ? '' : 'is-bad'}`} id={`kit-${g.name}`}>
      <span className="kit-thumb"><img src={g.url} alt={g.name} loading="lazy" /></span>
      <figcaption><b>{g.name}</b><span className="kit-dim">{g.w}×{g.h}</span></figcaption>
      {g.pass
        ? <span className="kit-badge is-ok" title={`magenta ${g.magenta} · AA ${g.semiPct}% · edge ${g.edge}`}>PASS</span>
        : <span className="kit-badge is-no" title="gate failures">{g.fails.join(' · ')}</span>}
    </figure>
  );
}

export function KitView(): React.ReactElement {
  const allOk = KIT.summary.pass === KIT.summary.total;
  return (
    <div className="catalog-home kit-view">
      <div className="kit-health">
        <span className={`kit-score ${allOk ? 'is-ok' : 'is-no'}`}>{KIT.summary.pass}/{KIT.summary.total}</span>
        <div>
          <strong>glyphs pass the asset gate</strong>
          <span className="kit-dim">{KIT.gate} · {KIT.frames.length} frames · generated {KIT.generated}</span>
        </div>
      </div>

      {KIT.groups.map((group) => (
        <section className="catalog-home-class kit-group" id={`kit-group-${group.id}`} aria-label={group.label} key={group.id}>
          <h3 className="catalog-home-class-label">
            {group.label}
            <span className="kit-count">{group.items.filter((i) => i.pass).length}/{group.items.length}</span>
          </h3>
          <div className="kit-grid">
            {group.items.map((g) => <GlyphCell g={g} key={g.name} />)}
          </div>
        </section>
      ))}

      <section className="catalog-home-class kit-group" id="kit-group-frames" aria-label="Frames and components">
        <h3 className="catalog-home-class-label">
          Frames &amp; components
          <span className="kit-count">{KIT.frames.length}</span>
        </h3>
        <p className="kit-note">9-slice chrome &amp; sprites — visual inventory (the glyph gate doesn’t apply; these are verified by the frame checks and in use on settings).</p>
        <div className="kit-grid">
          {KIT.frames.map((f) => (
            <figure className="kit-cell is-frame" key={f.name}>
              <span className="kit-thumb is-wide"><img src={f.url} alt={f.name} /></span>
              <figcaption><b>{f.name}</b><span className="kit-dim">{f.w}×{f.h}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}
