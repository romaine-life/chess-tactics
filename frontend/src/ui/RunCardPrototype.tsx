import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import {
  fetchAdminLiveMediaCatalog,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { SliderRow } from './dressing/SliderRow';
import {
  RUN_CARD_APPROVED_TUNING,
  RUN_CARD_FRAME_SLOT,
  RUN_CARD_REFERENCE_WIDTH,
  RunCardFace,
  runCardUnitImageKind,
  type RunCardFaceContent,
  type RunCardImageKind,
} from './RunCardFace';

const FRAME_SLOT = RUN_CARD_FRAME_SLOT;
const ART_SLOT = 'ui/run/card-art/pppkb/illustration.png';
const SHA256 = /^[0-9a-f]{64}$/;
const REFERENCE_CARD_WIDTH = RUN_CARD_REFERENCE_WIDTH;
const TEXT_HORIZONTAL_MIN = -3;
const TEXT_HORIZONTAL_MAX = 3;
const TITLE_SIZE_MIN = 3;
const TITLE_SIZE_MAX = 7;
const DEFAULT_TITLE_SIZE = RUN_CARD_APPROVED_TUNING.titleSize;
const DEFAULT_TITLE_X = RUN_CARD_APPROVED_TUNING.titleX;
const DEFAULT_TITLE_Y = RUN_CARD_APPROVED_TUNING.titleY;
const DEFAULT_COST_SIZE = RUN_CARD_APPROVED_TUNING.costSize;
const DEFAULT_COST_X = RUN_CARD_APPROVED_TUNING.costX;
const DEFAULT_COST_Y = RUN_CARD_APPROVED_TUNING.costY;
const TYPE_SIZE_MIN = 2.5;
const TYPE_SIZE_MAX = 6;
const DEFAULT_TYPE_SIZE = RUN_CARD_APPROVED_TUNING.typeSize;
const DEFAULT_TYPE_X = RUN_CARD_APPROVED_TUNING.typeX;
const DEFAULT_TYPE_Y = RUN_CARD_APPROVED_TUNING.typeY;
const DEFAULT_FLAVOR_SIZE = RUN_CARD_APPROVED_TUNING.flavorSize;
const DEFAULT_TITLE_TYPE_HORIZONTAL_LOCKED = true;

const clampCardFontSize = (value: number, min: number, max: number): number => (
  Math.round(Math.min(max, Math.max(min, value)) * 100) / 100
);
const roundCardFontBoundUp = (value: number): number => Math.ceil((value - 1e-9) * 100) / 100;
const roundCardFontBoundDown = (value: number): number => Math.floor((value + 1e-9) * 100) / 100;
const clampCardHorizontal = (value: number, min = TEXT_HORIZONTAL_MIN, max = TEXT_HORIZONTAL_MAX): number => (
  Math.round(Math.min(max, Math.max(min, value)) * 100) / 100
);

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
}) satisfies RunCardFaceContent;

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

