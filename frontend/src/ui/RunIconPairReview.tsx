import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import {
  fetchAdminLiveMediaCatalog,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import {
  fetchRunCardIconFittingPortfolio,
  saveRunCardIconFittingPortfolio,
} from '../net/runCardIconFitting';
import { runCardArtSlot } from '../run/cardNames';
import { AGMINATE_DISPLAY_NAME, RUN_CARD_BY_ID, RUN_STARTER_CARD_BY_ID } from '../run/model';
import {
  RUN_CARD_COMMITTED_PROPERTY_PLACEMENTS,
  RUN_CARD_COMMITTED_UNIT_STATE_PLACEMENT,
  RUN_CARD_ICON_PLACEMENT_BASELINE,
  RunCardFace,
  type RunCardFaceContent,
  type RunCardIconPlacement,
  type RunCardProperty,
  type RunUnitState,
} from './RunCardFace';
import { runCardFaceContent, runCardFrameSlotForType, runCardSpecimen } from './runCardFaceContent';
import { runCardFrameGeometryForSlot } from './runCardFrameGeometry';
import { SliderRow, ctlReset } from './dressing/SliderRow';
import { AssetSwatchList } from './shared/AssetSwatchList';
import { ChoiceGroup } from './shared/ChoiceGroup';
import { StudioCatalogCard } from './studio/StudioCatalogCard';
import { navigateApp } from './navigation';

export const RUN_ICON_PAIR_BATCH_ID = 'run-icon-pairs-2026-08-01-v1';
export const STARTER_RUN_ICON_PAIR_BATCH_ID = 'starter-card-icon-pair-codex-pixellab-review-2026-08-04-v1';
export const RUN_CARD_ICON_FITTING_SCALE_MAX = 5;
const HIS_GRACE_ART_REVIEW_SLOT = 'review/run-card-art/his-grace/illustration.png';
const HIS_GRACE_CODEX_ART_SHA256 = '3911aa54c164a29837ac99d4d34bfc468c80af7ed8e4e41246c7431d9b394ec2';
const STARTER_FRAME_REVIEW_SLOT = 'review/run-card-frame/starter/frame.png';
const STARTER_FRAME_CODEX_SHA256 = '93ee3e1497ae1a930ca9d8d0242fd8b1fd93cd30da01511662ef2c48ed9a062e';

type PairDefinition = Readonly<{
  property: RunCardProperty;
  propertySlot: string;
  state: RunUnitState;
  stateSlot: string;
  stateEffect: string;
  source: 'accepted' | 'owner-selected' | 'review';
  candidateBatchId: string;
}>;

export const RUN_CARD_ICON_PAIRS: readonly PairDefinition[] = Object.freeze([
  {
    property: 'pestiferous',
    propertySlot: 'ui/kit/icons/card-properties/pestiferous.png',
    state: 'cacochymic',
    stateSlot: 'ui/kit/icons/game/cacochymic.png',
    stateEffect: 'The unit dies when combat ends.',
    source: 'accepted',
    candidateBatchId: RUN_ICON_PAIR_BATCH_ID,
  },
  {
    property: 'concinnous',
    propertySlot: 'ui/kit/icons/card-properties/concinnous.png',
    state: 'eutactic',
    stateSlot: 'ui/kit/icons/game/eutactic.png',
    stateEffect: "The unit favors its piece type's best-fit formation row during automatic deployment.",
    source: 'accepted',
    candidateBatchId: RUN_ICON_PAIR_BATCH_ID,
  },
  {
    property: 'legatine',
    propertySlot: 'ui/kit/icons/card-properties/legatine.png',
    state: 'adlected',
    stateSlot: 'ui/kit/icons/game/adlected.png',
    stateEffect: 'The player chooses its square when its deployment turn arrives.',
    source: 'accepted',
    candidateBatchId: RUN_ICON_PAIR_BATCH_ID,
  },
  {
    property: 'hieratic',
    propertySlot: 'ui/kit/icons/card-properties/hieratic.png',
    state: 'agminate',
    stateSlot: 'ui/kit/icons/game/agminate.png',
    stateEffect: 'The unit prefers its piece-specific station during automatic deployment.',
    source: 'accepted',
    candidateBatchId: RUN_ICON_PAIR_BATCH_ID,
  },
  {
    property: 'praecipuus',
    propertySlot: 'review/run-card-icons/praecipuus/property.png',
    state: 'primogeniture',
    stateSlot: 'review/run-card-icons/primogeniture/state.png',
    stateEffect: 'Is placed before every other unit.',
    source: 'review',
    candidateBatchId: STARTER_RUN_ICON_PAIR_BATCH_ID,
  },
]);

export function runCardIconFittingPropertyFromSearch(search: string): RunCardProperty | null {
  const property = new URLSearchParams(search).get('iconPair');
  return RUN_CARD_ICON_PAIRS.some((pair) => pair.property === property)
    ? property as RunCardProperty
    : null;
}

type PairSelection = Readonly<{
  propertyVersionId: string;
  stateVersionId: string;
}>;

export type RunCardIconFittingDraft = Readonly<{
  activeProperty: RunCardProperty;
  selections: Readonly<Record<RunCardProperty, PairSelection>>;
  propertyPlacements: Readonly<Record<RunCardProperty, RunCardIconPlacement>>;
  unitStatePlacement: RunCardIconPlacement;
}>;

function displayName(value: string): string {
  if (value === 'cacochymic') return 'Cacochymic';
  if (value === 'agminate') return AGMINATE_DISPLAY_NAME;
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function candidateIndex(version: AdminLiveMediaVersion): number {
  const value = Number(version.metadata.candidateIndex);
  return Number.isSafeInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

function liveBatchId(version: AdminLiveMediaVersion): string | null {
  const batch = version.provenance.liveMediaBatch;
  return batch && typeof batch === 'object' && !Array.isArray(batch)
    && typeof (batch as Record<string, unknown>).batchId === 'string'
    ? String((batch as Record<string, unknown>).batchId)
    : null;
}

export function runIconPairReviewVersions(
  catalog: AdminLiveMediaCatalog,
  slot: string,
  batchId = RUN_ICON_PAIR_BATCH_ID,
): AdminLiveMediaVersion[] {
  return catalog.versions
    .filter((version) => version.slot === slot
      && version.status === 'candidate'
      && liveBatchId(version) === batchId
      && Boolean(version.media))
    .sort((left, right) => candidateIndex(left) - candidateIndex(right));
}

function acceptedVersion(catalog: AdminLiveMediaCatalog, slot: string): AdminLiveMediaVersion | null {
  const activeVersionId = catalog.slots.find((candidate) => candidate.slot === slot)?.activeVersionId;
  if (!activeVersionId) return null;
  return catalog.versions.find((version) => version.id === activeVersionId && Boolean(version.media)) ?? null;
}

export function runIconPairReviewFrameVersion(
  catalog: AdminLiveMediaCatalog,
  slot: string,
): AdminLiveMediaVersion | null {
  return acceptedVersion(catalog, slot)
    ?? catalog.versions.find((version) => (
      version.slot === slot && version.status === 'candidate' && Boolean(version.media)
    ))
    ?? null;
}

export function runCardIconFittingVersions(
  catalog: AdminLiveMediaCatalog,
  slot: string,
  batchId = RUN_ICON_PAIR_BATCH_ID,
): AdminLiveMediaVersion[] {
  const accepted = acceptedVersion(catalog, slot);
  const candidates = runIconPairReviewVersions(catalog, slot, batchId);
  return accepted ? [accepted, ...candidates.filter((version) => version.id !== accepted.id)] : candidates;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number * 100) / 100));
}

