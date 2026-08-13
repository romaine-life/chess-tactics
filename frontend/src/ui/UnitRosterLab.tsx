import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import {
  UNIT_PALETTES,
  UNIT_FACINGS,
  pieceSpritePath,
  type UnitPalette,
} from '../core/pieces';
import { activeUnitFamilies, tileFrameSrc, unitAssetById, type UnitFacing } from '@chess-tactics/board-render';
import { tileAssets } from '../art/tileset';
import { fetchAdminUnitCatalog } from '../net/unitAssets';
import { spriteRungForWidth, zoomForTier } from '../game/zoomTiers';
import { UnitRungSprite } from './UnitRungSprite';
import { replaceAppHistoryState } from './navigation';

/**
 * The camera's own tiers, not an inspection magnifier.
 *
 * The question this surface has to answer is what a player SEES when they zoom in a
 * level, so the control walks the game's zoom ladder and draws each unit at the size
 * that tier actually puts on screen. An arbitrary 2x/4x magnifier answers a
 * different question -- how do these pixels look up close -- which is not the one
 * the roster is for.
 *
 * Sampled every few rungs rather than every 5% step: the ladder is deliberately fine
 * for the wheel, and a stepper wants strides you can see between.
 */
// One rung per input, wheel and buttons alike, because the job here is auditing
// EVERY view a player can reach -- and a stride bigger than one skips tiers, which
// is precisely the thing being audited. I twice widened the buttons on the reasoning
// that a click wants a bigger visible change; that is a comfort argument and it
// costs coverage, which this surface exists to provide.
/**
 * Families rendered through the pixel filter across every palette and facing.
 *
 * These read `/dev-filtered/<family>/<palette>/<facing>.png`, so the palette selector
 * and the facing columns drive them exactly as they drive the shipped art — which is
 * the point: a candidate judged only in navy, only facing south, is a candidate judged
 * on one of forty-eight views. Everything else still has a single south-only file at
 * `/dev-filtered/<family>.png`.
 *
 * The folder is gitignored, so an empty set here is the normal state on a fresh
 * checkout; render the matrix before expecting anything.
 */
