import { type ReactElement, type ReactNode, type CSSProperties } from 'react';
import { SURFACE_ASSETS } from './surfaceCatalog';

// Read-only catalog grid for background surfaces. Each card shows the texture *tiled* (the
// way it renders behind panels) rather than the raw single tile, so you read it as a surface.
// Reuses the shared studio card classes so it matches the Tiles/Units grids.
export function SurfaceLibraryStudio({
  search,
  zoom,
  selected,
  onSelect,
}: {
  search: string;
  zoom: number;
  selected?: string;
  onSelect: (name: string) => void;
}): ReactElement {
  const q = search.trim().toLowerCase();
  const visible = SURFACE_ASSETS.filter((s) => !q || [s.label, s.approach, s.material].join(' ').toLowerCase().includes(q));
  return (
    <div className="tileset-studio-grid" aria-label="Surfaces">
      {visible.map((s) => (
        <button
          key={s.name}
          type="button"
          className={`tileset-studio-card ${s.name === selected ? 'is-selected' : ''}`.trim()}
          onClick={() => onSelect(s.name)}
          aria-pressed={s.name === selected}
          title={`${s.label} — tiled surface`}
        >
          <span className="tileset-studio-card-image" style={{ '--tile-zoom': zoom } as CSSProperties}>
            <span
              className="surface-swatch"
              style={{ backgroundImage: `url("${s.file}")`, backgroundSize: `${Math.round(110 * zoom)}px` } as CSSProperties}
            />
          </span>
          <span className="tileset-studio-card-meta">
            <span className="tileset-studio-card-text">
              <strong>{s.label}</strong>
              <em>{s.material}</em>
            </span>
          </span>
        </button>
      ))}
      {visible.length === 0 ? <p className="tileset-studio-empty">No surfaces match.</p> : null}
    </div>
  );
}

// The read-only Viewer for a single surface — shown big, both in a framed panel (the way it
// renders behind chrome) and as a bare tiled field, with a Details readout. Mirrors AssetLab.
export function SurfaceViewer({ name, header }: { name?: string; header?: ReactNode }): ReactElement {
  const s = SURFACE_ASSETS.find((x) => x.name === name) ?? SURFACE_ASSETS[0];
  const tiled = (px: number): CSSProperties => ({ backgroundImage: `url("${s.file}")`, backgroundSize: `${px}px`, backgroundRepeat: 'repeat', backgroundPosition: 'top left', imageRendering: 'pixelated' });
  return (
    <>
      <section className="al-lab-main" aria-label="Surface preview">
        <div className="al-lab-stages">
          <figure className="al-stage">
            <span className="surface-view-panel" style={tiled(Math.round(s.tilePx / 3))} />
            <figcaption>in a framed panel</figcaption>
          </figure>
          <figure className="al-stage">
            <span className="surface-view-fill" style={tiled(Math.round(s.tilePx / 4))} />
            <figcaption>tiled surface</figcaption>
          </figure>
        </div>
      </section>
      <aside className="tileset-view-controls" aria-label="Surface details">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <dl className="al-meta">
              <div><dt>Surface</dt><dd>{s.label}</dd></div>
              <div><dt>Approach</dt><dd>{s.approach}</dd></div>
              <div><dt>Material</dt><dd>{s.material}</dd></div>
              <div><dt>Tile</dt><dd>{s.tilePx}px · seamless · repeat</dd></div>
            </dl>
          </div>
        </section>
      </aside>
    </>
  );
}
