import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { navigateApp } from './navigation';
import {
  fetchAdminLiveMediaCatalog,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { SliderRow } from './dressing/SliderRow';
import { StudioCatalogCard } from './studio/StudioCatalogCard';
import {
  CONCINNOUS_OFFER_DENOMINATOR,
  PESTIFEROUS_OFFER_DENOMINATOR,
  RUN_CARD_DECK,
  RUN_STARTING_GOLD,
  concinnousOfferRoll,
  openingShopOffers,
  pestiferousOfferRoll,
} from '../run/model';
import { runCardName } from '../run/cardNames';
import {
  RUN_CARD_APPROVED_TUNING,
  RUN_CARD_DEFAULT_CONTENTS_TUNING,
  RUN_CARD_CONCINNOUS_FRAME_SLOT,
  RUN_CARD_FRAME_SLOT,
  RUN_CARD_PESTIFEROUS_FRAME_SLOT,
  RUN_CARD_REFERENCE_WIDTH,
  RunCardFace,
  runCardUnitImageKind,
  type RunCardFaceContent,
  type RunCardContentsTuning,
  type RunCardImageKind,
} from './RunCardFace';

const ART_SLOT = 'ui/run/card-art/pppkb/illustration.png';
const CONCINNOUS_ART_SLOT = 'ui/run/card-art/pppk/illustration.png';
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
const ATARAXIA_SAMPLE_DRAWS = 64;
const DEFAULT_OPENING_SAMPLE_SEED = 4217;
const DEFAULT_CONTENTS_SCALE = 1;

const clampCardFontSize = (value: number, min: number, max: number): number => (
  Math.round(Math.min(max, Math.max(min, value)) * 100) / 100
);
const roundCardFontBoundUp = (value: number): number => Math.ceil((value - 1e-9) * 100) / 100;
const roundCardFontBoundDown = (value: number): number => Math.floor((value + 1e-9) * 100) / 100;
const clampCardHorizontal = (value: number, min = TEXT_HORIZONTAL_MIN, max = TEXT_HORIZONTAL_MAX): number => (
  Math.round(Math.min(max, Math.max(min, value)) * 100) / 100
);

const STANDARD_CARD = Object.freeze({
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

const CONCINNOUS_CARD = Object.freeze({
  name: "Banneret's Retinue",
  cost: 8,
  typeLine: 'Units — Concinnous',
  grants: [
    { count: 3, unit: 'pawn' },
    { count: 1, unit: 'knight' },
  ] as const,
  flavor: 'The banner arrived clean. Nothing else did.',
}) satisfies RunCardFaceContent;

export type RunCardPrototypeVariant = 'standard' | 'pestiferous' | 'concinnous';

export function runCardPrototypeVariantFromSearch(search: string): RunCardPrototypeVariant {
  const variant = new URLSearchParams(search).get('cardVariant');
  return variant === 'pestiferous' || variant === 'concinnous' ? variant : 'standard';
}

export function runCardPrototypeTargetRevealedFromSearch(search: string): boolean {
  return new URLSearchParams(search).get('concinnousTarget') === 'revealed';
}

export function runCardPrototypeContent(
  variant: RunCardPrototypeVariant,
  concinnousTargetRevealed = false,
): RunCardFaceContent {
  if (variant === 'pestiferous') return { ...STANDARD_CARD, typeLine: 'Units — Pestiferous' };
  if (variant === 'concinnous') {
    return {
      ...CONCINNOUS_CARD,
      properties: [{ name: 'Positioned', target: concinnousTargetRevealed ? 'Knight' : 'Target hidden' }],
    };
  }
  return STANDARD_CARD;
}

export function runCardContentsStudyFromSearch(search: string): boolean {
  return new URLSearchParams(search).get('contentsStudy') === '1';
}

export type RunCardContentsStudyProfile = Readonly<{
  id: 'roomy' | 'filled' | 'packed' | 'scrunched';
  label: string;
  load: string;
  card: RunCardFaceContent;
  tuning: RunCardContentsTuning;
}>;

// Uncommitted comparison specimens for the owner-visible Contents Box study. They
// deliberately keep one card identity and illustration so density is the variable.
export const RUN_CARD_CONTENTS_STUDY_PROFILES: readonly RunCardContentsStudyProfile[] = Object.freeze([
  {
    id: 'roomy',
    label: 'Roomy',
    load: '1 cell · 1 row',
    card: { ...STANDARD_CARD, grants: [{ count: 1, unit: 'queen' }] },
    tuning: {
      ...RUN_CARD_DEFAULT_CONTENTS_TUNING,
      unitHeight: 21,
      unitNaturalGap: 1.2,
      countSize: 8,
      countColumn: 8.5,
      rowGap: 1,
      paddingBlockStart: 1.5,
      paddingBlockEnd: 1.5,
    },
  },
  {
    id: 'filled',
    label: 'Filled',
    load: '2 cells · 2 rows',
    card: {
      ...STANDARD_CARD,
      grants: [
        { count: 3, unit: 'pawn' },
        { count: 1, unit: 'bishop' },
      ],
    },
    tuning: {
      ...RUN_CARD_DEFAULT_CONTENTS_TUNING,
      unitHeight: 12,
      unitNaturalGap: .9,
      countSize: 5.4,
      countColumn: 5.9,
      rowGap: .65,
      paddingBlockStart: 1.7,
      paddingBlockEnd: 1.7,
    },
  },
  {
    id: 'packed',
    label: 'Packed',
    load: '3 cells · 2 rows',
    card: {
      ...STANDARD_CARD,
      typeLine: 'Units — Concinnous',
    },
    tuning: {
      ...RUN_CARD_DEFAULT_CONTENTS_TUNING,
      unitHeight: 11.5,
      unitNaturalGap: .85,
      countSize: 4.9,
      countColumn: 5.4,
      rowGap: .6,
      paddingBlockStart: 1.5,
      paddingBlockEnd: 1.5,
    },
  },
  {
    id: 'scrunched',
    label: 'Scrunched',
    load: '5 cells · 3 rows',
    card: {
      ...STANDARD_CARD,
      typeLine: 'Units — Concinnous',
      grants: [
        { count: 3, unit: 'pawn' },
        { count: 1, unit: 'knight' },
        { count: 1, unit: 'bishop' },
        { count: 1, unit: 'rook' },
        { count: 1, unit: 'queen' },
      ],
    },
    tuning: {
      ...RUN_CARD_DEFAULT_CONTENTS_TUNING,
      unitHeight: 8,
      unitNaturalGap: .6,
      countSize: 3.8,
      countColumn: 4.3,
      columnGap: 1.5,
      rowGap: .45,
      flavorScale: .96,
      paddingBlockStart: 1.35,
      paddingBlockEnd: 1.35,
    },
  },
]);

export function scaledRunCardContentsTuning(
  tuning: RunCardContentsTuning,
  scale: number,
): RunCardContentsTuning {
  return {
    ...tuning,
    unitHeight: tuning.unitHeight * scale,
    unitNaturalGap: tuning.unitNaturalGap * scale,
    countSize: tuning.countSize * scale,
    countColumn: tuning.countColumn * scale,
    rowGap: tuning.rowGap * scale,
    effectSize: tuning.effectSize * scale,
    effectGap: tuning.effectGap * scale,
    flavorScale: tuning.flavorScale * scale,
  };
}

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
  const [cardVariant, setCardVariant] = useState<RunCardPrototypeVariant>(() => (
    runCardPrototypeVariantFromSearch(window.location.search)
  ));
  const [contentsStudy, setContentsStudy] = useState(() => runCardContentsStudyFromSearch(window.location.search));
  const [concinnousTargetRevealed, setConcinnousTargetRevealed] = useState(() => (
    runCardPrototypeTargetRevealedFromSearch(window.location.search)
  ));
  const [contentsScale, setContentsScale] = useState(DEFAULT_CONTENTS_SCALE);
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
  const [pestiferousDenominator, setPestiferousDenominator] = useState(PESTIFEROUS_OFFER_DENOMINATOR);
  const [openingSampleSeed, setOpeningSampleSeed] = useState(DEFAULT_OPENING_SAMPLE_SEED);
  const [concinnousDenominator, setConcinnousDenominator] = useState(CONCINNOUS_OFFER_DENOMINATOR);
  const [handoffCopyState, setHandoffCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [loaded, setLoaded] = useState<ReadonlySet<RunCardImageKind>>(() => new Set());
  const card = useMemo(
    () => runCardPrototypeContent(cardVariant, concinnousTargetRevealed),
    [cardVariant, concinnousTargetRevealed],
  );
  const frameSlot = !contentsStudy
    ? cardVariant === 'pestiferous'
      ? RUN_CARD_PESTIFEROUS_FRAME_SLOT
      : cardVariant === 'concinnous'
        ? RUN_CARD_CONCINNOUS_FRAME_SLOT
        : RUN_CARD_FRAME_SLOT
    : RUN_CARD_FRAME_SLOT;
  const realizedPestiferousCount = useMemo(() => (
    Array.from({ length: ATARAXIA_SAMPLE_DRAWS }, (_, index) => {
      const card = RUN_CARD_DECK[index % RUN_CARD_DECK.length];
      return pestiferousOfferRoll(4217, Math.floor(index / 4), index % 4, card.id, pestiferousDenominator);
    }).filter(Boolean).length
  ), [pestiferousDenominator]);
  const openingSample = useMemo(() => openingShopOffers(openingSampleSeed), [openingSampleSeed]);
  const realizedConcinnousCount = useMemo(() => (
    Array.from({ length: ATARAXIA_SAMPLE_DRAWS }, (_, index) => {
      const card = RUN_CARD_DECK[index % RUN_CARD_DECK.length];
      return card.value + 2 <= 9
        && concinnousOfferRoll(4217, Math.floor(index / 4), index % 4, card.id, concinnousDenominator);
    }).filter(Boolean).length
  ), [concinnousDenominator]);

  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);

  const frame = useMemo(
    () => catalog ? selectedCandidate(catalog, frameSlot, 'frameCandidate') : null,
    [catalog, frameSlot],
  );
  const artSlot = !contentsStudy && cardVariant === 'concinnous' ? CONCINNOUS_ART_SLOT : ART_SLOT;
  const art = useMemo(() => catalog ? selectedCandidate(catalog, artSlot, 'artCandidate') : null, [artSlot, catalog]);
  const missing = catalog && (!frame || !art) ? 'The requested frame or artwork candidate is unavailable.' : '';
  const sceneError = useMemo(() => error || missing ? new Error(error || missing) : null, [error, missing]);
  const painted = Boolean(
    frame
    && art
    && loaded.has('frame')
    && loaded.has('art')
    && card.grants.every((grant, cell) => (
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
    setContentsScale(DEFAULT_CONTENTS_SCALE);
    setPestiferousDenominator(PESTIFEROUS_OFFER_DENOMINATOR);
    setOpeningSampleSeed(DEFAULT_OPENING_SAMPLE_SEED);
    setConcinnousDenominator(CONCINNOUS_OFFER_DENOMINATOR);
    setTitleTypeSizeRatio(null);
    setTitleTypeHorizontalLocked(DEFAULT_TITLE_TYPE_HORIZONTAL_LOCKED);
    setHandoffCopyState('idle');
  };
  const chooseCardVariant = (next: RunCardPrototypeVariant): void => {
    const params = new URLSearchParams(window.location.search);
    if (next !== 'standard') params.set('cardVariant', next);
    else params.delete('cardVariant');
    params.delete('frameCandidate');
    const search = params.toString();
    navigateApp(
      `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
      { replace: true, scroll: false },
    );
    setCardVariant(next);
  };
  const chooseConcinnousTargetState = (revealed: boolean): void => {
    const params = new URLSearchParams(window.location.search);
    if (revealed) params.set('concinnousTarget', 'revealed');
    else params.delete('concinnousTarget');
    const search = params.toString();
    navigateApp(
      `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
      { replace: true, scroll: false },
    );
    setConcinnousTargetRevealed(revealed);
  };
  const chooseContentsStudy = (next: boolean): void => {
    const params = new URLSearchParams(window.location.search);
    if (next) params.set('contentsStudy', '1');
    else params.delete('contentsStudy');
    const search = params.toString();
    navigateApp(
      `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
      { replace: true, scroll: false },
    );
    setContentsStudy(next);
  };
  const copyCodexHandoff = async (): Promise<void> => {
    const payload = JSON.stringify({
      kind: 'run-card-layout-tuning',
      version: 3,
      card: card.name,
      cardVariant,
      referenceWidthPx: REFERENCE_CARD_WIDTH,
      units: 'percent of card width (cqw)',
      frameSha256: frame?.media?.sha256 ?? null,
      artworkSha256: art?.media?.sha256 ?? null,
      title: { size: titleSize, horizontal: titleX, vertical: titleY },
      type: { size: typeSize, horizontal: typeX, vertical: typeY },
      cost: { size: costSize, horizontal: costX, vertical: costY },
      flavor: { size: flavorSize },
      contentsStudy: contentsStudy ? {
        scale: contentsScale,
        profiles: RUN_CARD_CONTENTS_STUDY_PROFILES.map(({ id, load, tuning: contents }) => ({ id, load, contents })),
      } : null,
      locks: {
        titleTypeSizeRatio,
        titleTypeHorizontalLocked,
      },
      ataraxiaI: {
        pestiferousDenominator,
        sampleSeed: 4217,
        sampleDraws: ATARAXIA_SAMPLE_DRAWS,
        realizedPestiferousCount,
      },
      opening: {
        seed: openingSampleSeed,
        startingGold: RUN_STARTING_GOLD,
        startingArmy: ['king', 'pawn', 'pawn'],
        offers: openingSample.map((offer) => ({
          id: offer.id,
          name: runCardName(offer),
          value: offer.value,
          pieces: offer.pieces,
        })),
      },
      concinnous: {
        denominator: concinnousDenominator,
        sampleSeed: 4217,
        sampleDraws: ATARAXIA_SAMPLE_DRAWS,
        realizedCount: realizedConcinnousCount,
        target: concinnousTargetRevealed ? 'revealed' : 'hidden',
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
          <div className={`run-card-prototype-stage${contentsStudy ? ' is-contents-study' : ''}`}>
            {contentsStudy ? (
              <div className="run-card-contents-study" aria-label="Contents Box density comparison">
                {RUN_CARD_CONTENTS_STUDY_PROFILES.map((profile) => (
                  <article className="run-card-contents-specimen" data-contents-density={profile.id} key={profile.id}>
                    <header>
                      <strong>{profile.label}</strong>
                      <span>{profile.load}</span>
                    </header>
                    <RunCardFace
                      card={profile.card}
                      frameUrl={frame.media!.url}
                      artUrl={art.media!.url}
                      width={`${REFERENCE_CARD_WIDTH * viewerZoom}px`}
                      tuning={{ costX, costY, costSize, titleX, titleY, titleSize, typeX, typeY, typeSize, flavorSize }}
                      contentsTuning={scaledRunCardContentsTuning(profile.tuning, contentsScale)}
                      onImageLoad={onImageLoad}
                      onImageError={onImageError}
                    />
                  </article>
                ))}
              </div>
            ) : (
              <RunCardFace
                card={card}
                frameUrl={frame.media!.url}
                artUrl={art.media!.url}
                width={`${REFERENCE_CARD_WIDTH * viewerZoom}px`}
                tuning={{ costX, costY, costSize, titleX, titleY, titleSize, typeX, typeY, typeSize, flavorSize }}
                onImageLoad={onImageLoad}
                onImageError={onImageError}
              />
            )}
          </div>
        ) : null}
      </section>

      <aside className="tileset-view-controls run-card-prototype-controls" aria-label="Card layout controls">
        <section className="tileset-inspector-section">
          <h2>Card Layout</h2>
          <div className="tileset-control-stack">
            {header}
            <p className="run-card-prototype-note">
              {contentsStudy
                ? 'Uncommitted full-size comparisons. The same frame, art, title, and flavor isolate the Contents Box; raise Contents scale to probe the clipping boundary.'
                : 'Prototype instrument. The Studio Zoom control changes only the preview scale.'}
            </p>
            <div className="tileset-button-row" role="group" aria-label="Preview mode">
              <button
                type="button"
                className={`tileset-view-action${!contentsStudy ? ' active' : ''}`}
                data-card-preview-mode="single"
                aria-pressed={!contentsStudy}
                onClick={() => chooseContentsStudy(false)}
              >Single card</button>
              <button
                type="button"
                className={`tileset-view-action${contentsStudy ? ' active' : ''}`}
                data-card-preview-mode="contents-study"
                aria-pressed={contentsStudy}
                onClick={() => chooseContentsStudy(true)}
              >Contents study</button>
            </div>
            {contentsStudy ? (
              <SliderRow
                label={<>Contents scale · {Math.round(contentsScale * 100)}%</>}
                value={contentsScale}
                set={setContentsScale}
                min={.75}
                max={1.25}
                step={.01}
                nudge={.05}
                dflt={DEFAULT_CONTENTS_SCALE}
              />
            ) : (
              <div className="tileset-button-row" role="group" aria-label="Card variant">
                <button
                  type="button"
                  className={`tileset-view-action${cardVariant === 'standard' ? ' active' : ''}`}
                  data-card-variant="standard"
                  aria-pressed={cardVariant === 'standard'}
                  onClick={() => chooseCardVariant('standard')}
                >Standard</button>
                <button
                  type="button"
                  className={`tileset-view-action${cardVariant === 'pestiferous' ? ' active' : ''}`}
                  data-card-variant="pestiferous"
                  aria-pressed={cardVariant === 'pestiferous'}
                  onClick={() => chooseCardVariant('pestiferous')}
                >Pestiferous</button>
                <button
                  type="button"
                  className={`tileset-view-action${cardVariant === 'concinnous' ? ' active' : ''}`}
                  data-card-variant="concinnous"
                  aria-pressed={cardVariant === 'concinnous'}
                  onClick={() => chooseCardVariant('concinnous')}
                >Concinnous</button>
              </div>
            )}
            {!contentsStudy && cardVariant === 'concinnous' ? (
              <div className="tileset-button-row" role="group" aria-label="Concinnous target visibility">
                <button
                  type="button"
                  className={`tileset-view-action${!concinnousTargetRevealed ? ' active' : ''}`}
                  aria-pressed={!concinnousTargetRevealed}
                  onClick={() => chooseConcinnousTargetState(false)}
                >Before purchase · hidden</button>
                <button
                  type="button"
                  className={`tileset-view-action${concinnousTargetRevealed ? ' active' : ''}`}
                  aria-pressed={concinnousTargetRevealed}
                  onClick={() => chooseConcinnousTargetState(true)}
                >After purchase · Knight</button>
              </div>
            ) : null}
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
            <SliderRow
              label={<>Ataraxia I prevalence · 1 in {pestiferousDenominator}</>}
              value={pestiferousDenominator}
              set={setPestiferousDenominator}
              min={2}
              max={24}
              step={1}
              nudge={1}
              dflt={PESTIFEROUS_OFFER_DENOMINATOR}
            />
            <SliderRow
              label={<>Opening sample seed · {openingSampleSeed}</>}
              value={openingSampleSeed}
              set={setOpeningSampleSeed}
              min={1}
              max={9999}
              step={1}
              nudge={1}
              dflt={DEFAULT_OPENING_SAMPLE_SEED}
            />
            <SliderRow
              label={<>Concinnous prevalence · 1 in {concinnousDenominator} eligible offers</>}
              value={concinnousDenominator}
              set={setConcinnousDenominator}
              min={2}
              max={24}
              step={1}
              nudge={1}
              dflt={CONCINNOUS_OFFER_DENOMINATOR}
            />
            {frame && art ? (
              <dl className="run-card-prototype-source-readout">
                <div><dt>Frame</dt><dd>{frame.media!.sha256.slice(0, 12)} · {frame.status}</dd></div>
                <div><dt>Artwork</dt><dd>{art.media!.sha256.slice(0, 12)} · {art.status}</dd></div>
                <div><dt>Card</dt><dd>{contentsStudy ? 'Contents Box density study' : card.typeLine}</dd></div>
                <div><dt>Ataraxia I sample</dt><dd>{realizedPestiferousCount} / {ATARAXIA_SAMPLE_DRAWS} Pestiferous · seed 4217</dd></div>
                <div><dt>Opening budget</dt><dd>{RUN_STARTING_GOLD} gold · buy any affordable cards</dd></div>
                <div><dt>Opening party</dt><dd>King + 2 Pawns + purchased cards</dd></div>
                <div><dt>Opening sample</dt><dd>{openingSample.map((offer) => `${runCardName(offer)} (${offer.value})`).join(' · ')}</dd></div>
                <div><dt>Eligible sample</dt><dd>{realizedConcinnousCount} / {ATARAXIA_SAMPLE_DRAWS} Concinnous · seed 4217</dd></div>
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
      <StudioCatalogCard title="Parish Militia" badge="card layout · 9 gold" selected onSelect={onOpen} titleText="Open the Parish Militia card layout instrument" imageClassName="pages-card-image run-card-prototype-catalog-image" media={<span>5:7</span>} />
    </div>
  );
}