function placementFrom(
  value: unknown,
  offsetLimit: number,
  fallback: RunCardIconPlacement = RUN_CARD_ICON_PLACEMENT_BASELINE,
): RunCardIconPlacement {
  const raw = asRecord(value);
  return {
    x: clampNumber(raw.x, fallback.x, -offsetLimit, offsetLimit),
    y: clampNumber(raw.y, fallback.y, -offsetLimit, offsetLimit),
    scale: clampNumber(
      raw.scale,
      fallback.scale,
      .4,
      RUN_CARD_ICON_FITTING_SCALE_MAX,
    ),
  };
}

function firstVersionId(catalog: AdminLiveMediaCatalog, slot: string, batchId: string): string {
  return runCardIconFittingVersions(catalog, slot, batchId)[0]?.id ?? '';
}

export function defaultRunCardIconFittingDraft(catalog: AdminLiveMediaCatalog): RunCardIconFittingDraft {
  const selections = Object.fromEntries(RUN_CARD_ICON_PAIRS.map((pair) => [pair.property, {
    propertyVersionId: firstVersionId(catalog, pair.propertySlot, pair.candidateBatchId),
    stateVersionId: firstVersionId(catalog, pair.stateSlot, pair.candidateBatchId),
  }])) as Record<RunCardProperty, PairSelection>;
  // Reset returns to the committed fit the live cards ship, not to a zeroed-out
  // placement that no surface has ever used (ADR-0057).
  const propertyPlacements = Object.fromEntries(RUN_CARD_ICON_PAIRS.map((pair) => [
    pair.property,
    { ...RUN_CARD_COMMITTED_PROPERTY_PLACEMENTS[pair.property] },
  ])) as Record<RunCardProperty, RunCardIconPlacement>;
  return {
    activeProperty: 'pestiferous',
    selections,
    propertyPlacements,
    unitStatePlacement: { ...RUN_CARD_COMMITTED_UNIT_STATE_PLACEMENT },
  };
}

