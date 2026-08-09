import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import {
  UNIT_PALETTES,
  UNIT_FACINGS,
  pieceSpritePath,
  type UnitPalette,
} from '../core/pieces';
import { activeUnitFamilies, tileFrameSrc, type UnitFacing } from '@chess-tactics/board-render';
import { tileAssets } from '../art/tileset';
import { fetchAdminUnitCatalog } from '../net/unitAssets';

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
 * them. The default is 1:1, because that is the read to judge; the Studio zoom
 * magnifies from there in whole multiples, for diagnosing detail rather than
 * deciding it.
 *
 * It deliberately paints no ground of its own — surfaces belong to registered
 * chrome (ADR-0032/0059/0201), and a flat swatch would be a worse test than the
 * real thing anyway. Judge separation against terrain on a board.
 */

export function UnitRosterLab({ header, zoom = 1 }: { header?: ReactNode; zoom?: number }): ReactElement {
  const [palette, setPalette] = useState<UnitPalette>('navy-blue');
  const [allPalettes, setAllPalettes] = useState(false);

  // The Studio's zoom is continuous, and a fractional magnification of pixel art
  // gives uneven columns -- the exact artifact this surface exists to catch. Snap
  // to whole multiples so a magnified sprite is still an honest picture of itself,
  // and say which multiple it landed on rather than reporting the slider's float.
  const magnify = Math.max(1, Math.round(zoom));
  const [showBefore, setShowBefore] = useState(false);
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof fetchAdminUnitCatalog>> | null>(null);
  // The ADMIN catalog, because accepting a new asset archives the one it replaced and
  // the public catalog omits archived assets — the before would always be missing.
  useEffect(() => { void fetchAdminUnitCatalog().then(setCatalog).catch(() => setCatalog(null)); }, []);

  // A unit is drawn standing on a tile, so that is what it has to read against.
  // Real terrain art rather than a flat swatch: the swatch is both a worse test and
  // a surface this viewer has no business painting.
  const groundTile = useMemo(
    () => tileAssets.find((asset) => asset.id.startsWith('grass-surf')) ?? tileAssets[0],
    [],
  );

  /**
   * What this family looked like before the current accepted asset.
   *
   * A superseded asset is archived rather than deleted, so the comparison is against
   * the real previous pixels instead of a remembered impression. Newest first, so
   * this is the one the current asset replaced.
   */
  const beforeFor = (family: string) => {
    if (!catalog) return undefined;
    const accepted = catalog.families.find((f) => f.family === family)?.acceptedAssetId;
    // The catalog arrives ordered by family and newest first, so the first match is
    // the asset the current one replaced.
    return catalog.assets
      .find((a) => a.family === family && a.id !== accepted && a.spriteCount > 0);
  };

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
        <label className="unit-roster-toggle">
          <input
            type="checkbox"
            checked={showBefore}
            onChange={(event) => setShowBefore(event.target.checked)}
          />
          <span>Before / after</span>
        </label>
        <p className="unit-roster-note">
          {magnify === 1
            ? 'Drawn at 1:1 — every sprite is authored at its delivery size.'
            : `Magnified ${magnify}x — judge the read at 1:1.`}
        </p>
      </div>

      <div
        className="unit-roster-grid"
        style={magnify === 1 ? undefined : { transform: `scale(${magnify})`, transformOrigin: 'top left' }}
      >
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
                const previous = showBefore ? beforeFor(family) : undefined;
                const beforeSrc = previous?.sprites?.[paletteId]?.[facing]?.url;
                const seat = (label: string, sprite: string | undefined) => (
                  <figure className="unit-roster-cell" key={`${family}:${facing}:${label}`}>
                    <span className="unit-roster-seat">
                      {groundTile ? <img className="unit-roster-ground" src={tileFrameSrc(groundTile)} alt="" aria-hidden="true" /> : null}
                      {sprite
                        ? <img className={`unit-roster-unit${label === 'before' ? ' is-before' : ''}`} src={sprite} alt={`${family} ${paletteId} ${facing}`} draggable={false} />
                        : <span className="unit-roster-missing">missing</span>}
                    </span>
                    <figcaption>{label}</figcaption>
                  </figure>
                );
                const caption = allPalettes ? family : facing;
                return showBefore
                  ? (
                    <div className="unit-roster-pair" key={`${family}:${facing}`}>
                      {seat('before', beforeSrc)}
                      {seat(caption, src)}
                    </div>
                  )
                  : seat(caption, src);
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
