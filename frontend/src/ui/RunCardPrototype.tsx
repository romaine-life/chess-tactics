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
  AGMINATE_COST,
  AGMINATE_DISPLAY_NAME,
  CONCINNOUS_OFFER_DENOMINATOR,
  DISCIPLINE_COST,
  HIERATIC_AGMINATE_OFFER_DENOMINATOR,
  PESTIFEROUS_OFFER_DENOMINATOR,
  RUN_CARD_DECK,
  RUN_STARTING_GOLD,
  TACTICAL_DISCIPLINE_OFFER_DENOMINATOR,
  concinnousOfferRoll,
  hieraticAgminateOfferRoll,
  openingShopOffers,
  pestiferousOfferRoll,
  tacticalDisciplineOfferRoll,
} from '../run/model';
import { runCardName } from '../run/cardNames';
import {
  RUN_CARD_APPROVED_TUNING,
  RUN_CARD_CONTENTS_DENSITY_LADDER,
  RUN_CARD_COST_COIN_SOURCE_SLOT,
  RUN_CARD_CONCINNOUS_FRAME_SLOT,
  RUN_CARD_FRAME_SLOT,
  RUN_CARD_HIERATIC_FRAME_SLOT,
  RUN_CARD_PESTIFEROUS_FRAME_SLOT,
  RUN_CARD_REFERENCE_WIDTH,
  RUN_CARD_TACTICAL_FRAME_SLOT,
  RunCardFace,
  runCardUnitImageKind,
  type RunCardContentsDensity,
  type RunCardFaceContent,
  type RunCardContentsTuning,
  type RunCardImageKind,
} from './RunCardFace';
import {
  RUN_CARD_FRAME_BOX_LABELS,
  RUN_CARD_FRAME_BOX_NAMES,
  RUN_CARD_FRAME_BOX_STYLES,
  RUN_CARD_FRAME_GEOMETRY_BY_VARIANT,
  RUN_CARD_FRAME_NATIVE_HEIGHT,
  RUN_CARD_FRAME_NATIVE_WIDTH,
  RUN_CARD_FRAME_VARIANTS,
  RUN_CARD_STANDARD_FRAME_GEOMETRY,
  RUN_CARD_TEXT_PLACEMENT,
  runCardFrameGeometryForSlot,
  runCardFrameGeometryMatchesPixels,
  runCardFrameGeometryWithBoxes,
  type RunCardFrameBoxName,
  type RunCardFrameBoxStyle,
  type RunCardFrameBoxes,
  type RunCardFrameRect,
  type RunCardFrameVariant,
} from './runCardFrameGeometry';

const STANDARD_ART_SLOT = 'ui/run/card-art/pppkb/illustration.png';
const TACTICAL_ART_SLOT = 'ui/run/card-art/q/illustration.png';
const CONCINNOUS_ART_SLOT = 'ui/run/card-art/pp/illustration.png';
const SHA256 = /^[0-9a-f]{64}$/;
const REFERENCE_CARD_WIDTH = RUN_CARD_REFERENCE_WIDTH;
const TITLE_SIZE_MIN = 3;
const TITLE_SIZE_MAX = 7;
const DEFAULT_TITLE_SIZE = RUN_CARD_APPROVED_TUNING.titleSize;
const DEFAULT_COST_SIZE = RUN_CARD_APPROVED_TUNING.costSize;
const TYPE_SIZE_MIN = 2.5;
const TYPE_SIZE_MAX = 6;
const DEFAULT_TYPE_SIZE = RUN_CARD_APPROVED_TUNING.typeSize;
const DEFAULT_FLAVOR_SIZE = RUN_CARD_APPROVED_TUNING.flavorSize;
const DEFAULT_TEXT_INSET = RUN_CARD_APPROVED_TUNING.textInset;
const DEFAULT_TEXT_OPTICAL = RUN_CARD_APPROVED_TUNING.textOptical;
const RUN_CARD_SAMPLE_DRAWS = 64;
const DEFAULT_OPENING_SAMPLE_SEED = 4217;
const DEFAULT_CONTENTS_SCALE = 1;

const clampCardFontSize = (value: number, min: number, max: number): number => (
  Math.round(Math.min(max, Math.max(min, value)) * 100) / 100
);
const roundCardFontBoundUp = (value: number): number => Math.ceil((value - 1e-9) * 100) / 100;
const roundCardFontBoundDown = (value: number): number => Math.floor((value + 1e-9) * 100) / 100;

/** The owner's by-eye box tuning, one draft per frame, seeded from what shipped. */
export type RunCardFrameBoxDrafts = Readonly<Record<RunCardFrameVariant, RunCardFrameBoxes>>;