export function normalizeRunCardIconFittingDraft(
  value: unknown,
  catalog: AdminLiveMediaCatalog,
): RunCardIconFittingDraft {
  const baseline = defaultRunCardIconFittingDraft(catalog);
  const raw = asRecord(value);
  const rawSelections = asRecord(raw.selections);
  const rawPlacements = asRecord(raw.property_placements ?? raw.propertyPlacements);
  const activeProperty = RUN_CARD_ICON_PAIRS.some((pair) => pair.property === raw.active_property)
    ? raw.active_property as RunCardProperty
    : baseline.activeProperty;
  const selections = Object.fromEntries(RUN_CARD_ICON_PAIRS.map((pair) => {
    const selection = asRecord(rawSelections[pair.property]);
    const propertyVersions = runCardIconFittingVersions(catalog, pair.propertySlot, pair.candidateBatchId);
    const stateVersions = runCardIconFittingVersions(catalog, pair.stateSlot, pair.candidateBatchId);
    const propertyVersionId = typeof selection.propertyVersionId === 'string'
      && propertyVersions.some((version) => version.id === selection.propertyVersionId)
      ? selection.propertyVersionId
      : baseline.selections[pair.property].propertyVersionId;
    const stateVersionId = typeof selection.stateVersionId === 'string'
      && stateVersions.some((version) => version.id === selection.stateVersionId)
      ? selection.stateVersionId
      : baseline.selections[pair.property].stateVersionId;
    return [pair.property, { propertyVersionId, stateVersionId }];
  })) as Record<RunCardProperty, PairSelection>;
  const propertyPlacements = Object.fromEntries(RUN_CARD_ICON_PAIRS.map((pair) => [
    pair.property,
    placementFrom(rawPlacements[pair.property], 4, baseline.propertyPlacements[pair.property]),
  ])) as Record<RunCardProperty, RunCardIconPlacement>;
  return {
    activeProperty,
    selections,
    propertyPlacements,
    unitStatePlacement: placementFrom(
      raw.unit_state_placement ?? raw.unitStatePlacement,
      6,
      baseline.unitStatePlacement,
    ),
  };
}

function draftPayload(draft: RunCardIconFittingDraft, catalog: AdminLiveMediaCatalog): Record<string, unknown> {
  const versionById = new Map(catalog.versions.map((version) => [version.id, version]));
  return {
    kind: 'run-card-icon-fitting-draft',
    document_version: 2,
    active_property: draft.activeProperty,
    selections: Object.fromEntries(RUN_CARD_ICON_PAIRS.map((pair) => {
      const selection = draft.selections[pair.property];
      return [pair.property, {
        propertyVersionId: selection.propertyVersionId,
        propertySha256: versionById.get(selection.propertyVersionId)?.media?.sha256 ?? null,
        stateVersionId: selection.stateVersionId,
        stateSha256: versionById.get(selection.stateVersionId)?.media?.sha256 ?? null,
      }];
    })),
    property_placements: draft.propertyPlacements,
    unit_state_placement: draft.unitStatePlacement,
    units: 'cqw offsets plus unitless scale',
  };
}