const FILTER_MATRIX = new Set(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']);

const WHEEL_STRIDE = 1;
const BUTTON_STRIDE = 1;
const TIER_INDEX_RANGE = { min: -18, max: 38 };

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

/**
 * The view is in the address, so a specific state can be handed over as a link.
 *
 * Without this the viewer always opens on its defaults, and pointing someone at a
 * candidate means describing which boxes to tick — which puts the navigation back on
 * the person the link was supposed to spare.
 */
function readParams(): URLSearchParams {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
}

const asFlag = (value: string | null) => value === '1' || value === 'true';

export function UnitRosterLab(_: { header?: ReactNode; zoom?: number }): ReactElement {
  const initial = useMemo(readParams, []);
  const [palette, setPalette] = useState<UnitPalette>(
    (UNIT_PALETTES as readonly string[]).includes(initial.get('palette') ?? '')
      ? (initial.get('palette') as UnitPalette)
      : 'navy-blue',
  );
  const [allPalettes, setAllPalettes] = useState(asFlag(initial.get('palettes')));

  const [tierIndex, setTierIndex] = useState(() => {
    const raw = Number.parseInt(initial.get('tier') ?? '', 10);
    return Number.isFinite(raw) ? Math.min(TIER_INDEX_RANGE.max, Math.max(TIER_INDEX_RANGE.min, raw)) : 0;
  });
  const tierZoom = zoomForTier(tierIndex);
  const devicePixelScale = typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1);
  // Below 1:1 the board minifies through its mip chain rather than dropping columns,
  // so the browser is allowed to resample here too; magnified, whole-pixel is what
  // the board does and what the art was authored for.
  const nearest = tierZoom >= 1;
  const [showBefore, setShowBefore] = useState(asFlag(initial.get('before')));
  // Rungs on by default: the whole question is whether cutting a sprite for the zoom
  // beats magnifying one authored size, and it is only answerable side by side.
  // Rungs default on, but a link that arms any other mode should win over the default.
  const [compareRungs, setCompareRungs] = useState(
    initial.has('rungs') ? asFlag(initial.get('rungs')) : !asFlag(initial.get('filter')),
  );
  // Locally rendered pixel-filter candidates, served from an ignored public folder so
  // they can be judged beside the shipped art without a catalog write. Absent unless
  // someone has rendered them, hence the per-cell fallback rather than a hard path.
  const [showFiltered, setShowFiltered] = useState(asFlag(initial.get('filter')));
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof fetchAdminUnitCatalog>> | null>(null);
  // The ADMIN catalog, because accepting a new asset archives the one it replaced and
  // the public catalog omits archived assets — the before would always be missing.
  useEffect(() => { void fetchAdminUnitCatalog().then(setCatalog).catch(() => setCatalog(null)); }, []);

  // Keep the address in step with the view, so whatever is on screen can be copied and
  // sent as-is. replaceState rather than push: adjusting a toggle is not a navigation,
  // and stacking history entries would make Back walk backwards through checkbox
  // changes instead of leaving the viewer. The Studio's own params are preserved.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = readParams();
    params.set('palette', palette);
    const flag = (key: string, on: boolean) => (on ? params.set(key, '1') : params.delete(key));
    flag('palettes', allPalettes);
    flag('filter', showFiltered);
    flag('before', showBefore);
    flag('rungs', compareRungs);
    if (tierIndex === 0) params.delete('tier');
    else params.set('tier', String(tierIndex));
    const next = `${window.location.pathname}?${params.toString()}`;
    // Through ui/navigation.ts rather than history directly: the app owns its address,
    // and a surface writing straight to window.history is the seam that lets a view
    // desynchronise from what the router believes is current.
    if (next !== `${window.location.pathname}${window.location.search}`) {
      replaceAppHistoryState(window.history.state, next);
    }
  }, [palette, allPalettes, showFiltered, showBefore, compareRungs, tierIndex]);

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
            checked={compareRungs}
            onChange={(event) => setCompareRungs(event.target.checked)}
          />
          <span>Rung vs magnified</span>
        </label>
        <label className="unit-roster-toggle">
          <input
            type="checkbox"
            checked={showFiltered}
            onChange={(event) => setShowFiltered(event.target.checked)}
          />
          <span>Pixel-filter candidate</span>
        </label>
        <label className="unit-roster-toggle">
          <input
            type="checkbox"
            checked={showBefore}
            onChange={(event) => setShowBefore(event.target.checked)}
          />
          <span>Before / after</span>
        </label>
        <span className="unit-roster-magnify">
          <button
            type="button"
            aria-label="Zoom out one tier"
            disabled={tierIndex <= TIER_INDEX_RANGE.min}
            onClick={() => setTierIndex((current) => Math.max(TIER_INDEX_RANGE.min, current - BUTTON_STRIDE))}
          >
            −
          </button>
          <span className="unit-roster-magnify-value">
            {Math.round(tierZoom * 100)}%
            {' '}
            <small>
              tier {tierIndex - TIER_INDEX_RANGE.min + 1}/{TIER_INDEX_RANGE.max - TIER_INDEX_RANGE.min + 1}
            </small>
          </span>
          <button
            type="button"
            aria-label="Zoom in one tier"
            disabled={tierIndex >= TIER_INDEX_RANGE.max}
            onClick={() => setTierIndex((current) => Math.min(TIER_INDEX_RANGE.max, current + BUTTON_STRIDE))}
          >
            +
          </button>
        </span>
        <p className="unit-roster-note">
          {tierIndex === 0
            ? 'Camera zoom 100% — every sprite is authored at this size.'
            : `Camera zoom ${Math.round(tierZoom * 100)}% — what a player sees at this tier.`}
        </p>
        {/* A shape complaint about this page cannot be settled from a screenshot taken
            somewhere else: an OS scale factor, a browser zoom, or a fractional device
            ratio all change what the panel physically draws while every number in the
            source stays correct. So the page states what THIS browser did — measured off
            the rendered boxes and the drawn pixels, not recomputed from the inputs. */}
        <RosterGeometryReadout />
      </div>

      <div
        className="unit-roster-grid"
        // `zoom` rather than `transform: scale`: a transform does not affect layout,
        // so a magnified grid overflowed its scroll area and everything past the
        // first unit became unreachable. `zoom` scales the box too, so the panel
        // scrolls to the rest of the roster.
        style={tierIndex === 0 ? undefined : { zoom: tierZoom }}
        data-nearest={nearest ? '1' : '0'}
      >
        {(allPalettes ? UNIT_PALETTES : families).map((rowKey) => (
          <div className="unit-roster-row" key={rowKey}>
            <span className="unit-roster-row-label">{rowKey}</span>
            <div className="unit-roster-cells">
              {(showFiltered && !FILTER_MATRIX.has(rowKey as string) && !allPalettes
                ? ['south']
                : (allPalettes ? families : columns)
              ).map((columnKey) => {
                const family = allPalettes ? (columnKey as string) : (rowKey as string);
                const facing: UnitFacing = allPalettes ? 'south' : (columnKey as UnitFacing);
                const paletteId = allPalettes ? (rowKey as UnitPalette) : palette;
                let src: string | undefined;
                try {
                  src = pieceSpritePath(family as never, paletteId, facing);
                } catch {
                  src = undefined;
                }
                const asset = catalog?.assets.find(
                  (a) => a.id === catalog.families.find((f) => f.family === family)?.acceptedAssetId,
                );
                // The board's 1x draw rect, read from the registry the BOARD draws from
                // rather than the admin catalog. The admin fetch is for the before/after and
                // the rung list; when it had not resolved -- or 403'd -- this fell through to
                // `?? 78` / `?? 92`, which are the maximum CAPS, not any unit's size. Every
                // piece then drew at 78x92 instead of 51x81: 53% too wide against only 14%
                // too tall, so the whole roster read wide and no capture reproduced it,
                // because the catalog happened to resolve in mine. A fallback that silently
                // substitutes a limit for a measurement is the defect.
                const drawn = unitAssetById(family);
                const baseW = Math.min(78, drawn?.footprint.sourceCanvasPx
                  ?? asset?.footprint.sourceCanvasWidth ?? 51);
                const baseH = Math.min(92, drawn?.footprint.sourceCanvasHeightPx
                  ?? asset?.footprint.sourceCanvasHeight ?? 81);
                // The rung this tier actually wants, from the sizes this PALETTE has —
                // rungs go in one colour at a time, and a ladder is judged while it is
                // still landing, so the all-palette list would show nothing until the last
                // upload. Undefined until one exists, and then the seat stops simulating.
                const paletteRungs = asset?.rungsByPalette?.[paletteId];
                // DEVICE pixels: the rung has to match what the panel physically shows, or
                // a 150% display resamples it by 1.5 and the pixel grid stops being a grid.
                const chosen = paletteRungs?.length
                  ? spriteRungForWidth(baseW * tierZoom * devicePixelScale, paletteRungs)
                  : null;
                const authoredSrc = chosen && asset
                  ? `/api/unit-sprites/${asset.id}/${asset.rowRevision}/${paletteId}/${facing}/${chosen.rung}.png`
                  : undefined;
                const previous = showBefore ? beforeFor(family) : undefined;
                const beforeSrc = previous?.sprites?.[paletteId]?.[facing]?.url;
                const seat = (label: string, sprite: string | undefined, mode?: 'rung' | 'magnified') => (
                  <figure className="unit-roster-cell" key={`${family}:${facing}:${label}`}>
                    {/* Everything in this seat is sized in REAL pixels for the tier:
                        the tile scaled explicitly, the unit canvas already cut for it.
                        No nested CSS zoom — two of those fought each other and pushed
                        the unit off its tile. */}
                    <span className="unit-roster-seat" style={{ ['--roster-tier' as string]: tierZoom }}>
                      {groundTile
                        ? <img
                            className="unit-roster-ground"
                            src={tileFrameSrc(groundTile)}
                            // The grid box already carries `zoom: tierZoom`, so this is stated at
                            // 1x and scaled ONCE by that. Multiplying by the tier here as well put
                            // the ground at 96 * tier squared — 212px where the contract wants 143
                            // at tier 8 — so every piece read small against its own tile, and worse
                            // the further in you zoomed. Exactly the regime the surface is for.
                            style={{ width: '96px', height: '180px' }}
                            alt=""
                            aria-hidden="true"
                          />
                        : null}
                      {sprite
                        ? (mode
                          ? <span
                              className="unit-roster-unit-slot"
                              // 1x like the tile above it: the grid box applies the tier.
                              style={{ top: '68px' }}
                            >
                              <UnitRungSprite
                                src={sprite}
                                authoredSrc={mode === 'rung' ? authoredSrc : undefined}
                                baseWidth={baseW}
                                baseHeight={baseH}
                                zoom={tierZoom}
                                mode={mode}
                                alt={`${family} ${paletteId} ${facing} ${mode}`}
                              />
                            </span>
                          : <img className={`unit-roster-unit${label === 'before' ? ' is-before' : ''}`} src={sprite} alt={`${family} ${paletteId} ${facing}`} draggable={false} />)
                        : <span className="unit-roster-missing">missing</span>}
                    </span>
                    <figcaption>{label}</figcaption>
                  </figure>
                );
                const caption = allPalettes ? family : facing;
                if (showFiltered) {
                  // Families rendered across the whole matrix get the real facing and
                  // palette; the rest still have a single south-only candidate, and
                  // repeating that across eight columns would read as eight different
                  // renders of the same file.
                  const candidate = FILTER_MATRIX.has(family)
                    ? `/dev-filtered/${family}/${paletteId}/${facing}.png`
                    : `/dev-filtered/${family}.png`;
                  return (
                    <div className="unit-roster-pair" key={`${family}:${facing}`}>
                      {seat('shipped', src)}
                      {seat(`filter · ${caption}`, candidate)}
                    </div>
                  );
                }
                if (compareRungs) {
                  return (
                    <div className="unit-roster-pair" key={`${family}:${facing}`}>
                      {seat('magnified', src, 'magnified')}
                      {seat(`rung · ${caption}`, src, 'rung')}
                    </div>
                  );
                }
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

/**
 * What this browser actually drew, measured rather than derived.
 *
 * Every disagreement about a unit's shape on this page so far has come from
 * comparing a capture taken at one device pixel ratio against a screen running at
 * another. The inputs were right in both, so reading the source could not settle it.
 * This reads the rendered geometry back out: the ratio in force, the box the seat
 * occupies, and the ASPECT of the drawn ink against the aspect of the source sprite.
 * A piece that reads wide shows up here as an aspect above the source's.
 */
function RosterGeometryReadout(): ReactElement | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let stop = false;
    const measure = (): void => {
      if (stop) return;
      const canvas = document.querySelector<HTMLCanvasElement>('.unit-roster-unit-slot canvas');
      const tile = document.querySelector<HTMLImageElement>('img.unit-roster-ground');
      if (!canvas || !tile) { window.setTimeout(measure, 400); return; }
      const box = canvas.getBoundingClientRect();
      const tileBox = tile.getBoundingClientRect();
      const context = canvas.getContext('2d', { willReadFrequently: true });
      let inkAspect = 'n/a';
      if (context && canvas.width && canvas.height) {
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let x0 = canvas.width, x1 = -1, y0 = canvas.height, y1 = -1;
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            if (data[(y * canvas.width + x) * 4 + 3] > 24) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 >= x0 && y1 >= y0) inkAspect = `${x1 - x0 + 1}x${y1 - y0 + 1} = ${((x1 - x0 + 1) / (y1 - y0 + 1)).toFixed(3)}`;
      }
      setText([
        `devicePixelRatio ${window.devicePixelRatio}`,
        `canvas box ${Math.round(box.width)}x${Math.round(box.height)} css, store ${canvas.width}x${canvas.height}`,
        `tile box ${Math.round(tileBox.width)} css`,
        `unit/tile ${(box.width / tileBox.width).toFixed(3)} (board draws 0.531)`,
        `drawn ink ${inkAspect}`,
      ].join('  ·  '));
      window.setTimeout(measure, 1500);
    };
    measure();
    return () => { stop = true; };
  }, []);
  if (!text) return null;
  return <p className="unit-roster-note" style={{ opacity: 0.85 }}>{text}</p>;
}
