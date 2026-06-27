import { type ReactElement, type CSSProperties } from 'react';
import { SCROLLBAR_ASSETS } from './scrollbarCatalog';

// Read-only catalog grid for scrollbar-grip candidates. Each card shows the sprite centered
// (a scrollbar grip is a single element, not a tiled surface). Reuses the shared studio card +
// surface-swatch classes so it matches the Tiles / Units / Surfaces grids.
export function ScrollbarLibraryStudio({
  search,
  selected,
  onSelect,
}: {
  search: string;
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
          <span className="tileset-studio-card-image">
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
