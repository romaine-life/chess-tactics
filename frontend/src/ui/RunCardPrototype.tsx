import { useEffect, useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { paletteForSide, pieceSpritePath, type PlayablePieceType } from '../core/pieces';
import {
  fetchAdminLiveMediaCatalog,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { SliderRow } from './dressing/SliderRow';

const FRAME_SLOT = 'ui/run/card-prototypes/frame-v1.png';
const ART_SLOT = 'ui/run/card-prototypes/pppkb-human-v1.png';
const SHA256 = /^[0-9a-f]{64}$/;
const PLAYER_CARD_PALETTE = paletteForSide('player');
const PLAYER_CARD_FACING = 'south';
const REFERENCE_CARD_WIDTH = 360;
const TEXT_HORIZONTAL_MIN = -3;
const TEXT_HORIZONTAL_MAX = 3;
const TITLE_SIZE_MIN = 3;
const TITLE_SIZE_MAX = 7;
const DEFAULT_TITLE_SIZE = 5;
const DEFAULT_COST_SIZE = 6.2;
const TYPE_SIZE_MIN = 2.5;
const TYPE_SIZE_MAX = 6;
const DEFAULT_TYPE_SIZE = 3.7;
const DEFAULT_FLAVOR_SIZE = 5;

const clampCardFontSize = (value: number, min: number, max: number): number => (
  Math.round(Math.min(max, Math.max(min, value)) * 100) / 100
);
const roundCardFontBoundUp = (value: number): number => Math.ceil((value - 1e-9) * 100) / 100;
const roundCardFontBoundDown = (value: number): number => Math.floor((value + 1e-9) * 100) / 100;
const clampCardHorizontal = (value: number, min = TEXT_HORIZONTAL_MIN, max = TEXT_HORIZONTAL_MAX): number => (
  Math.round(Math.min(max, Math.max(min, value)) * 100) / 100
);

type CardImageKind = 'frame' | 'art' | `unit:${number}:${PlayablePieceType}:${number}`;

const unitImageKind = (cell: number, unit: PlayablePieceType, index: number): CardImageKind => (
  `unit:${cell}:${unit}:${index}`
);

type UnitSpriteMetrics = Readonly<{
  canvasWidthPerHeight: number;
  opaqueLeftPerHeight: number;
  opaqueWidthPerHeight: number;
}>;

const UNIT_ICON_HEIGHT_CQW = 9;
const UNIT_NATURAL_GAP_CQW = .8;
const unitSpriteMetrics = new Map<string, UnitSpriteMetrics>();

function measureUnitSprite(image: HTMLImageElement): UnitSpriteMetrics {
  const source = image.currentSrc || image.src;
  const cached = unitSpriteMetrics.get(source);
  if (cached) return cached;
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('unit sprite has no native dimensions');

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('unit sprite alpha measurement is unavailable');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let maxX = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (pixels[((y * canvas.width + x) * 4) + 3] <= 8) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  if (maxX < minX) throw new Error('unit sprite contains no visible pixels');
  const measured = Object.freeze({
    canvasWidthPerHeight: canvas.width / canvas.height,
    opaqueLeftPerHeight: minX / canvas.height,
    opaqueWidthPerHeight: (maxX - minX + 1) / canvas.height,
  });
  unitSpriteMetrics.set(source, measured);
  return measured;
}

type PrototypeTuning = Readonly<{
  costX: number;
  costY: number;
  costSize: number;
  titleX: number;
  titleY: number;
  titleSize: number;
  typeX: number;
  typeY: number;
  typeSize: number;
  flavorSize: number;
}>;

const CARD = Object.freeze({
  name: 'Parish Militia',
  cost: 9,
  typeLine: 'Units',
  grants: [
    { count: 3, unit: 'pawn' },
    { count: 1, unit: 'knight' },
    { count: 1, unit: 'bishop' },
  ] as const,
  flavor: 'The bell was gone. Five shadows gathered at the accustomed hour.',
}) satisfies {
  name: string;
  cost: number;
  typeLine: string;
  grants: readonly { count: number; unit: PlayablePieceType }[];
  flavor: string;
};

function selectedCandidate(
  catalog: AdminLiveMediaCatalog,
  slot: string,
  queryName: string,
): AdminLiveMediaVersion | null {
  const requested = new URLSearchParams(window.location.search).get(queryName)?.trim().toLowerCase();
  const eligible = catalog.versions.filter((version) => (
    version.slot === slot
    && Boolean(version.media?.url)
    && (version.status === 'candidate' || version.status === 'accepted')
  ));
  if (requested) {
    if (!SHA256.test(requested)) return null;
    return eligible.find((version) => version.media?.sha256 === requested) ?? null;
  }
  const activeVersionId = catalog.slots.find((entry) => entry.slot === slot)?.activeVersionId;
  const active = activeVersionId ? eligible.find((version) => version.id === activeVersionId) : null;
  if (active) return active;
  return [...eligible].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function UnitStackSprite({
  cell,
  unit,
  index,
  count,
  onReady,
  onError,
}: {
  cell: number;
  unit: PlayablePieceType;
  index: number;
  count: number;
  onReady: (kind: CardImageKind) => void;
  onError: (kind: CardImageKind) => void;
}): ReactElement {
  const [metrics, setMetrics] = useState<UnitSpriteMetrics | null>(null);
  const kind = unitImageKind(cell, unit, index);
  const source = pieceSpritePath(unit, PLAYER_CARD_PALETTE, PLAYER_CARD_FACING);
  const visibleWidth = metrics ? metrics.opaqueWidthPerHeight * UNIT_ICON_HEIGHT_CQW : 0;
  const canvasWidth = metrics ? metrics.canvasWidthPerHeight * UNIT_ICON_HEIGHT_CQW : 0;
  const canvasLeft = metrics ? -metrics.opaqueLeftPerHeight * UNIT_ICON_HEIGHT_CQW : 0;
  const endFraction = count <= 1 ? 0 : index / (count - 1);
  const naturalLeft = index * (visibleWidth + UNIT_NATURAL_GAP_CQW);
  const fittedLeft = `calc(${(endFraction * 100).toFixed(4)}% - ${(endFraction * visibleWidth).toFixed(4)}cqw)`;
  const seatLeft = count <= 1 ? '0cqw' : `min(${naturalLeft.toFixed(4)}cqw, ${fittedLeft})`;

  return (
    <span
      className="run-card-prototype-unit-icon-seat"
      style={{
        '--run-card-unit-canvas-left': `${canvasLeft.toFixed(4)}cqw`,
        '--run-card-unit-canvas-width': `${canvasWidth.toFixed(4)}cqw`,
        '--run-card-unit-seat-left': seatLeft,
        '--run-card-unit-seat-width': `${visibleWidth.toFixed(4)}cqw`,
        zIndex: index + 1,
      } as CSSProperties}
    >
      <img
        className="run-card-prototype-unit-icon"
        data-unit-facing={PLAYER_CARD_FACING}
        data-unit-palette={PLAYER_CARD_PALETTE}
        src={source}
        alt=""
        draggable={false}
        onLoad={(event) => {
          try {
            setMetrics(measureUnitSprite(event.currentTarget));
            onReady(kind);
          } catch {
            onError(kind);
          }
        }}
        onError={() => onError(kind)}
      />
    </span>
  );
}

function PrototypeCard({
  frame,
  art,
  viewerZoom,
  tuning,
  onImageLoad,
  onImageError,
}: {
  frame: AdminLiveMediaVersion;
  art: AdminLiveMediaVersion;
  viewerZoom: number;
  tuning: PrototypeTuning;
  onImageLoad: (kind: CardImageKind) => void;
  onImageError: (kind: CardImageKind) => void;
}): ReactElement {
  const ledgerRows = CARD.grants.length <= 2
    ? CARD.grants.length
    : Math.ceil(CARD.grants.length / 2);

  return (
    <article
      className="run-card-prototype"
      style={{
        '--run-card-prototype-width': `${REFERENCE_CARD_WIDTH * viewerZoom}px`,
        '--run-card-cost-x': `${tuning.costX}cqw`,
        '--run-card-cost-y': `${tuning.costY}cqw`,
        '--run-card-cost-size': `${tuning.costSize}cqw`,
        '--run-card-title-x': `${tuning.titleX}cqw`,
        '--run-card-title-y': `${tuning.titleY}cqw`,
        '--run-card-title-size': `${tuning.titleSize}cqw`,
        '--run-card-type-x': `${tuning.typeX}cqw`,
        '--run-card-type-y': `${tuning.typeY}cqw`,
        '--run-card-type-size': `${tuning.typeSize}cqw`,
        '--run-card-flavor-size': `${tuning.flavorSize}cqw`,
      } as CSSProperties}
      aria-label={`${CARD.name}. ${CARD.typeLine}. Costs ${CARD.cost} gold. Grants three Pawns, one Knight, and one Bishop.`}
    >
      <img
        className="run-card-prototype-frame"
        src={frame.media!.url}
        alt=""
        draggable={false}
        onLoad={() => onImageLoad('frame')}
        onError={() => onImageError('frame')}
      />
      <img
        className="run-card-prototype-art"
        src={art.media!.url}
        alt=""
        draggable={false}
        onLoad={() => onImageLoad('art')}
        onError={() => onImageError('art')}
      />
      <h2 className="run-card-prototype-name">{CARD.name}</h2>
      <strong className="run-card-prototype-cost" aria-label={`${CARD.cost} gold`}>{CARD.cost}</strong>
      <div className="run-card-prototype-type">{CARD.typeLine}</div>
      <div className={`run-card-prototype-rules is-ledger-${ledgerRows}-rows`}>
        <div
          className={`run-card-prototype-ledger is-${CARD.grants.length}-cells`}
          data-cell-count={CARD.grants.length}
          aria-label="Card contents"
        >
          {CARD.grants.map((grant, cell) => (
            <div
              className="run-card-prototype-ledger-row"
              aria-label={`${grant.count} ${grant.unit}${grant.count === 1 ? '' : 's'}`}
              key={grant.unit}
            >
              <strong className="run-card-prototype-ledger-count" aria-hidden="true">{grant.count}</strong>
              <span className="run-card-prototype-unit-stack" aria-hidden="true">
                {Array.from({ length: grant.count }, (_, index) => (
                  <UnitStackSprite
                    cell={cell}
                    count={grant.count}
                    index={index}
                    key={`${grant.unit}-${index}`}
                    unit={grant.unit}
                    onReady={onImageLoad}
                    onError={onImageError}
                  />
                ))}
              </span>
            </div>
          ))}
        </div>
        <blockquote className="run-card-prototype-flavor">{CARD.flavor}</blockquote>
      </div>
    </article>
  );
}

export function RunCardPrototypeViewer({
  header,
  viewerZoom,
}: {
  header?: ReactNode;
  viewerZoom: number;
}): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  const [costX, setCostX] = useState(0);
  const [costY, setCostY] = useState(.3);
  const [costSize, setCostSize] = useState(DEFAULT_COST_SIZE);
  const [titleX, setTitleX] = useState(0);
  const [titleY, setTitleY] = useState(0);
  const [titleSize, setTitleSize] = useState(DEFAULT_TITLE_SIZE);
  const [typeX, setTypeX] = useState(0);
  const [typeY, setTypeY] = useState(0);
  const [typeSize, setTypeSize] = useState(DEFAULT_TYPE_SIZE);
  const [titleTypeSizeRatio, setTitleTypeSizeRatio] = useState<number | null>(null);
  const [titleTypeHorizontalOffset, setTitleTypeHorizontalOffset] = useState<number | null>(null);
  const [flavorSize, setFlavorSize] = useState(DEFAULT_FLAVOR_SIZE);
  const [loaded, setLoaded] = useState<ReadonlySet<CardImageKind>>(() => new Set());

  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);

  const frame = useMemo(() => catalog ? selectedCandidate(catalog, FRAME_SLOT, 'frameCandidate') : null, [catalog]);
  const art = useMemo(() => catalog ? selectedCandidate(catalog, ART_SLOT, 'artCandidate') : null, [catalog]);
  const missing = catalog && (!frame || !art) ? 'The requested frame or artwork candidate is unavailable.' : '';
  const sceneError = useMemo(() => error || missing ? new Error(error || missing) : null, [error, missing]);
  const painted = Boolean(
    frame
    && art
    && loaded.has('frame')
    && loaded.has('art')
    && CARD.grants.every((grant, cell) => (
      Array.from({ length: grant.count }, (_, index) => unitImageKind(cell, grant.unit, index))
        .every((kind) => loaded.has(kind))
    )),
  );
  const onImageLoad = (kind: CardImageKind): void => {
    setLoaded((current) => current.has(kind) ? current : new Set([...current, kind]));
  };
  const onImageError = (kind: CardImageKind): void => setError(`${kind} image could not be decoded.`);
  const titleTypeSizesLocked = titleTypeSizeRatio !== null;
  const titleSizeMin = titleTypeSizeRatio === null
    ? TITLE_SIZE_MIN
    : roundCardFontBoundUp(Math.max(TITLE_SIZE_MIN, TYPE_SIZE_MIN / titleTypeSizeRatio));
  const titleSizeMax = titleTypeSizeRatio === null
    ? TITLE_SIZE_MAX
    : roundCardFontBoundDown(Math.min(TITLE_SIZE_MAX, TYPE_SIZE_MAX / titleTypeSizeRatio));
  const typeSizeMin = titleTypeSizeRatio === null
    ? TYPE_SIZE_MIN
    : roundCardFontBoundUp(Math.max(TYPE_SIZE_MIN, TITLE_SIZE_MIN * titleTypeSizeRatio));
  const typeSizeMax = titleTypeSizeRatio === null
    ? TYPE_SIZE_MAX
    : roundCardFontBoundDown(Math.min(TYPE_SIZE_MAX, TITLE_SIZE_MAX * titleTypeSizeRatio));
  const setLinkedTitleSize = (nextTitleSize: number): void => {
    if (titleTypeSizeRatio === null) {
      setTitleSize(nextTitleSize);
      return;
    }
    const linkedTitleMin = Math.max(TITLE_SIZE_MIN, TYPE_SIZE_MIN / titleTypeSizeRatio);
    const linkedTitleMax = Math.min(TITLE_SIZE_MAX, TYPE_SIZE_MAX / titleTypeSizeRatio);
    const clampedTitleSize = clampCardFontSize(nextTitleSize, linkedTitleMin, linkedTitleMax);
    setTitleSize(clampedTitleSize);
    setTypeSize(clampCardFontSize(clampedTitleSize * titleTypeSizeRatio, TYPE_SIZE_MIN, TYPE_SIZE_MAX));
  };
  const setLinkedTypeSize = (nextTypeSize: number): void => {
    if (titleTypeSizeRatio === null) {
      setTypeSize(nextTypeSize);
      return;
    }
    const linkedTypeMin = Math.max(TYPE_SIZE_MIN, TITLE_SIZE_MIN * titleTypeSizeRatio);
    const linkedTypeMax = Math.min(TYPE_SIZE_MAX, TITLE_SIZE_MAX * titleTypeSizeRatio);
    const clampedTypeSize = clampCardFontSize(nextTypeSize, linkedTypeMin, linkedTypeMax);
    setTypeSize(clampedTypeSize);
    setTitleSize(clampCardFontSize(clampedTypeSize / titleTypeSizeRatio, TITLE_SIZE_MIN, TITLE_SIZE_MAX));
  };
  const titleTypeHorizontalLocked = titleTypeHorizontalOffset !== null;
  const titleHorizontalMin = titleTypeHorizontalOffset === null
    ? TEXT_HORIZONTAL_MIN
    : Math.max(TEXT_HORIZONTAL_MIN, TEXT_HORIZONTAL_MIN - titleTypeHorizontalOffset);
  const titleHorizontalMax = titleTypeHorizontalOffset === null
    ? TEXT_HORIZONTAL_MAX
    : Math.min(TEXT_HORIZONTAL_MAX, TEXT_HORIZONTAL_MAX - titleTypeHorizontalOffset);
  const typeHorizontalMin = titleTypeHorizontalOffset === null
    ? TEXT_HORIZONTAL_MIN
    : Math.max(TEXT_HORIZONTAL_MIN, TEXT_HORIZONTAL_MIN + titleTypeHorizontalOffset);
  const typeHorizontalMax = titleTypeHorizontalOffset === null
    ? TEXT_HORIZONTAL_MAX
    : Math.min(TEXT_HORIZONTAL_MAX, TEXT_HORIZONTAL_MAX + titleTypeHorizontalOffset);
  const setLinkedTitleHorizontal = (nextTitleX: number): void => {
    if (titleTypeHorizontalOffset === null) {
      setTitleX(nextTitleX);
      return;
    }
    const clampedTitleX = clampCardHorizontal(nextTitleX, titleHorizontalMin, titleHorizontalMax);
    setTitleX(clampedTitleX);
    setTypeX(clampCardHorizontal(clampedTitleX + titleTypeHorizontalOffset));
  };
  const setLinkedTypeHorizontal = (nextTypeX: number): void => {
    if (titleTypeHorizontalOffset === null) {
      setTypeX(nextTypeX);
      return;
    }
    const clampedTypeX = clampCardHorizontal(nextTypeX, typeHorizontalMin, typeHorizontalMax);
    setTypeX(clampedTypeX);
    setTitleX(clampCardHorizontal(clampedTypeX - titleTypeHorizontalOffset));
  };

  return (
    <>
      <section className="al-lab-main run-card-prototype-main" aria-label="Card layout preview">
        {sceneError ? <p role="alert">{sceneError.message}</p> : null}
        {!sceneError && !painted ? <p role="status">Loading exact candidate pixels…</p> : null}
        {frame && art ? (
          <div className="run-card-prototype-stage">
            <PrototypeCard
              frame={frame}
              art={art}
              viewerZoom={viewerZoom}
              tuning={{ costX, costY, costSize, titleX, titleY, titleSize, typeX, typeY, typeSize, flavorSize }}
              onImageLoad={onImageLoad}
              onImageError={onImageError}
            />
          </div>
        ) : null}
      </section>

      <aside className="tileset-view-controls run-card-prototype-controls" aria-label="Card layout controls">
        <section className="tileset-inspector-section">
          <h2>Card Layout</h2>
          <div className="tileset-control-stack">
            {header}
            <p className="run-card-prototype-note">Prototype instrument. The Studio Zoom control changes only the preview scale.</p>
            <SliderRow label={<>Title size · {titleSize.toFixed(2)}%</>} value={titleSize} set={setLinkedTitleSize} min={titleSizeMin} max={titleSizeMax} step={.01} nudge={.05} dflt={DEFAULT_TITLE_SIZE} />
            <button
              type="button"
              data-card-pair-lock="size"
              className={`tileset-view-action run-card-prototype-pair-lock${titleTypeSizesLocked ? ' active' : ''}`}
              aria-pressed={titleTypeSizesLocked}
              title="Keep the current title-to-type font-size proportion while either size is adjusted"
              onClick={() => setTitleTypeSizeRatio(titleTypeSizesLocked ? null : typeSize / titleSize)}
            >
              {titleTypeSizesLocked ? 'Title/type sizes locked' : 'Lock title/type sizes'}
            </button>
            <SliderRow label={<>Type size · {typeSize.toFixed(2)}%</>} value={typeSize} set={setLinkedTypeSize} min={typeSizeMin} max={typeSizeMax} step={.01} nudge={.05} dflt={DEFAULT_TYPE_SIZE} />
            <SliderRow label={<>Title horizontal · {titleX.toFixed(2)}%</>} value={titleX} set={setLinkedTitleHorizontal} min={titleHorizontalMin} max={titleHorizontalMax} step={.05} nudge={.05} dflt={0} />
            <button
              type="button"
              data-card-pair-lock="horizontal"
              className={`tileset-view-action run-card-prototype-pair-lock${titleTypeHorizontalLocked ? ' active' : ''}`}
              aria-pressed={titleTypeHorizontalLocked}
              title="Keep the current title-to-type horizontal offset while either position is adjusted"
              onClick={() => setTitleTypeHorizontalOffset(titleTypeHorizontalLocked ? null : typeX - titleX)}
            >
              {titleTypeHorizontalLocked ? 'Title/type horizontal locked' : 'Lock title/type horizontal'}
            </button>
            <SliderRow label={<>Type horizontal · {typeX.toFixed(2)}%</>} value={typeX} set={setLinkedTypeHorizontal} min={typeHorizontalMin} max={typeHorizontalMax} step={.05} nudge={.05} dflt={0} />
            <SliderRow label={<>Title vertical · {titleY.toFixed(2)}%</>} value={titleY} set={setTitleY} min={-3} max={3} step={.05} nudge={.05} dflt={0} />
            <SliderRow label={<>Type vertical · {typeY.toFixed(2)}%</>} value={typeY} set={setTypeY} min={-3} max={3} step={.05} nudge={.05} dflt={0} />
            <SliderRow label={<>Cost size · {costSize.toFixed(2)}%</>} value={costSize} set={setCostSize} min={3} max={9} step={.05} nudge={.05} dflt={DEFAULT_COST_SIZE} />
            <SliderRow label={<>Cost horizontal · {costX.toFixed(2)}%</>} value={costX} set={setCostX} min={-3} max={3} step={.05} nudge={.05} dflt={0} />
            <SliderRow label={<>Cost vertical · {costY.toFixed(2)}%</>} value={costY} set={setCostY} min={-3} max={3} step={.05} nudge={.05} dflt={.3} />
            <SliderRow label={<>Flavor size · {flavorSize.toFixed(2)}%</>} value={flavorSize} set={setFlavorSize} min={2.5} max={6} step={.05} nudge={.05} dflt={DEFAULT_FLAVOR_SIZE} />
            {frame && art ? (
              <dl className="run-card-prototype-source-readout">
                <div><dt>Frame</dt><dd>{frame.media!.sha256.slice(0, 12)} · {frame.status}</dd></div>
                <div><dt>Artwork</dt><dd>{art.media!.sha256.slice(0, 12)} · {art.status}</dd></div>
              </dl>
            ) : null}
          </div>
        </section>
      </aside>
    </>
  );
}

export function RunCardPrototypeCatalog({ onOpen }: { onOpen: () => void }): ReactElement {
  return (
    <div className="tileset-studio-grid pages-grid" aria-label="Card layout prototypes">
      <button
        type="button"
        className="tileset-studio-card is-selected"
        onClick={onOpen}
        aria-pressed={true}
        title="Open the Parish Militia card layout instrument"
      >
        <span className="tileset-studio-card-image pages-card-image run-card-prototype-catalog-image" aria-hidden="true">
          <span>5:7</span>
        </span>
        <span className="tileset-studio-card-meta">
          <span className="tileset-studio-card-text">
            <strong>Parish Militia</strong>
            <em>card layout · 9 gold</em>
          </span>
        </span>
      </button>
    </div>
  );
}