export function committedRunCardFrameBoxDrafts(): RunCardFrameBoxDrafts {
  return Object.fromEntries(RUN_CARD_FRAME_VARIANTS.map((variant) => [
    variant,
    { ...RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[variant].boxes },
  ])) as RunCardFrameBoxDrafts;
}

export function runCardFrameBoxDraftsWithEdge(
  drafts: RunCardFrameBoxDrafts,
  variant: RunCardFrameVariant,
  box: RunCardFrameBoxName,
  edge: keyof RunCardFrameRect,
  value: number,
): RunCardFrameBoxDrafts {
  return {
    ...drafts,
    [variant]: {
      ...drafts[variant],
      [box]: { ...drafts[variant][box], [edge]: Math.round(value * 100) / 100 },
    },
  };
}

/** True once any frame's boxes differ from what is committed in the geometry table. */
export function runCardFrameBoxDraftsAreTuned(drafts: RunCardFrameBoxDrafts): boolean {
  return RUN_CARD_FRAME_VARIANTS.some((variant) => RUN_CARD_FRAME_BOX_NAMES.some((box) => {
    const committed = RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[variant].boxes[box];
    const draft = drafts[variant][box];
    return committed.x !== draft.x || committed.y !== draft.y
      || committed.width !== draft.width || committed.height !== draft.height;
  }));
}

const boxEdgeReadout = (value: number, total: number): string => (
  `${Math.round(value)} px · ${((value / total) * 100).toFixed(2)}%`
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
  name: 'Two Good Boots',
  cost: 4,
  typeLine: 'Units — Concinnous',
  grants: [{ count: 2, unit: 'pawn' }] as const,
  flavor: 'The road kept both pairs of boots, and returned neither name.',
}) satisfies RunCardFaceContent;

const TACTICAL_SINGLE_CARD = Object.freeze({
  name: 'Regal Serenity',
  cost: 9 + DISCIPLINE_COST,
  typeLine: 'Units — Tactical',
  grants: [{ count: 1, unit: 'queen', ability: 'discipline' }] as const,
  flavor: 'She watched the empty court until ceremony became weather.',
}) satisfies RunCardFaceContent;

const TACTICAL_MULTI_CARD = Object.freeze({
  ...STANDARD_CARD,
  cost: 9 + DISCIPLINE_COST,
  typeLine: 'Units — Tactical',
}) satisfies RunCardFaceContent;

const HIERATIC_CARD = Object.freeze({
  ...STANDARD_CARD,
  cost: 9 + AGMINATE_COST,
  typeLine: 'Units — Hieratic',
  properties: [{ name: AGMINATE_DISPLAY_NAME, target: 'Chosen on purchase' }] as const,
}) satisfies RunCardFaceContent;

export type RunCardPrototypeVariant = RunCardFrameVariant;
export type RunCardTacticalSpecimen = 'single' | 'multi';

export function runCardPrototypeVariantFromSearch(search: string): RunCardPrototypeVariant {
  const variant = new URLSearchParams(search).get('cardVariant');
  return variant === 'pestiferous'
    || variant === 'tactical'
    || variant === 'concinnous'
    || variant === 'hieratic'
    ? variant
    : 'standard';
}

export function runCardTacticalSpecimenFromSearch(search: string): RunCardTacticalSpecimen {
  return new URLSearchParams(search).get('tacticalSpecimen') === 'multi' ? 'multi' : 'single';
}

export function runCardConcinnousTargetRevealedFromSearch(search: string): boolean {
  return new URLSearchParams(search).get('concinnousTarget') === 'revealed';
}

/**
 * `frameBoxes=1` is the original solid overlay; `dotted` is the alignment pass,
 * where a hairline hint leaves the frame's own painted plate edge readable.
 */
export function runCardFrameBoxStyleFromSearch(search: string): RunCardFrameBoxStyle {
  const value = new URLSearchParams(search).get('frameBoxes');
  if (value === '1' || value === 'solid') return 'solid';
  return value === 'dotted' ? 'dotted' : 'off';
}

export function runCardPrototypeCostFromSearch(search: string): number | null {
  const value = Number(new URLSearchParams(search).get('cardCost'));
  return Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
}

