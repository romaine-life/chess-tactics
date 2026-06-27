import { useState, type ReactElement, type ReactNode, type CSSProperties } from 'react';
import { SCROLLBAR_ASSETS } from './scrollbarCatalog';

// Read-only catalog grid for scrollbar-grip candidates. Each card shows the sprite centered
// (a scrollbar grip is a single element, not a tiled surface). Reuses the shared studio card +
// surface-swatch classes so it matches the Tiles / Units / Surfaces grids.
export function ScrollbarLibraryStudio({
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
  const visible = SCROLLBAR_ASSETS.filter((s) => !q || [s.label, s.approach, s.material].join(' ').toLowerCase().includes(q));
  return (
    <div className="tileset-studio-grid surface-grid" aria-label="Scrollbars">
      {visible.map((s) => (
        <button
          key={s.name}
          type="button"
          className={`tileset-studio-card ${s.name === selected ? 'is-selected' : ''}`.trim()}
          onClick={() => onSelect(s.name)}
          aria-pressed={s.name === selected}
          title={`${s.label} — scrollbar grip`}
        >
          <span className="tileset-studio-card-image" style={{ '--tile-zoom': zoom } as CSSProperties}>
            <span
              className="surface-swatch"
              style={{ backgroundImage: `url("${s.file}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', imageRendering: 'pixelated' } as CSSProperties}
            />
          </span>
          <span className="tileset-studio-card-meta">
            <span className="tileset-studio-card-text">
              <strong>{s.label}</strong>
              <em>{s.preferred ? `${s.material} · preferred` : s.material}</em>
            </span>
          </span>
        </button>
      ))}
      {visible.length === 0 ? <p className="tileset-studio-empty">No scrollbars match.</p> : null}
    </div>
  );
}

// The read-only Viewer for a single scrollbar grip — shown big and centered, with a Details
// readout. Mirrors SurfaceViewer: the shared read-only Viewer contract (ADR-0029).
export function ScrollbarViewer({ name, header }: { name?: string; header?: ReactNode }): ReactElement {
  const s = SCROLLBAR_ASSETS.find((x) => x.name === name) ?? SCROLLBAR_ASSETS[0];
  const [zoom, setZoom] = useState(3);
  const bg: CSSProperties = {
    backgroundImage: `url("${s.file}")`,
    backgroundSize: `${Math.round(48 * zoom)}px`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    imageRendering: 'pixelated',
  };
  return (
    <>
      <section className="al-lab-main surface-view-main" aria-label="Scrollbar preview">
        <div className="surface-view-stage is-bare" style={bg} />
      </section>
      <aside className="tileset-view-controls" aria-label="Scrollbar details">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <label className="tileset-catalog-zoom">
              <span>Zoom · {zoom.toFixed(1)}×</span>
              <input type="range" min="0.5" max="8" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
            </label>
            <p className="tileset-catalog-note">Drag the preview's bottom-right corner to resize it.</p>
            <dl className="al-meta">
              <div><dt>Scrollbar</dt><dd>{s.label}</dd></div>
              <div><dt>Approach</dt><dd>{s.approach}</dd></div>
              <div><dt>Material</dt><dd>{s.material}</dd></div>
              <div><dt>Default</dt><dd>{s.preferred ? 'preferred' : '—'}</dd></div>
            </dl>
          </div>
        </section>
      </aside>
    </>
  );
}