function optionLabel(version: AdminLiveMediaVersion, pair: PairDefinition): string {
  if (version.status === 'accepted') return 'Accepted';
  const provider = typeof version.metadata.provider === 'string' ? version.metadata.provider.trim() : '';
  if (provider) return provider.toLowerCase() === 'pixellab'
    ? 'PixelLab'
    : `${provider.slice(0, 1).toUpperCase()}${provider.slice(1)}`;
  const sourceIndex = Number(version.metadata.sourceCandidateIndex);
  if (pair.source === 'owner-selected' && Number.isSafeInteger(sourceIndex)) return `Selected ${sourceIndex}`;
  const index = candidateIndex(version);
  return index === Number.MAX_SAFE_INTEGER ? 'Candidate' : `Option ${index}`;
}

function candidateConcept(version: AdminLiveMediaVersion): string {
  return typeof version.metadata.concept === 'string' ? version.metadata.concept : version.label;
}

/**
 * The fitting specimen is a real one-unit Volunteer offer of the pair's card type,
 * projected like every other card. Its single unit forces the target, so the paired
 * property symbol and unit-state marker are both public and both seat where they will
 * in a Sectio.
 */
export function runCardIconFittingSpecimenCard(pair: PairDefinition): RunCardFaceContent {
  if (pair.property === 'praecipuus') {
    return runCardFaceContent(RUN_STARTER_CARD_BY_ID['his-grace']);
  }
  return runCardFaceContent(
    runCardSpecimen({
      pieces: RUN_CARD_BY_ID.p.pieces,
      cardType: pair.property,
      cacochymicPieceIndex: pair.state === 'cacochymic' ? 0 : null,
    }),
    { adlected: true },
  );
}

function versionBySha256(
  catalog: AdminLiveMediaCatalog,
  slot: string,
  sha256: string,
): AdminLiveMediaVersion | null {
  return catalog.versions.find((version) => (
    version.slot === slot
    && version.media?.sha256 === sha256
    && Boolean(version.media?.url)
    && (version.status === 'candidate' || version.status === 'accepted')
  )) ?? null;
}

function selectedVersion(
  versions: readonly AdminLiveMediaVersion[],
  id: string,
): AdminLiveMediaVersion | null {
  return versions.find((version) => version.id === id) ?? versions[0] ?? null;
}

function CandidatePalette({
  label,
  pair,
  versions,
  selectedId,
  onSelect,
}: {
  label: string;
  pair: PairDefinition;
  versions: readonly AdminLiveMediaVersion[];
  selectedId: string;
  onSelect: (id: string) => void;
}): ReactElement {
  return (
    <section className="run-card-icon-fitting-palette" aria-label={label}>
      <header>
        <strong>{label}</strong>
        <span>{versions.length} exact {versions.length === 1 ? 'choice' : 'choices'}</span>
      </header>
      <AssetSwatchList
        className="run-card-icon-fitting-swatches"
        ariaLabel={`${label} candidates`}
        items={versions.map((version) => ({
          id: version.id,
          label: `${label} ${optionLabel(version, pair)}: ${candidateConcept(version)}`,
          title: candidateConcept(version),
          selected: version.id === selectedId,
          onSelect: () => onSelect(version.id),
          content: (
            <>
              <img src={version.media!.url} alt="" draggable={false} />
              <small>{optionLabel(version, pair)}</small>
            </>
          ),
        }))}
      />
    </section>
  );
}