export function runCardPrototypeContent(
  variant: RunCardPrototypeVariant,
  tacticalSpecimen: RunCardTacticalSpecimen = 'single',
  concinnousTargetRevealed = false,
): RunCardFaceContent {
  if (variant === 'pestiferous') {
    return {
      ...STANDARD_CARD,
      cost: 8,
      typeLine: 'Units — Pestiferous',
      grants: STANDARD_CARD.grants.map((grant) => (
        grant.unit === 'bishop' ? { ...grant, plaguedIndices: [0] } : grant
      )),
    };
  }
  if (variant === 'tactical') {
    return tacticalSpecimen === 'multi' ? TACTICAL_MULTI_CARD : TACTICAL_SINGLE_CARD;
  }
  if (variant === 'concinnous') {
    return {
      ...CONCINNOUS_CARD,
      properties: [{ name: 'Positioned', target: concinnousTargetRevealed ? 'Pawn 1' : 'Target hidden' }],
    };
  }
  if (variant === 'hieratic') return HIERATIC_CARD;
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

const CONTENTS_STUDY_TUNING_BY_DENSITY = Object.fromEntries(
  RUN_CARD_CONTENTS_DENSITY_LADDER.map(({ density, tuning }) => [density, tuning]),
) as Readonly<Record<RunCardContentsDensity, RunCardContentsTuning>>;

// Comparison specimens for the owner-visible Contents Box study, pinned to the
// accepted density ladder the live face now derives per card load. They
// deliberately keep one card identity and illustration so density is the variable.
export const RUN_CARD_CONTENTS_STUDY_PROFILES: readonly RunCardContentsStudyProfile[] = Object.freeze([
  {
    id: 'roomy',
    label: 'Roomy',
    load: '1 cell · 1 row',
    card: { ...STANDARD_CARD, grants: [{ count: 1, unit: 'queen' }] },
    tuning: CONTENTS_STUDY_TUNING_BY_DENSITY.roomy,
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
    tuning: CONTENTS_STUDY_TUNING_BY_DENSITY.filled,
  },
  {
    id: 'packed',
    label: 'Packed',
    load: '3 cells · 2 rows',
    card: {
      ...STANDARD_CARD,
      typeLine: 'Units — Concinnous',
    },
    tuning: CONTENTS_STUDY_TUNING_BY_DENSITY.packed,
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
    tuning: CONTENTS_STUDY_TUNING_BY_DENSITY.scrunched,
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

function activeCandidate(catalog: AdminLiveMediaCatalog, slot: string): AdminLiveMediaVersion | null {
  const eligible = catalog.versions.filter((version) => (
    version.slot === slot
    && Boolean(version.media?.url)
    && (version.status === 'candidate' || version.status === 'accepted')
  ));
  const activeVersionId = catalog.slots.find((entry) => entry.slot === slot)?.activeVersionId;
  const active = activeVersionId ? eligible.find((version) => version.id === activeVersionId) : null;
  if (active) return active;
  return [...eligible].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function selectedCandidate(
  catalog: AdminLiveMediaCatalog,
  slot: string,
  queryName: string,
): AdminLiveMediaVersion | null {
  const requested = new URLSearchParams(window.location.search).get(queryName)?.trim().toLowerCase();
  if (requested) {
    if (!SHA256.test(requested)) return null;
    return catalog.versions.find((version) => (
      version.slot === slot
      && Boolean(version.media?.url)
      && (version.status === 'candidate' || version.status === 'accepted')
      && version.media?.sha256 === requested
    )) ?? null;
  }
  return activeCandidate(catalog, slot);
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
  const [tacticalSpecimen, setTacticalSpecimen] = useState<RunCardTacticalSpecimen>(() => (
    runCardTacticalSpecimenFromSearch(window.location.search)
  ));
  const [contentsStudy, setContentsStudy] = useState(() => runCardContentsStudyFromSearch(window.location.search));
  const [concinnousTargetRevealed, setConcinnousTargetRevealed] = useState(() => (
    runCardConcinnousTargetRevealedFromSearch(window.location.search)
  ));
  const [frameBoxStyle, setFrameBoxStyle] = useState<RunCardFrameBoxStyle>(() => (
    runCardFrameBoxStyleFromSearch(window.location.search)
  ));
  const [previewCost, setPreviewCost] = useState<number | null>(() => (
    runCardPrototypeCostFromSearch(window.location.search)
  ));
  const [contentsScale, setContentsScale] = useState(DEFAULT_CONTENTS_SCALE);
  const [costSize, setCostSize] = useState(DEFAULT_COST_SIZE);
  const [titleSize, setTitleSize] = useState(DEFAULT_TITLE_SIZE);
  const [typeSize, setTypeSize] = useState(DEFAULT_TYPE_SIZE);
  const [titleTypeSizeRatio, setTitleTypeSizeRatio] = useState<number | null>(null);
  const [flavorSize, setFlavorSize] = useState(DEFAULT_FLAVOR_SIZE);
  const [textInset, setTextInset] = useState(DEFAULT_TEXT_INSET);
  const [textOptical, setTextOptical] = useState(DEFAULT_TEXT_OPTICAL);
  const [frameBoxDrafts, setFrameBoxDrafts] = useState<RunCardFrameBoxDrafts>(committedRunCardFrameBoxDrafts);
  const [selectedFrameBox, setSelectedFrameBox] = useState<RunCardFrameBoxName>('type');
  const [pestiferousDenominator, setPestiferousDenominator] = useState(PESTIFEROUS_OFFER_DENOMINATOR);
  const [openingSampleSeed, setOpeningSampleSeed] = useState(DEFAULT_OPENING_SAMPLE_SEED);
  const [tacticalDenominator, setTacticalDenominator] = useState(TACTICAL_DISCIPLINE_OFFER_DENOMINATOR);
  const [concinnousDenominator, setConcinnousDenominator] = useState(CONCINNOUS_OFFER_DENOMINATOR);
  const [hieraticDenominator, setHieraticDenominator] = useState(HIERATIC_AGMINATE_OFFER_DENOMINATOR);
  const [handoffCopyState, setHandoffCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [loaded, setLoaded] = useState<ReadonlySet<RunCardImageKind>>(() => new Set());
  const card = useMemo(
    () => runCardPrototypeContent(cardVariant, tacticalSpecimen, concinnousTargetRevealed),
    [cardVariant, tacticalSpecimen, concinnousTargetRevealed],
  );
  const displayedCard = useMemo(
    () => previewCost === null ? card : { ...card, cost: previewCost },
    [card, previewCost],
  );
  const frameSlot = contentsStudy
    ? RUN_CARD_FRAME_SLOT
    : cardVariant === 'pestiferous'
      ? RUN_CARD_PESTIFEROUS_FRAME_SLOT
      : cardVariant === 'tactical'
        ? RUN_CARD_TACTICAL_FRAME_SLOT
        : cardVariant === 'concinnous'
          ? RUN_CARD_CONCINNOUS_FRAME_SLOT
          : cardVariant === 'hieratic'
            ? RUN_CARD_HIERATIC_FRAME_SLOT
            : RUN_CARD_FRAME_SLOT;
  const realizedPestiferousCount = useMemo(() => (
    Array.from({ length: RUN_CARD_SAMPLE_DRAWS }, (_, index) => {
      const card = RUN_CARD_DECK[index % RUN_CARD_DECK.length];
      return pestiferousOfferRoll(4217, Math.floor(index / 4), index % 4, card.id, pestiferousDenominator);
    }).filter(Boolean).length
  ), [pestiferousDenominator]);
  const openingSample = useMemo(() => openingShopOffers(openingSampleSeed), [openingSampleSeed]);
  const realizedTacticalCount = useMemo(() => (
    Array.from({ length: RUN_CARD_SAMPLE_DRAWS }, (_, index) => {
      const card = RUN_CARD_DECK[index % RUN_CARD_DECK.length];
      return tacticalDisciplineOfferRoll(
        4217,
        Math.floor(index / 4),
        index % 4,
        card.id,
        tacticalDenominator,
      );
    }).filter(Boolean).length
  ), [tacticalDenominator]);
  const realizedConcinnousCount = useMemo(() => (
    Array.from({ length: RUN_CARD_SAMPLE_DRAWS }, (_, index) => {
      const card = RUN_CARD_DECK[index % RUN_CARD_DECK.length];
      return concinnousOfferRoll(4217, Math.floor(index / 4), index % 4, card.id, concinnousDenominator);
    }).filter(Boolean).length
  ), [concinnousDenominator]);
  const realizedHieraticCount = useMemo(() => (
    Array.from({ length: RUN_CARD_SAMPLE_DRAWS }, (_, index) => {
      const card = RUN_CARD_DECK[index % RUN_CARD_DECK.length];
      return hieraticAgminateOfferRoll(4217, Math.floor(index / 4), index % 4, card.id, hieraticDenominator);
    }).filter(Boolean).length
  ), [hieraticDenominator]);

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
  // Contents study always draws the Standard frame, so it tunes Standard's boxes.
  const geometryVariant: RunCardFrameVariant = contentsStudy ? 'standard' : cardVariant;
  const committedGeometry = runCardFrameGeometryForSlot(frameSlot);
  const draftBoxes = frameBoxDrafts[geometryVariant];
  const frameGeometry = useMemo(
    () => runCardFrameGeometryWithBoxes(committedGeometry, draftBoxes),
    [committedGeometry, draftBoxes],
  );
  const framePixelsMeasured = runCardFrameGeometryMatchesPixels(committedGeometry, frame?.media?.sha256);
  const selectedRect = draftBoxes[selectedFrameBox];
  const setSelectedBoxEdge = (edge: keyof RunCardFrameRect) => (value: number): void => {
    setFrameBoxDrafts((current) => (
      runCardFrameBoxDraftsWithEdge(current, geometryVariant, selectedFrameBox, edge, value)
    ));
  };
  const resetFrameBoxes = (): void => {
    setFrameBoxDrafts((current) => ({
      ...current,
      [geometryVariant]: { ...RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[geometryVariant].boxes },
    }));
  };
  const artSlot = !contentsStudy && cardVariant === 'tactical' && tacticalSpecimen === 'single'
    ? TACTICAL_ART_SLOT
    : !contentsStudy && cardVariant === 'concinnous'
      ? CONCINNOUS_ART_SLOT
      : STANDARD_ART_SLOT;
  const art = useMemo(() => catalog ? selectedCandidate(catalog, artSlot, 'artCandidate') : null, [artSlot, catalog]);
  const coinSource = useMemo(
    () => catalog ? selectedCandidate(catalog, RUN_CARD_COST_COIN_SOURCE_SLOT, 'coinCandidate') : null,
    [catalog],
  );
  const missing = catalog && (!frame || !art || !coinSource)
    ? 'The requested frame, coin source, or artwork candidate is unavailable.'
    : '';
  const sceneError = useMemo(() => error || missing ? new Error(error || missing) : null, [error, missing]);
  const painted = Boolean(
    frame
    && art
    && loaded.has('frame')
    && loaded.has('coin')
    && loaded.has('art')
    && displayedCard.grants.every((grant, cell) => (
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
  const resetAllTuning = (): void => {
    setCostSize(DEFAULT_COST_SIZE);
    setTitleSize(DEFAULT_TITLE_SIZE);
    setTypeSize(DEFAULT_TYPE_SIZE);
    setFlavorSize(DEFAULT_FLAVOR_SIZE);
    setTextInset(DEFAULT_TEXT_INSET);
    setTextOptical(DEFAULT_TEXT_OPTICAL);
    setFrameBoxDrafts(committedRunCardFrameBoxDrafts());
    setContentsScale(DEFAULT_CONTENTS_SCALE);
    setPestiferousDenominator(PESTIFEROUS_OFFER_DENOMINATOR);
    setOpeningSampleSeed(DEFAULT_OPENING_SAMPLE_SEED);
    setTacticalDenominator(TACTICAL_DISCIPLINE_OFFER_DENOMINATOR);
    setConcinnousDenominator(CONCINNOUS_OFFER_DENOMINATOR);
    setHieraticDenominator(HIERATIC_AGMINATE_OFFER_DENOMINATOR);
    setPreviewCost(null);
    setFrameBoxStyle('off');
    setTitleTypeSizeRatio(null);
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
  const chooseTacticalSpecimen = (next: RunCardTacticalSpecimen): void => {
    const params = new URLSearchParams(window.location.search);
    if (next === 'multi') params.set('tacticalSpecimen', next);
    else params.delete('tacticalSpecimen');
    params.delete('artCandidate');
    const search = params.toString();
    navigateApp(
      `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
      { replace: true, scroll: false },
    );
    setTacticalSpecimen(next);
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
  const choosePreviewCost = (next: number | null): void => {
    const params = new URLSearchParams(window.location.search);
    if (next === null) params.delete('cardCost');
    else params.set('cardCost', String(next));
    const search = params.toString();
    navigateApp(
      `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
      { replace: true, scroll: false },
    );
    setPreviewCost(next);
  };
  const chooseFrameBoxStyle = (next: RunCardFrameBoxStyle): void => {
    const params = new URLSearchParams(window.location.search);
    if (next === 'off') params.delete('frameBoxes');
    else params.set('frameBoxes', next === 'solid' ? '1' : next);
    const search = params.toString();
    navigateApp(
      `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
      { replace: true, scroll: false },
    );
    setFrameBoxStyle(next);
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
      version: 5,
      card: displayedCard.name,
      cardVariant,
      referenceWidthPx: REFERENCE_CARD_WIDTH,
      units: 'percent of card width (cqw)',
      artworkSha256: art?.media?.sha256 ?? null,
      coinSourceSha256: coinSource?.media?.sha256 ?? null,
      // Every frame's hand-tuned boxes, in native 1060x1484 frame pixels, each
      // paired with the exact frame pixels they were tuned against.
      frameBoxes: {
        nativeWidth: RUN_CARD_FRAME_NATIVE_WIDTH,
        nativeHeight: RUN_CARD_FRAME_NATIVE_HEIGHT,
        tuned: runCardFrameBoxDraftsAreTuned(frameBoxDrafts),
        frames: RUN_CARD_FRAME_VARIANTS.map((variant) => ({
          variant,
          slot: RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[variant].slot,
          measuredSha256: catalog
            ? activeCandidate(catalog, RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[variant].slot)?.media?.sha256 ?? null
            : null,
          boxes: frameBoxDrafts[variant],
        })),
      },
      // The whole placement rule: centered in the box, plus these two shared values.
      textPlacement: { insetInline: textInset, opticalBlock: textOptical },
      title: { size: titleSize },
      type: { size: typeSize },
      cost: { size: costSize },
      displayedCost: displayedCard.cost,
      flavor: { size: flavorSize },
      contentsStudy: contentsStudy ? {
        scale: contentsScale,
        profiles: RUN_CARD_CONTENTS_STUDY_PROFILES.map(({ id, load, tuning: contents }) => ({ id, load, contents })),
      } : null,
      locks: { titleTypeSizeRatio },
      ataraxiaI: {
        pestiferousDenominator,
        sampleSeed: 4217,
        sampleDraws: RUN_CARD_SAMPLE_DRAWS,
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
          cost: offer.cost,
          cardType: offer.cardType,
          pieces: offer.pieces,
        })),
      },
      tactical: {
        denominator: tacticalDenominator,
        sampleSeed: 4217,
        sampleDraws: RUN_CARD_SAMPLE_DRAWS,
        realizedCount: realizedTacticalCount,
        target: tacticalSpecimen === 'single' ? 'forced-and-visible' : 'chosen-at-acquisition',
      },
      concinnous: {
        denominator: concinnousDenominator,
        sampleSeed: 4217,
        sampleDraws: RUN_CARD_SAMPLE_DRAWS,
        realizedCount: realizedConcinnousCount,
        target: concinnousTargetRevealed ? 'revealed' : 'hidden',
      },
      hieratic: {
        denominator: hieraticDenominator,
        sampleSeed: 4217,
        sampleDraws: RUN_CARD_SAMPLE_DRAWS,
        realizedCount: realizedHieraticCount,
        cost: AGMINATE_COST,
        target: 'chosen-at-acquisition',
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
        {frame && art && coinSource ? (
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
                      coinSourceUrl={coinSource.media!.url}
                      frameGeometry={frameGeometry}
                      frameBoxStyle={frameBoxStyle}
                      selectedFrameBox={selectedFrameBox}
                      width={`${REFERENCE_CARD_WIDTH * viewerZoom}px`}
                      tuning={{ costSize, titleSize, typeSize, flavorSize, textInset, textOptical }}
                      contentsTuning={scaledRunCardContentsTuning(profile.tuning, contentsScale)}
                      onImageLoad={onImageLoad}
                      onImageError={onImageError}
                    />
                  </article>
                ))}
              </div>
            ) : (
              <RunCardFace
                card={displayedCard}
                frameUrl={frame.media!.url}
                artUrl={art.media!.url}
                coinSourceUrl={coinSource.media!.url}
                frameGeometry={frameGeometry}
                frameBoxStyle={frameBoxStyle}
                selectedFrameBox={selectedFrameBox}
                width={`${REFERENCE_CARD_WIDTH * viewerZoom}px`}
                tuning={{ costSize, titleSize, typeSize, flavorSize, textInset, textOptical }}
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
                  className={`tileset-view-action${cardVariant === 'tactical' ? ' active' : ''}`}
                  data-card-variant="tactical"
                  aria-pressed={cardVariant === 'tactical'}
                  onClick={() => chooseCardVariant('tactical')}
                >Tactical</button>
                <button
                  type="button"
                  className={`tileset-view-action${cardVariant === 'concinnous' ? ' active' : ''}`}
                  data-card-variant="concinnous"
                  aria-pressed={cardVariant === 'concinnous'}
                  onClick={() => chooseCardVariant('concinnous')}
                >Concinnous</button>
                <button
                  type="button"
                  className={`tileset-view-action${cardVariant === 'hieratic' ? ' active' : ''}`}
                  data-card-variant="hieratic"
                  aria-pressed={cardVariant === 'hieratic'}
                  onClick={() => chooseCardVariant('hieratic')}
                >Hieratic</button>
              </div>
            )}
            {!contentsStudy && cardVariant === 'tactical' ? (
              <div className="tileset-button-row" role="group" aria-label="Tactical contents">
                <button
                  type="button"
                  className={`tileset-view-action${tacticalSpecimen === 'single' ? ' active' : ''}`}
                  data-tactical-specimen="single"
                  aria-pressed={tacticalSpecimen === 'single'}
                  onClick={() => chooseTacticalSpecimen('single')}
                >One unit · forced icon</button>
                <button
                  type="button"
                  className={`tileset-view-action${tacticalSpecimen === 'multi' ? ' active' : ''}`}
                  data-tactical-specimen="multi"
                  aria-pressed={tacticalSpecimen === 'multi'}
                  onClick={() => chooseTacticalSpecimen('multi')}
                >Many units · chosen later</button>
              </div>
            ) : null}
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
                >After purchase · Pawn 1</button>
              </div>
            ) : null}
            {!contentsStudy ? (
              <div className="tileset-button-row" role="group" aria-label="Card cost preview">
                <button
                  type="button"
                  className={`tileset-view-action${previewCost === null ? ' active' : ''}`}
                  aria-pressed={previewCost === null}
                  onClick={() => choosePreviewCost(null)}
                >Actual cost</button>
                {[10, 11].map((cost) => (
                  <button
                    type="button"
                    className={`tileset-view-action${previewCost === cost ? ' active' : ''}`}
                    aria-pressed={previewCost === cost}
                    onClick={() => choosePreviewCost(cost)}
                    key={cost}
                  >Cost {cost}</button>
                ))}
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
            <div className="run-card-frame-box-tuner">
              <p className="run-card-prototype-note">
                {`Where text sits is the frame's box, not the text. Place ${cardVariant} frame boxes by eye here; every line stays centered in the box you leave it in.`}
              </p>
              <div className="tileset-button-row" role="group" aria-label="Frame box lines">
                {RUN_CARD_FRAME_BOX_STYLES.map((style) => (
                  <button
                    type="button"
                    className={`tileset-view-action${frameBoxStyle === style ? ' active' : ''}`}
                    data-frame-box-style={style}
                    aria-pressed={frameBoxStyle === style}
                    title={style === 'off'
                      ? 'Hide the lines entirely and judge the text alone'
                      : style === 'dotted'
                        ? 'Hairline dotted lines, so the frame’s own painted edge stays readable underneath'
                        : 'Solid lines'}
                    onClick={() => chooseFrameBoxStyle(style)}
                    key={style}
                  >{style === 'off' ? 'No lines' : style === 'dotted' ? 'Dotted' : 'Solid'}</button>
                ))}
              </div>
              <div className="tileset-button-row" role="group" aria-label="Frame box">
                {RUN_CARD_FRAME_BOX_NAMES.map((name) => (
                  <button
                    type="button"
                    className={`tileset-view-action${selectedFrameBox === name ? ' active' : ''}`}
                    data-frame-box={name}
                    aria-pressed={selectedFrameBox === name}
                    onClick={() => {
                      setSelectedFrameBox(name);
                      if (frameBoxStyle === 'off') chooseFrameBoxStyle('dotted');
                    }}
                    key={name}
                  >{RUN_CARD_FRAME_BOX_LABELS[name]}</button>
                ))}
              </div>
              <SliderRow
                label={<>{RUN_CARD_FRAME_BOX_LABELS[selectedFrameBox]} box top · {boxEdgeReadout(selectedRect.y, RUN_CARD_FRAME_NATIVE_HEIGHT)}</>}
                value={selectedRect.y}
                set={setSelectedBoxEdge('y')}
                min={0}
                max={RUN_CARD_FRAME_NATIVE_HEIGHT - selectedRect.height}
                step={1}
                nudge={1}
                dflt={RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[geometryVariant].boxes[selectedFrameBox].y}
              />
              <SliderRow
                label={<>{RUN_CARD_FRAME_BOX_LABELS[selectedFrameBox]} box height · {boxEdgeReadout(selectedRect.height, RUN_CARD_FRAME_NATIVE_HEIGHT)}</>}
                value={selectedRect.height}
                set={setSelectedBoxEdge('height')}
                min={8}
                max={RUN_CARD_FRAME_NATIVE_HEIGHT - selectedRect.y}
                step={1}
                nudge={1}
                dflt={RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[geometryVariant].boxes[selectedFrameBox].height}
              />
              <SliderRow
                label={<>{RUN_CARD_FRAME_BOX_LABELS[selectedFrameBox]} box left · {boxEdgeReadout(selectedRect.x, RUN_CARD_FRAME_NATIVE_WIDTH)}</>}
                value={selectedRect.x}
                set={setSelectedBoxEdge('x')}
                min={0}
                max={RUN_CARD_FRAME_NATIVE_WIDTH - selectedRect.width}
                step={1}
                nudge={1}
                dflt={RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[geometryVariant].boxes[selectedFrameBox].x}
              />
              <SliderRow
                label={<>{RUN_CARD_FRAME_BOX_LABELS[selectedFrameBox]} box width · {boxEdgeReadout(selectedRect.width, RUN_CARD_FRAME_NATIVE_WIDTH)}</>}
                value={selectedRect.width}
                set={setSelectedBoxEdge('width')}
                min={8}
                max={RUN_CARD_FRAME_NATIVE_WIDTH - selectedRect.x}
                step={1}
                nudge={1}
                dflt={RUN_CARD_FRAME_GEOMETRY_BY_VARIANT[geometryVariant].boxes[selectedFrameBox].width}
              />
              <button
                type="button"
                className="tileset-view-action"
                data-card-layout-action="reset-frame-boxes"
                onClick={resetFrameBoxes}
              >Reset {geometryVariant} boxes</button>
            </div>
            <SliderRow
              label={<>Text inset · {textInset.toFixed(2)}% (every plate, both edges)</>}
              value={textInset}
              set={setTextInset}
              min={0}
              max={6}
              step={.05}
              nudge={.05}
              dflt={DEFAULT_TEXT_INSET}
            />
            <SliderRow
              label={<>Optical baseline · {textOptical.toFixed(2)}% (every line, every frame)</>}
              value={textOptical}
              set={setTextOptical}
              min={-2}
              max={2}
              step={.05}
              nudge={.05}
              dflt={DEFAULT_TEXT_OPTICAL}
            />
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
            <SliderRow label={<>Cost size · {costSize.toFixed(2)}%</>} value={costSize} set={setCostSize} min={3} max={9} step={.05} nudge={.05} dflt={DEFAULT_COST_SIZE} />
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
              label={<>Tactical prevalence · 1 in {tacticalDenominator} drawn cards</>}
              value={tacticalDenominator}
              set={setTacticalDenominator}
              min={1}
              max={12}
              step={1}
              nudge={1}
              dflt={TACTICAL_DISCIPLINE_OFFER_DENOMINATOR}
            />
            <SliderRow
              label={<>Concinnous prevalence · 1 in {concinnousDenominator} non-Pestiferous offers</>}
              value={concinnousDenominator}
              set={setConcinnousDenominator}
              min={2}
              max={24}
              step={1}
              nudge={1}
              dflt={CONCINNOUS_OFFER_DENOMINATOR}
            />
            <SliderRow
              label={<>Hieratic prevalence · 1 in {hieraticDenominator} non-Concinnous offers</>}
              value={hieraticDenominator}
              set={setHieraticDenominator}
              min={2}
              max={24}
              step={1}
              nudge={1}
              dflt={HIERATIC_AGMINATE_OFFER_DENOMINATOR}
            />
            {frame && art && coinSource ? (
              <dl className="run-card-prototype-source-readout">
                <div><dt>Frame</dt><dd>{frame.media!.sha256.slice(0, 12)} · {frame.status}</dd></div>
                <div><dt>Geometry</dt><dd>{frameGeometry.id} · native {frameGeometry.sourceWidth}×{frameGeometry.sourceHeight}</dd></div>
                <div>
                  <dt>Boxes</dt>
                  <dd>
                    {runCardFrameBoxDraftsAreTuned(frameBoxDrafts)
                      ? 'Tuned in this session — copy the handoff to commit'
                      : framePixelsMeasured
                        ? 'Committed against these exact frame pixels'
                        : 'Seeded, not yet tuned against these frame pixels'}
                  </dd>
                </div>
                <div><dt>Coin source</dt><dd>{coinSource.media!.sha256.slice(0, 12)} · {coinSource.status}</dd></div>
                <div><dt>Artwork</dt><dd>{art.media!.sha256.slice(0, 12)} · {art.status}</dd></div>
                <div><dt>Card</dt><dd>{contentsStudy ? 'Contents Box density study' : `${displayedCard.typeLine} · ${displayedCard.cost} gold`}</dd></div>
                {cardVariant === 'tactical' ? <div><dt>Discipline target</dt><dd>{tacticalSpecimen === 'single' ? 'Forced and shown by icon' : 'Chosen at acquisition'}</dd></div> : null}
                <div><dt>Ataraxia I sample</dt><dd>{realizedPestiferousCount} / {RUN_CARD_SAMPLE_DRAWS} Pestiferous · seed 4217</dd></div>
                <div><dt>Opening budget</dt><dd>{RUN_STARTING_GOLD} gold · buy any affordable cards</dd></div>
                <div><dt>Opening party</dt><dd>King + 2 Pawns + purchased cards</dd></div>
                <div><dt>Opening sample</dt><dd>{openingSample.map((offer) => `${runCardName(offer)} (${offer.cost}${offer.cardType ? ` · ${offer.cardType}` : ''})`).join(' · ')}</dd></div>
                <div><dt>Opening qualifiers</dt><dd>rolled as usual at every value; a card priced over {RUN_STARTING_GOLD} gold is offered out of reach</dd></div>
                <div><dt>Tactical sample</dt><dd>{realizedTacticalCount} / {RUN_CARD_SAMPLE_DRAWS} draws · seed 4217</dd></div>
                <div><dt>Concinnous sample</dt><dd>{realizedConcinnousCount} / {RUN_CARD_SAMPLE_DRAWS} non-Tactical draws · seed 4217 · all card values eligible</dd></div>
                <div><dt>Hieratic sample</dt><dd>{realizedHieraticCount} / {RUN_CARD_SAMPLE_DRAWS} non-Concinnous draws · seed 4217 · {AGMINATE_DISPLAY_NAME} adds {AGMINATE_COST} gold</dd></div>
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