export function RunCardPrototypeViewer({
  header,
  viewerZoom,
}: {
  header?: ReactNode;
  viewerZoom: number;
}): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  const [costX, setCostX] = useState(DEFAULT_COST_X);
  const [costY, setCostY] = useState(DEFAULT_COST_Y);
  const [costSize, setCostSize] = useState(DEFAULT_COST_SIZE);
  const [titleX, setTitleX] = useState(DEFAULT_TITLE_X);
  const [titleY, setTitleY] = useState(DEFAULT_TITLE_Y);
  const [titleSize, setTitleSize] = useState(DEFAULT_TITLE_SIZE);
  const [typeX, setTypeX] = useState(DEFAULT_TYPE_X);
  const [typeY, setTypeY] = useState(DEFAULT_TYPE_Y);
  const [typeSize, setTypeSize] = useState(DEFAULT_TYPE_SIZE);
  const [titleTypeSizeRatio, setTitleTypeSizeRatio] = useState<number | null>(null);
  const [titleTypeHorizontalLocked, setTitleTypeHorizontalLocked] = useState(DEFAULT_TITLE_TYPE_HORIZONTAL_LOCKED);
  const [flavorSize, setFlavorSize] = useState(DEFAULT_FLAVOR_SIZE);
  const [handoffCopyState, setHandoffCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [loaded, setLoaded] = useState<ReadonlySet<RunCardImageKind>>(() => new Set());

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
      Array.from({ length: grant.count }, (_, index) => runCardUnitImageKind(cell, grant.unit, index))
        .every((kind) => loaded.has(kind))
    )),
  );
  const onImageLoad = (kind: RunCardImageKind): void => {
    setLoaded((current) => current.has(kind) ? current : new Set([...current, kind]));
  };
  const onImageError = (kind: RunCardImageKind): void => setError(`${kind} image could not be decoded.`);
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
  const setLinkedTitleHorizontal = (nextTitleX: number): void => {
    const clampedTitleX = clampCardHorizontal(nextTitleX);
    setTitleX(clampedTitleX);
    if (titleTypeHorizontalLocked) setTypeX(clampedTitleX);
  };
  const setLinkedTypeHorizontal = (nextTypeX: number): void => {
    const clampedTypeX = clampCardHorizontal(nextTypeX);
    setTypeX(clampedTypeX);
    if (titleTypeHorizontalLocked) setTitleX(clampedTypeX);
  };
  const toggleTitleTypeHorizontalLock = (): void => {
    if (titleTypeHorizontalLocked) {
      setTitleTypeHorizontalLocked(false);
      return;
    }
    const alignedHorizontal = clampCardHorizontal(titleX);
    setTitleX(alignedHorizontal);
    setTypeX(alignedHorizontal);
    setTitleTypeHorizontalLocked(true);
  };
  const resetAllTuning = (): void => {
    setCostX(DEFAULT_COST_X);
    setCostY(DEFAULT_COST_Y);
    setCostSize(DEFAULT_COST_SIZE);
    setTitleX(DEFAULT_TITLE_X);
    setTitleY(DEFAULT_TITLE_Y);
    setTitleSize(DEFAULT_TITLE_SIZE);
    setTypeX(DEFAULT_TYPE_X);
    setTypeY(DEFAULT_TYPE_Y);
    setTypeSize(DEFAULT_TYPE_SIZE);
    setFlavorSize(DEFAULT_FLAVOR_SIZE);
    setTitleTypeSizeRatio(null);
    setTitleTypeHorizontalLocked(DEFAULT_TITLE_TYPE_HORIZONTAL_LOCKED);
    setHandoffCopyState('idle');
  };
  const copyCodexHandoff = async (): Promise<void> => {
    const payload = JSON.stringify({
      kind: 'run-card-layout-tuning',
      version: 2,
      card: CARD.name,
      referenceWidthPx: REFERENCE_CARD_WIDTH,
      units: 'percent of card width (cqw)',
      frameSha256: frame?.media?.sha256 ?? null,
      artworkSha256: art?.media?.sha256 ?? null,
      title: { size: titleSize, horizontal: titleX, vertical: titleY },
      type: { size: typeSize, horizontal: typeX, vertical: typeY },
      cost: { size: costSize, horizontal: costX, vertical: costY },
      flavor: { size: flavorSize },
      locks: {
        titleTypeSizeRatio,
        titleTypeHorizontalLocked,
      },
    }, null, 2);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(payload);
      setHandoffCopyState('copied');
      window.setTimeout(() => setHandoffCopyState('idle'), 1800);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = payload;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      setHandoffCopyState(copied ? 'copied' : 'error');
    }
  };

  return (
    <>
      <section className="al-lab-main run-card-prototype-main" aria-label="Card layout preview">
        {sceneError ? <p role="alert">{sceneError.message}</p> : null}
        {!sceneError && !painted ? <p role="status">Loading exact candidate pixels…</p> : null}
        {frame && art ? (
          <div className="run-card-prototype-stage">
            <RunCardFace
              card={CARD}
              frameUrl={frame.media!.url}
              artUrl={art.media!.url}
              width={`${REFERENCE_CARD_WIDTH * viewerZoom}px`}
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
            <div className="tileset-button-row run-card-prototype-actions">
              <button
                type="button"
                className="tileset-view-action"
                data-card-layout-action="reset"
                onClick={resetAllTuning}
              >Reset all</button>
              <button
                type="button"
                className="tileset-view-action"
                data-card-layout-action="copy-handoff"
                onClick={() => { void copyCodexHandoff(); }}
              >
                {handoffCopyState === 'copied' ? 'Copied handoff' : handoffCopyState === 'error' ? 'Copy failed' : 'Copy handoff'}
              </button>
            </div>
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
            <SliderRow label={<>Title horizontal · {titleX.toFixed(2)}%</>} value={titleX} set={setLinkedTitleHorizontal} min={TEXT_HORIZONTAL_MIN} max={TEXT_HORIZONTAL_MAX} step={.05} nudge={.05} dflt={DEFAULT_TITLE_X} />
            <button
              type="button"
              data-card-pair-lock="horizontal"
              className={`tileset-view-action run-card-prototype-pair-lock${titleTypeHorizontalLocked ? ' active' : ''}`}
              aria-pressed={titleTypeHorizontalLocked}
              title="Align the type left edge to the title, then move both together"
              onClick={toggleTitleTypeHorizontalLock}
            >
              {titleTypeHorizontalLocked ? 'Title/type left edges locked' : 'Align & lock title/type left edges'}
            </button>
            <SliderRow label={<>Type horizontal · {typeX.toFixed(2)}%</>} value={typeX} set={setLinkedTypeHorizontal} min={TEXT_HORIZONTAL_MIN} max={TEXT_HORIZONTAL_MAX} step={.05} nudge={.05} dflt={DEFAULT_TYPE_X} />
            <SliderRow label={<>Title vertical · {titleY.toFixed(2)}%</>} value={titleY} set={setTitleY} min={-3} max={3} step={.05} nudge={.05} dflt={DEFAULT_TITLE_Y} />
            <SliderRow label={<>Type vertical · {typeY.toFixed(2)}%</>} value={typeY} set={setTypeY} min={-3} max={3} step={.05} nudge={.05} dflt={DEFAULT_TYPE_Y} />
            <SliderRow label={<>Cost size · {costSize.toFixed(2)}%</>} value={costSize} set={setCostSize} min={3} max={9} step={.05} nudge={.05} dflt={DEFAULT_COST_SIZE} />
            <SliderRow label={<>Cost horizontal · {costX.toFixed(2)}%</>} value={costX} set={setCostX} min={-3} max={3} step={.05} nudge={.05} dflt={DEFAULT_COST_X} />
            <SliderRow label={<>Cost vertical · {costY.toFixed(2)}%</>} value={costY} set={setCostY} min={-3} max={3} step={.05} nudge={.05} dflt={DEFAULT_COST_Y} />
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