export function RunCardIconFittingViewer({
  header,
  viewerZoom,
}: {
  header: ReactNode;
  viewerZoom: number;
}): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [draft, setDraft] = useState<RunCardIconFittingDraft | null>(null);
  const [savedSignature, setSavedSignature] = useState('');
  const [portfolioRevision, setPortfolioRevision] = useState(0);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    let active = true;
    void Promise.all([fetchAdminLiveMediaCatalog(), fetchRunCardIconFittingPortfolio()])
      .then(([nextCatalog, portfolio]) => {
        if (!active) return;
        const normalized = normalizeRunCardIconFittingDraft(portfolio.data, nextCatalog);
        const requestedProperty = runCardIconFittingPropertyFromSearch(window.location.search);
        const nextDraft = requestedProperty
          ? { ...normalized, activeProperty: requestedProperty }
          : normalized;
        setCatalog(nextCatalog);
        setDraft(nextDraft);
        setSavedSignature(JSON.stringify(nextDraft));
        setPortfolioRevision(portfolio.revision);
        setError('');
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);

  const pair = RUN_CARD_ICON_PAIRS.find((candidate) => candidate.property === draft?.activeProperty)
    ?? RUN_CARD_ICON_PAIRS[0];
  const propertyVersions = useMemo(
    () => catalog ? runCardIconFittingVersions(catalog, pair.propertySlot, pair.candidateBatchId) : [],
    [catalog, pair.candidateBatchId, pair.propertySlot],
  );
  const stateVersions = useMemo(
    () => catalog ? runCardIconFittingVersions(catalog, pair.stateSlot, pair.candidateBatchId) : [],
    [catalog, pair.candidateBatchId, pair.stateSlot],
  );
  const frameSlot = pair.property === 'praecipuus'
    ? STARTER_FRAME_REVIEW_SLOT
    : runCardFrameSlotForType(pair.property);
  const frame = catalog
    ? pair.property === 'praecipuus'
      ? versionBySha256(catalog, frameSlot, STARTER_FRAME_CODEX_SHA256)
      : runIconPairReviewFrameVersion(catalog, frameSlot)
    : null;
  const hisGraceArt = catalog && pair.property === 'praecipuus'
    ? versionBySha256(catalog, HIS_GRACE_ART_REVIEW_SLOT, HIS_GRACE_CODEX_ART_SHA256)
    : null;
  const artUrl = pair.property === 'praecipuus'
    ? hisGraceArt?.media?.url ?? null
    : resolvedLiveMediaUrl(runCardArtSlot(RUN_CARD_BY_ID.p));
  const selection = draft?.selections[pair.property];
  const propertyVersion = selection ? selectedVersion(propertyVersions, selection.propertyVersionId) : null;
  const stateVersion = selection ? selectedVersion(stateVersions, selection.stateVersionId) : null;
  const dirty = draft ? JSON.stringify(draft) !== savedSignature : false;

  const changeDraft = (change: (current: RunCardIconFittingDraft) => RunCardIconFittingDraft): void => {
    setDraft((current) => current ? change(current) : current);
    setSaveState('idle');
  };
  const changePropertyPlacement = (key: keyof RunCardIconPlacement, value: number): void => {
    changeDraft((current) => ({
      ...current,
      propertyPlacements: {
        ...current.propertyPlacements,
        [pair.property]: { ...current.propertyPlacements[pair.property], [key]: value },
      },
    }));
  };
  const chooseProperty = (property: RunCardProperty): void => {
    const params = new URLSearchParams(window.location.search);
    params.set('iconPair', property);
    const search = params.toString();
    navigateApp(
      `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
      { replace: true, scroll: false },
    );
    changeDraft((current) => ({ ...current, activeProperty: property }));
  };
  const changeUnitStatePlacement = (key: keyof RunCardIconPlacement, value: number): void => {
    changeDraft((current) => ({
      ...current,
      unitStatePlacement: { ...current.unitStatePlacement, [key]: value },
    }));
  };
  const chooseVersion = (role: 'property' | 'state', id: string): void => {
    changeDraft((current) => ({
      ...current,
      selections: {
        ...current.selections,
        [pair.property]: {
          ...current.selections[pair.property],
          [role === 'property' ? 'propertyVersionId' : 'stateVersionId']: id,
        },
      },
    }));
  };
  const resetProperty = (): void => {
    if (!catalog) return;
    const baseline = defaultRunCardIconFittingDraft(catalog);
    changeDraft((current) => ({
      ...current,
      propertyPlacements: {
        ...current.propertyPlacements,
        [pair.property]: baseline.propertyPlacements[pair.property],
      },
      selections: {
        ...current.selections,
        [pair.property]: {
          ...current.selections[pair.property],
          propertyVersionId: baseline.selections[pair.property].propertyVersionId,
        },
      },
    }));
  };
  const resetState = (): void => {
    if (!catalog) return;
    const baseline = defaultRunCardIconFittingDraft(catalog);
    changeDraft((current) => ({
      ...current,
      unitStatePlacement: baseline.unitStatePlacement,
      selections: {
        ...current.selections,
        [pair.property]: {
          ...current.selections[pair.property],
          stateVersionId: baseline.selections[pair.property].stateVersionId,
        },
      },
    }));
  };
  const resetAll = (): void => {
    if (!catalog) return;
    const baseline = defaultRunCardIconFittingDraft(catalog);
    changeDraft((current) => ({ ...baseline, activeProperty: current.activeProperty }));
  };
  const saveDraft = async (): Promise<void> => {
    if (!catalog || !draft) return;
    setSaveState('saving');
    try {
      const saved = await saveRunCardIconFittingPortfolio(draftPayload(draft, catalog));
      setPortfolioRevision(saved.revision);
      setSavedSignature(JSON.stringify(draft));
      setSaveState('saved');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setSaveState('error');
    }
  };

  const committedProperty = RUN_CARD_COMMITTED_PROPERTY_PLACEMENTS[pair.property];
  const propertyPlacement = draft?.propertyPlacements[pair.property] ?? committedProperty;
  const unitStatePlacement = draft?.unitStatePlacement ?? RUN_CARD_COMMITTED_UNIT_STATE_PLACEMENT;

  return (
    <>
      <section className="al-lab-main run-card-icon-fitting-main" aria-label="Card icon fitting preview">
        {error ? <p role="alert">{error}</p> : null}
        {!error && (!catalog || !draft) ? <p role="status">Loading exact icon candidates and saved fitting draft…</p> : null}
        {catalog && draft && frame && propertyVersion && stateVersion && artUrl ? (
          <div className="run-card-icon-fitting-workbench">
            <div className="run-card-icon-fitting-stage">
              <RunCardFace
                card={runCardIconFittingSpecimenCard(pair)}
                frameUrl={frame.media!.url}
                artUrl={artUrl}
                frameGeometry={runCardFrameGeometryForSlot(runCardFrameSlotForType(pair.property))}
                iconMedia={{
                  propertyUrl: propertyVersion.media!.url,
                  unitStateUrls: { [pair.state]: stateVersion.media!.url },
                }}
                iconTuning={{ property: propertyPlacement, unitState: unitStatePlacement }}
                propertyTooltipFocusable={false}
                width={`${360 * viewerZoom}px`}
              />
              <p>
                <strong>{displayName(pair.property)}</strong> bestows <strong>{displayName(pair.state)}</strong>.
                Property placement belongs to this card type; unit-state placement is shared by all five pairs.
              </p>
            </div>
            <div className="run-card-icon-fitting-palettes">
              <CandidatePalette
                label={`${displayName(pair.property)} property`}
                pair={pair}
                versions={propertyVersions}
                selectedId={propertyVersion.id}
                onSelect={(id) => chooseVersion('property', id)}
              />
              <CandidatePalette
                label={`${displayName(pair.state)} unit state`}
                pair={pair}
                versions={stateVersions}
                selectedId={stateVersion.id}
                onSelect={(id) => chooseVersion('state', id)}
              />
            </div>
          </div>
        ) : null}
      </section>

      <aside className="tileset-view-controls run-card-icon-fitting-controls" aria-label="Card icon fitting controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <p className="run-card-prototype-note">
              Choose exact pixels, then fit them on the real card. Save records a private design draft only; it does not publish media.
            </p>
            {draft && catalog ? (
              <>
                <ChoiceGroup
                  className="run-card-icon-pair-choice"
                  buttonClassName="tileset-view-action"
                  ariaLabel="Card property"
                  value={pair.property}
                  onChange={chooseProperty}
                  options={RUN_CARD_ICON_PAIRS.map((candidate) => ({
                    value: candidate.property,
                    label: displayName(candidate.property),
                    title: `${displayName(candidate.property)} → ${displayName(candidate.state)}`,
                  }))}
                />

                <div className="run-card-icon-fitting-control-group">
                  <div className="run-card-icon-fitting-control-heading">
                    <strong>{displayName(pair.property)} property icon</strong>
                    <span>Independent for this card type</span>
                  </div>
                  <label className="tileset-category-select run-card-icon-fitting-select">
                    <span>Candidate</span>
                    <div className="pages-ctl-row">
                      <select
                        value={selection?.propertyVersionId ?? ''}
                        onChange={(event) => chooseVersion('property', event.target.value)}
                        aria-label={`${displayName(pair.property)} property candidate`}
                      >
                        {propertyVersions.map((version) => (
                          <option value={version.id} key={version.id}>{optionLabel(version, pair)} · {candidateConcept(version)}</option>
                        ))}
                      </select>
                      {ctlReset(() => chooseVersion('property', defaultRunCardIconFittingDraft(catalog).selections[pair.property].propertyVersionId))}
                    </div>
                  </label>
                  <SliderRow label={<>Horizontal · {propertyPlacement.x.toFixed(2)}</>} value={propertyPlacement.x} set={(value) => changePropertyPlacement('x', value)} min={-4} max={4} step={.05} nudge={.1} dflt={committedProperty.x} />
                  <SliderRow label={<>Vertical · {propertyPlacement.y.toFixed(2)}</>} value={propertyPlacement.y} set={(value) => changePropertyPlacement('y', value)} min={-4} max={4} step={.05} nudge={.1} dflt={committedProperty.y} />
                  <SliderRow label={<>Scale · {Math.round(propertyPlacement.scale * 100)}%</>} value={propertyPlacement.scale} set={(value) => changePropertyPlacement('scale', value)} min={.4} max={RUN_CARD_ICON_FITTING_SCALE_MAX} step={.05} nudge={.1} dflt={committedProperty.scale} />
                  <button type="button" className="tileset-view-action" onClick={resetProperty}>Reset {displayName(pair.property)}</button>
                </div>

                <div className="run-card-icon-fitting-control-group">
                  <div className="run-card-icon-fitting-control-heading">
                    <strong>{displayName(pair.state)} unit-state icon</strong>
                    <span>One shared ledger placement</span>
                  </div>
                  <label className="tileset-category-select run-card-icon-fitting-select">
                    <span>Candidate</span>
                    <div className="pages-ctl-row">
                      <select
                        value={selection?.stateVersionId ?? ''}
                        onChange={(event) => chooseVersion('state', event.target.value)}
                        aria-label={`${displayName(pair.state)} unit-state candidate`}
                      >
                        {stateVersions.map((version) => (
                          <option value={version.id} key={version.id}>{optionLabel(version, pair)} · {candidateConcept(version)}</option>
                        ))}
                      </select>
                      {ctlReset(() => chooseVersion('state', defaultRunCardIconFittingDraft(catalog).selections[pair.property].stateVersionId))}
                    </div>
                  </label>
                  <SliderRow label={<>Horizontal · {unitStatePlacement.x.toFixed(2)}</>} value={unitStatePlacement.x} set={(value) => changeUnitStatePlacement('x', value)} min={-6} max={6} step={.05} nudge={.1} dflt={RUN_CARD_COMMITTED_UNIT_STATE_PLACEMENT.x} />
                  <SliderRow label={<>Vertical · {unitStatePlacement.y.toFixed(2)}</>} value={unitStatePlacement.y} set={(value) => changeUnitStatePlacement('y', value)} min={-6} max={6} step={.05} nudge={.1} dflt={RUN_CARD_COMMITTED_UNIT_STATE_PLACEMENT.y} />
                  <SliderRow label={<>Scale · {Math.round(unitStatePlacement.scale * 100)}%</>} value={unitStatePlacement.scale} set={(value) => changeUnitStatePlacement('scale', value)} min={.4} max={RUN_CARD_ICON_FITTING_SCALE_MAX} step={.05} nudge={.1} dflt={RUN_CARD_COMMITTED_UNIT_STATE_PLACEMENT.scale} />
                  <button type="button" className="tileset-view-action" onClick={resetState}>Reset shared state seat</button>
                </div>

                <div className="tileset-button-row run-card-icon-fitting-actions">
                  <button type="button" className="tileset-view-action" onClick={resetAll}>Reset all</button>
                  <button
                    type="button"
                    className={`tileset-view-action${dirty ? ' active' : ''}`}
                    disabled={!dirty || saveState === 'saving'}
                    onClick={() => { void saveDraft(); }}
                  >
                    {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Draft saved' : saveState === 'error' ? 'Save failed' : dirty ? 'Save fitting draft' : 'Draft up to date'}
                  </button>
                </div>
                <p className="run-card-icon-fitting-status" role="status">
                  Draft revision {portfolioRevision} · {dirty ? 'unsaved changes' : 'saved'}
                </p>
              </>
            ) : null}
          </div>
        </section>
      </aside>
    </>
  );
}

export function RunCardIconFittingCatalog({ onOpen }: { onOpen: () => void }): ReactElement {
  return (
    <div className="tileset-studio-grid pages-grid" aria-label="Card icon fitting instruments">
      <StudioCatalogCard
        title="Property & Unit-State Icons"
        badge="5 property/state pairs · exact live candidates"
        selected
        onSelect={onOpen}
        onOpen={onOpen}
        onInspect={onOpen}
        inspectLabel="Open Card Icon Fitting"
        titleText="Open the card property and unit-state icon fitting instrument"
        media={<span className="run-card-icon-fitting-catalog-mark">P → U</span>}
      />
    </div>
  );
}
