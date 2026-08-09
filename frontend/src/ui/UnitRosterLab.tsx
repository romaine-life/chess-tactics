import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import {
  UNIT_PALETTES,
  UNIT_FACINGS,
  pieceSpritePath,
  type UnitPalette,
} from '../core/pieces';
import { activeUnitFamilies, type UnitFacing } from '@chess-tactics/board-render';

/**
 * The whole shipped roster at once, at 1:1.
 *
 * `UnitArtLab` is the authoring surface: one candidate, one direction, zoomed to
 * whatever you need. That is the wrong shape for judging a set. The faults that
 * matter across a roster are comparative — one piece flatter than its neighbours,
 * an accent that survives at one size and smudges at another, a palette that loses
 * its silhouette on dark ground — and none of them are visible one sprite at a time.
 *
 * So this draws every family against every direction at the size the board draws
 * them. Sprites are never scaled: a unit is now authored at its own delivery size,
 * and magnifying it to inspect it would hide exactly the thing worth inspecting.
 *
 * It deliberately paints no ground of its own — surfaces belong to registered
 * chrome (ADR-0032/0059/0201), and a flat swatch would be a worse test than the
 * real thing anyway. Judge separation against terrain on a board.
 */

export function UnitRosterLab({ header }: { header?: ReactNode }): ReactElement {
  const [palette, setPalette] = useState<UnitPalette>('navy-blue');
  const [allPalettes, setAllPalettes] = useState(false);

  const families = useMemo(() => [...activeUnitFamilies], []);
  // One row per family in a single palette, or one row per palette for a single
  // facing — the two comparisons worth making, and they want opposite layouts.
  const columns: readonly UnitFacing[] = allPalettes ? (['south'] as UnitFacing[]) : UNIT_FACINGS;

  return (
    <div className="unit-roster-lab">
      {header}
      <div className="unit-roster-controls">
        <label>
          <span>Palette</span>
          <select
            value={palette}
            disabled={allPalettes}
            onChange={(event) => setPalette(event.target.value as UnitPalette)}
          >
            {UNIT_PALETTES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="unit-roster-toggle">
          <input
            type="checkbox"
            checked={allPalettes}
            onChange={(event) => setAllPalettes(event.target.checked)}
          />
          <span>Compare palettes</span>
        </label>
        <p className="unit-roster-note">Drawn at 1:1 — every sprite is authored at its delivery size.</p>
      </div>

      <div className="unit-roster-grid">
        {(allPalettes ? UNIT_PALETTES : families).map((rowKey) => (
          <div className="unit-roster-row" key={rowKey}>
            <span className="unit-roster-row-label">{rowKey}</span>
            <div className="unit-roster-cells">
              {(allPalettes ? families : columns).map((columnKey) => {
                const family = allPalettes ? (columnKey as string) : (rowKey as string);
                const facing: UnitFacing = allPalettes ? 'south' : (columnKey as UnitFacing);
                const paletteId = allPalettes ? (rowKey as UnitPalette) : palette;
                let src: string | undefined;
                try {
                  src = pieceSpritePath(family as never, paletteId, facing);
                } catch {
                  src = undefined;
                }
                return (
                  <figure className="unit-roster-cell" key={`${family}:${facing}`}>
                    {src
                      ? <img src={src} alt={`${family} ${paletteId} ${facing}`} draggable={false} />
                      : <span className="unit-roster-missing">missing</span>}
                    <figcaption>{allPalettes ? family : facing}</figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
