import { type ReactElement, type CSSProperties } from 'react';
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
