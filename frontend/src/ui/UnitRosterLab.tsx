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

/** Mirrors the Studio viewer zoom slider, whose travel this maps onto whole multiples. */
const STUDIO_ZOOM_REST = 1;
const STUDIO_ZOOM_MAX = 2;

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

  /**
   * Slider travel mapped onto whole magnifications.
   *
   * A fractional magnification of pixel art gives uneven columns -- the exact
   * artifact this surface exists to catch -- so the multiple has to be an integer.
   * But rounding the slider's own value is why it felt dead: its range is 0.25 to
   * 2.0, so `round` yielded 1 for everything under 1.5 and 2 above it -- two
   * settings, most of the travel doing nothing. The ladder is spread across the
   * travel above the rest position instead, so every part of it that can change the
   * picture does.
   *
   * The header still reports the slider as a percentage, which is its own number and
   * will not match; the note below states the multiple actually being drawn.
   */
  const magnify = useMemo(() => {
    // The slider rests at 1, and that has to mean 1:1 -- this surface opens on the
    // read it exists to judge. Everything below the rest position stays 1:1 too:
    // there is no honest way to show art authored at its delivery size any smaller
    // than that, which is the entire point of authoring it that way.
    if (zoom <= STUDIO_ZOOM_REST) return 1;
    const ladder = [2, 3, 4, 5, 6, 8, 10];
    const travel = (zoom - STUDIO_ZOOM_REST) / (STUDIO_ZOOM_MAX - STUDIO_ZOOM_REST);
    return ladder[Math.round(Math.min(1, travel) * (ladder.length - 1))];
  }, [zoom]);
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
            : `Magnified ${magnify}x — whole multiples only; judge the read at 1:1.`}
        </p>
      </div>

      <div
        className="unit-roster-grid"
        // `zoom` rather than `transform: scale`: a transform does not affect layout,
        // so the magnified grid overflowed its scroll area and everything past the
        // first unit became unreachable. `zoom` scales the box too, so the panel
        // scrolls to the rest of the roster.
        style={magnify === 1 ? undefined : { zoom: magnify }}
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
