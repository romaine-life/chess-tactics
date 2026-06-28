import { type ReactElement } from 'react';

// Workshop for the top↔edge seam treatment, on the worst-case sand tile.
// Footprint is unchanged in every option (no grid-seating risk). Route: /seam-lab.

const VARIANTS: { key: string; title: string; blurb: string }[] = [
  { key: 'v0', title: 'Current', blurb: 'top pasted on the codexfilter block — hard seam' },
  { key: 'vA', title: 'Rim + lip', blurb: '1px darker edge + drape shadow under the top' },
  { key: 'vC', title: 'Palette-tied side', blurb: 'sides recolored to a darker tone of the top' },
  { key: 'vAC', title: 'Both', blurb: 'lip + palette-tied side' },
];
const DIR = '/assets/tiles/seam-lab';

export function SeamLab(): ReactElement {
  return (
    <section className="se">
      <style>{SE_CSS}</style>
      <header className="se-bar">
        <strong className="se-name">Seam workshop — sand</strong>
        <span className="se-hint">where the top meets the edge · same footprint in all options</span>
      </header>
      <div className="se-row">
        {VARIANTS.map((v) => (
          <div className="se-card" key={v.key}>
            <div className="se-card-head">{v.title}</div>
            <div className="se-stage">
              <img className="se-px" src={`${DIR}/sand-0-${v.key}.png`} alt={v.title} draggable={false} />
            </div>
            <div className="se-card-foot">{v.blurb}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const SE_CSS = `
.se { position: fixed; inset: 0; z-index: 5; display: flex; flex-direction: column;
  background: #0a0c12; color: #d7e6ff; font-family: var(--ds-font-sans, system-ui, sans-serif); }
.se-bar { display: flex; align-items: baseline; gap: 14px; padding: 10px 16px; background: #0d1626; border-bottom: 1px solid #1b2740; }
.se-name { font-size: 18px; font-weight: 700; color: #eaf3ff; }
.se-hint { font-size: 12px; color: #6f86ab; }
.se-row { flex: 1 1 auto; min-height: 0; display: flex; gap: 18px; padding: 24px; overflow: auto; align-items: flex-start; justify-content: center; }
.se-card { flex: 0 0 auto; width: 260px; display: flex; flex-direction: column; gap: 10px;
  background: #0c1322; border: 1px solid #1b2740; border-radius: 8px; padding: 14px; }
.se-card-head { text-align: center; font-size: 15px; font-weight: 700; color: #cfe6ff; }
.se-card-foot { text-align: center; font-size: 11px; color: #7f96bb; min-height: 28px; }
.se-stage { display: flex; align-items: center; justify-content: center; padding: 10px; border-radius: 6px; height: 360px;
  background-color: #14181f;
  background-image: linear-gradient(45deg, #1b212b 25%, transparent 25%), linear-gradient(-45deg, #1b212b 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #1b212b 75%), linear-gradient(-45deg, transparent 75%, #1b212b 75%);
  background-size: 18px 18px; background-position: 0 0, 0 9px, 9px -9px, -9px 0; }
.se-px { height: 100%; width: auto; object-fit: contain; display: block; image-rendering: pixelated; }
`;
