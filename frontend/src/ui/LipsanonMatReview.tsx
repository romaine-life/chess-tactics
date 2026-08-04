import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode, type RefObject } from 'react';
import { fetchAdminLiveMediaCatalog, type AdminLiveMediaCatalog, type AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import { LIPSANON_BY_ID, type LipsanonId } from '../run/model';
import { LipsanonIcon } from './Lipsana';
import { Tooltip } from './shared/InfoTip';
import { StudioCatalogCard } from './studio/StudioCatalogCard';
import { StudioStepper } from './studio/StudioStepper';
import { SliderRow, ctlReset } from './dressing/SliderRow';
import { ChoiceGroup } from './shared/ChoiceGroup';
import { Toggle } from './shared/Toggle';
import { slotPoint, useLipsanonFlight } from './runLipsanonFlightView';
import { ChromeButton } from './shared/ChromeButton';
import {
  LIPSANON_FLOAT_COMMITTED_PERIOD,
  LIPSANON_FLOAT_COMMITTED_RISE,
  LIPSANON_FLOAT_COMMITTED_TIMING,
  LIPSANON_FLOAT_STEPPED_TIMING,
  LIPSANON_GLOW_COMMITTED,
  LIPSANON_RECEDE_COMMITTED,
  LIPSANON_TRAY_STROKE_COMMITTED,
  lipsanonFloatClock,
} from './runLipsanonMat';

/**
 * Candidate MATS -- the surface the Run's lipsanon offers are laid out on at the head of a
 * Conflict -- read straight from the live-media catalog.
 *
 * A mat cannot be judged alone. It is a middle layer: the chosen Spolia backdrop is
 * behind it and the lipsanon icons sit on it, and whether it works is entirely a question of
 * what it does between those two. So every card and the viewer stage mount the actual
 * composite rather than showing the mat's pixels on a checkerboard.
 *
 * Read-only. Nothing here accepts, installs, or promotes a candidate.
 */
const LIPSANON_MAT_SLOT = /^review\/run-lipsanon-mat\/([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)\.png$/;

/** The backdrop the owner chose for this screen; the mat is judged over these pixels. */
export const LIPSANON_MAT_BACKDROP_SLOT = 'review/run-screen-art/spolia-inventory/codex.png';

/** The mat the owner chose. The Viewer opens on it rather than on whatever sorts first. */
export const LIPSANON_MAT_CHOSEN_ID = 'mat-tray--codex';

/**
 * The committed mat width, as a multiple of the lipsanon row's. Mirrors --lipsanon-mat-scale in
 * style.css and is what the Viewer's tuning slider resets to -- a reset returns to the
 * value the game ships, never to zero or to the slider's floor (ADR-0057).
 */
export const LIPSANON_MAT_COMMITTED_SCALE = 1.74;

// Card titles truncate around 14 characters, so every name has to survive that intact --
// "Inventory She..." is not a label.
const MAT_LABELS: Record<string, string> = {
  'mat-parchment': 'Parchment',
  'mat-linen': 'Wrapping Linen',
  'mat-tray': 'Opened Case',
  'mat-slate': 'Counting Slate',
};

const GENERATOR_LABELS: Record<string, string> = {
  codex: 'Codex (gpt-image)',
  pixellab: 'PixelLab (pro)',
};

/** Lipsana whose icons are installed, chosen to read as an estate inventory. */
const REVIEW_LIPSANA: readonly LipsanonId[] = ['congressional-approval', 'training-linens', 'quartermasters-ledger'];

export interface LipsanonMatCandidate {
  id: string;
  mat: string;
  matLabel: string;
  generator: string;
  generatorLabel: string;
  version: AdminLiveMediaVersion;
}

/** Newest candidate per (mat, generator), ordered by mat then generator. */
export function lipsanonMatCandidates(catalog: AdminLiveMediaCatalog): LipsanonMatCandidate[] {
  const newest = new Map<string, LipsanonMatCandidate>();
  for (const version of catalog.versions) {
    const match = LIPSANON_MAT_SLOT.exec(version.slot ?? '');
    if (!match || !version.media) continue;
    const [, mat, generator] = match;
    const id = `${mat}--${generator}`;
    const prior = newest.get(id);
    if (!prior || version.rowRevision > prior.version.rowRevision) {
      newest.set(id, {
        id,
        mat,
        matLabel: MAT_LABELS[mat] ?? mat,
        generator,
        generatorLabel: GENERATOR_LABELS[generator] ?? generator,
        version,
      });
    }
  }
  return [...newest.values()].sort((left, right) => (
    left.matLabel.localeCompare(right.matLabel) || left.generator.localeCompare(right.generator)
  ));
}

/** The chosen backdrop's current bytes, or '' when it is not in the catalog. */
export function lipsanonMatBackdropUrl(catalog: AdminLiveMediaCatalog): string {
  const newest = catalog.versions
    .filter((version) => version.slot === LIPSANON_MAT_BACKDROP_SLOT && version.media)
    .sort((left, right) => right.rowRevision - left.rowRevision)[0];
  return newest?.media?.url ?? '';
}

export function useLipsanonMatCatalog(): {
  items: LipsanonMatCandidate[];
  backdrop: string;
  defaultId: string;
  loading: boolean;
  error: string;
  refresh: () => void;
} {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [nonce]);
  const items = useMemo(() => catalog ? lipsanonMatCandidates(catalog) : [], [catalog]);
  const backdrop = useMemo(() => catalog ? lipsanonMatBackdropUrl(catalog) : '', [catalog]);
  // Land on the owner's pick, falling back to first-sorted only if it is not in the
  // catalog -- an unreachable default would silently show the wrong mat, not nothing.
  const defaultId = useMemo(() => (
    items.some((item) => item.id === LIPSANON_MAT_CHOSEN_ID) ? LIPSANON_MAT_CHOSEN_ID : items[0]?.id ?? ''
  ), [items]);
  return { items, backdrop, defaultId, loading: !catalog && !error, error, refresh: () => setNonce((value) => value + 1) };
}

export function findLipsanonMat(items: readonly LipsanonMatCandidate[], id: string): LipsanonMatCandidate | null {
  return items.find((item) => item.id === id) ?? null;
}

/**
 * The composite under review: backdrop, mat, and the lipsanon icons laid on it raw at their
 * installed 64x64 -- no card, no name, no effect text. The words arrive on hover through
 * the shared Tooltip, which is the same trigger the held-lipsanon strip already uses.
 *
 * `cards` is off for the catalog thumbnails, where 64px icons would be illegible anyway
 * and the only question is which mat to open.
 */
export interface LipsanonMotionTuning {
  /** How far the bob rises, in whole pixels. */
  rise: number;
  /** The base cycle every offer's own clock scales from, in seconds. */
  period: number;
  /** Interpolate the bob's stops (a smooth float) or hold each one (a pixel-art bob). */
  stepped: boolean;
  /** Multiplier on the emanation's radius and opacity. 0 puts the light out. */
  glow: number;
  /** The one-pixel stroke that seats the tray on the table, in whole pixels. */
  trayStroke: number;
  /** How much of the untaken lipsana' exit is a shrink. 0 collapses them to a point. */
  recede: number;
  /** Which emphases a hovered lipsanon gets. They compose; any combination is legal. */
  hover: LipsanonHoverEmphasis;
}

/**
 * Emphasis can come from adding light to the lipsanon being considered or from taking it away
 * from everything else, and those read very differently — so none of these is a mode. They
 * are independent, and the combination the owner settles on becomes the committed one.
 */
export interface LipsanonHoverEmphasis {
  /** The emanation opens past the steady level a settled lipsanon already holds. */
  flare: boolean;
  /** A contact shadow beneath, so the scale reads as picked up rather than drawn bigger. */
  lift: boolean;
  /** The silhouette stroke turns from near-black to warm gold. */
  rim: boolean;
  /** The tray and the other offers recede instead. */
  focus: boolean;
}

export const LIPSANON_HOVER_EMPHASES: readonly { key: keyof LipsanonHoverEmphasis; label: string; note: string }[] = [
  { key: 'flare', label: 'Flare', note: 'the light opens up past its settled level' },
  { key: 'lift', label: 'Lift shadow', note: 'a contact shadow beneath — picked up, not just bigger' },
  { key: 'rim', label: 'Gold rim', note: 'the silhouette stroke catches the light' },
  { key: 'focus', label: 'Focus', note: 'the tray and the other two recede instead' },
];

export const LIPSANON_MOTION_COMMITTED: LipsanonMotionTuning = {
  rise: LIPSANON_FLOAT_COMMITTED_RISE,
  period: LIPSANON_FLOAT_COMMITTED_PERIOD,
  stepped: false,
  glow: LIPSANON_GLOW_COMMITTED,
  trayStroke: LIPSANON_TRAY_STROKE_COMMITTED,
  recede: LIPSANON_RECEDE_COMMITTED,
  // Nothing extra ships yet: hovering settles, brightens and enlarges, and that is all until
  // an emphasis is chosen here.
  hover: { flare: false, lift: false, rim: false, focus: false },
};

/** The tuned motion as the custom properties style.css reads. */
export function lipsanonMotionStyle(motion: LipsanonMotionTuning): CSSProperties {
  return {
    '--lipsanon-float-rise': `${motion.rise}px`,
    '--lipsanon-float-period': `${motion.period}s`,
    '--lipsanon-float-timing': motion.stepped ? LIPSANON_FLOAT_STEPPED_TIMING : LIPSANON_FLOAT_COMMITTED_TIMING,
    '--lipsanon-glow': `${motion.glow}`,
    '--lipsanon-tray-stroke-width': `${motion.trayStroke}px`,
    '--lipsanon-recede-scale': `${motion.recede}`,
  } as CSSProperties;
}

/** The enabled emphases as the flags style.css keys its hover rules off. */
export function lipsanonHoverAttributes(hover: LipsanonHoverEmphasis): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const { key } of LIPSANON_HOVER_EMPHASES) {
    if (hover[key]) flags[`data-hover-${key}`] = '';
  }
  return flags;
}

export function LipsanonMatStage({
  candidate,
  backdrop,
  cards = true,
  scale,
  motion,
  taken,
  flying,
  onTake,
}: {
  candidate: LipsanonMatCandidate;
  backdrop: string;
  cards?: boolean;
  scale?: number;
  motion?: LipsanonMotionTuning;
  /** Lipsana already sent to the corner. Absent means the stage is not interactive. */
  taken?: readonly LipsanonId[];
  /** The lipsanon currently travelling, so the mat lets go of it as it leaves. */
  flying?: LipsanonId | null;
  onTake?: (lipsanonId: LipsanonId, icon: Element | null, landing: Element | null) => void;
}): ReactElement {
  const landingSlot = useRef<HTMLSpanElement | null>(null);
  const gone = new Set([...(taken ?? []), ...(flying ? [flying] : [])]);
  // Sticky, like the game's: the mat does not put the other lipsana back once one has been
  // chosen. Reset is what lays them out again.
  const taking = gone.size > 0;
  return (
    <div
      className="lipsanon-mat-stage"
      data-mat={candidate.mat}
      data-generator={candidate.generator}
      data-cards={cards ? 'on' : 'off'}
      style={{
        ...(scale === undefined ? null : { '--lipsanon-mat-scale-tuned': scale } as CSSProperties),
        ...(motion ? lipsanonMotionStyle(motion) : null),
      }}
      {...(motion ? lipsanonHoverAttributes(motion.hover) : null)}
    >
      {backdrop ? <img className="lipsanon-mat-backdrop" src={backdrop} alt="" draggable={false} /> : null}
      <div className="lipsanon-mat-layer">
        {/* Out of flow on purpose: in flow the mat's own natural width feeds back into the
            row's intrinsic sizing, and the layer grows to the raster instead of the cards. */}
        <img className="lipsanon-mat-art" src={candidate.version.media!.url} alt="" draggable={false} />
        {cards ? (
          <div className="lipsanon-mat-cards" data-testid="lipsanon-mat-offers" data-taking={taking ? '' : undefined}>
            {REVIEW_LIPSANA.map((lipsanonId, index) => {
              const lipsanon = LIPSANON_BY_ID[lipsanonId];
              const flown = gone.has(lipsanonId);
              return (
                <Tooltip
                  className={`lipsanon-mat-offer${flown ? ' is-flying' : ''}`}
                  key={lipsanonId}
                  label={`${lipsanon.name}. ${lipsanon.description}`}
                  popupMaxInlineSize={288}
                  title={lipsanon.name}
                  suppressed={taking}
                  // The same per-offer clock the game lays down, so the tuner is judging
                  // the composition the player sees and not three synchronised copies.
                  style={lipsanonFloatClock(index)}
                  trigger={onTake ? (
                    <button
                      type="button"
                      className="run-vacantia-take"
                      data-lipsanon-id={lipsanonId}
                      aria-label={`Send ${lipsanon.name} to the corner`}
                      onClick={(event) => onTake(
                        lipsanonId,
                        event.currentTarget.querySelector('.run-lipsanon-icon'),
                        landingSlot.current,
                      )}
                    >
                      <LipsanonIcon lipsanonId={lipsanonId} />
                    </button>
                  ) : <LipsanonIcon lipsanonId={lipsanonId} />}
                >
                  <span>{lipsanon.description}</span>
                </Tooltip>
              );
            })}
          </div>
        ) : null}
      </div>
      {/* Where a clicked lipsanon goes. The game's destination is the held-lipsanon strip in the
          screen's top-left, so this stands in the same corner and keeps the travel honest.
          The trailing empty slot is what the flight is aimed at — measuring the real box
          beats recomputing the geometry, and it is correct the moment the row reflows. */}
      {taken ? (
        <div className="lipsanon-mat-landing" data-testid="lipsanon-mat-landing" aria-label="Lipsana sent to the corner">
          {taken.map((lipsanonId) => {
            const lipsanon = LIPSANON_BY_ID[lipsanonId];
            // The strip's own classes, not a lookalike: a landed lipsanon has to behave the way
            // a held one does, or the corner stops being a preview of where it went.
            return (
              <Tooltip
                className="lipsanon-mat-landing-slot run-lipsanon-inventory-item"
                key={lipsanonId}
                triggerClassName="run-lipsanon-inventory-trigger"
                popupMaxInlineSize={288}
                label={`${lipsanon.name}. ${lipsanon.description}`}
                title={lipsanon.name}
                trigger={<LipsanonIcon lipsanonId={lipsanonId} />}
              >
                <span>{lipsanon.description}</span>
              </Tooltip>
            );
          })}
          <span className="lipsanon-mat-landing-slot" ref={landingSlot} aria-hidden="true" />
        </div>
      ) : null}
    </div>
  );
}

/** Catalog main pane: the grid. Selection lives here, not in the Controls rail. */
export function LipsanonMatCatalog({
  items,
  backdrop,
  loading,
  error,
  search,
  zoom,
  selected,
  onSelect,
  onView,
}: {
  items: readonly LipsanonMatCandidate[];
  backdrop: string;
  loading: boolean;
  error: string;
  search: string;
  zoom: number;
  selected: string;
  onSelect: (id: string) => void;
  onView: (id: string) => void;
}): ReactElement {
  const query = search.trim().toLowerCase();
  const visible = items.filter((item) => !query
    || `${item.matLabel} ${item.generatorLabel}`.toLowerCase().includes(query));

  return (
    <section className="tileset-studio-main is-headless">
      <section className="tileset-studio-tab-panel">
        <div className="tileset-asset-sections" style={{ '--tile-zoom': zoom } as CSSProperties}>
          {error ? <p className="tileset-catalog-note" role="alert">{error}</p> : null}
          {loading ? <p className="tileset-catalog-note" role="status">Loading lipsanon-mat candidates…</p> : null}
          {!loading && !error && !visible.length
            ? <p className="tileset-catalog-note">No lipsanon-mat candidates match the current search.</p>
            : null}
          {visible.length ? (
            <div className="tileset-studio-grid" data-testid="lipsanon-mat-grid">
              {visible.map((item) => (
                <StudioCatalogCard
                  key={item.id}
                  title={item.matLabel}
                  badge={item.generatorLabel}
                  media={<LipsanonMatStage candidate={item} backdrop={backdrop} cards={false} />}
                  imageClassName="lipsanon-mat-card-image"
                  selected={selected === item.id}
                  onSelect={() => onSelect(item.id)}
                  onInspect={() => onView(item.id)}
                  inspectLabel={`View ${item.matLabel} — ${item.generatorLabel}`}
                  metaExtra={<span className="asset-prov is-original">
                    {item.version.status === 'candidate' ? 'candidate' : item.version.status}
                  </span>}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </section>
  );
}

interface TunedMatMeasurement {
  matWidth: number;
  matHeight: number;
  rowWidth: number;
}

/**
 * The rendered pixels behind the tuned number. The slider's value is the multiple that
 * gets handed back and committed, but a multiple alone does not say whether the mat has
 * grown past the pane or is still hugging the lipsana -- so report what it actually drew.
 * Measured from the DOM rather than recomputed, because the layer is also capped so the
 * mat cannot overflow, and that cap only shows up in the real box.
 */
function useTunedMatMeasurement(
  stage: RefObject<HTMLElement | null>,
  scale: number,
  id: string,
): TunedMatMeasurement | null {
  const [measured, setMeasured] = useState<TunedMatMeasurement | null>(null);
  useEffect(() => {
    const root = stage.current;
    const art = root?.querySelector('.lipsanon-mat-art');
    const row = root?.querySelector('.lipsanon-mat-cards');
    if (!art || !row) { setMeasured(null); return; }

    const read = (): void => {
      const artBox = art.getBoundingClientRect();
      const rowBox = row.getBoundingClientRect();
      // The mat's height comes from its own aspect ratio, so it stays 0 until the image
      // has decoded. Reporting that zero would look like a broken mat rather than a
      // pending one, so wait for a real box.
      if (!artBox.height) return;
      setMeasured({
        matWidth: Math.round(artBox.width),
        matHeight: Math.round(artBox.height),
        rowWidth: Math.round(rowBox.width),
      });
    };

    // Observing beats one measurement after layout: the box changes again when the image
    // decodes and whenever the pane resizes, and the row is capped against the stage, so
    // the same multiple measures differently at different widths.
    const observer = new ResizeObserver(read);
    observer.observe(art);
    observer.observe(row);
    read();
    return () => observer.disconnect();
  }, [stage, scale, id]);
  return measured;
}

/**
 * Hand the tuned value back. A tuning surface that can only be read aloud makes the owner
 * transcribe a number off a screenshot, so this copies the decision -- which mat, at what
 * multiple, over which backdrop -- as text that can be pasted straight into a reply.
 *
 * It exports the INTENT, not the literal CSS: the multiple and what it was measured
 * against, because that is what gets committed and it stays true at any pane width.
 */
function TunedScaleExport({
  candidate,
  measured,
  motion,
  scale,
}: {
  candidate: LipsanonMatCandidate | null;
  measured: TunedMatMeasurement | null;
  motion: LipsanonMotionTuning;
  scale: number;
}): ReactElement | null {
  const [copied, setCopied] = useState(false);
  if (!candidate) return null;

  const summary = [
    `Lipsanon mat: ${candidate.version.slot}`,
    `Mat scale: ${scale.toFixed(2)}× the lipsanon row`,
    measured ? `Measured: mat ${measured.matWidth}×${measured.matHeight} over a ${measured.rowWidth}px row` : null,
    `Backdrop: ${LIPSANON_MAT_BACKDROP_SLOT}`,
    `Committed: ${LIPSANON_MAT_COMMITTED_SCALE.toFixed(2)}×`,
  ].filter(Boolean).join('\n');

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard refused; the readout above still carries the number */ }
  };

  return (
    <ChromeButton
      unit="inner-text-button"
      data-testid="lipsanon-mat-export"
      onClick={() => { void copy(); }}
    >
      {copied ? 'Copied' : 'Export value'}
    </ChromeButton>
  );
}

/** Viewer stage: the composite as large as the pane allows, plus the Details readout. */
export function LipsanonMatViewer({
  items,
  backdrop,
  id,
  header,
  onSelect,
}: {
  items: readonly LipsanonMatCandidate[];
  backdrop: string;
  id: string;
  header?: ReactNode;
  onSelect: (id: string) => void;
}): ReactElement {
  const found = id ? findLipsanonMat(items, id) : null;
  const empty = 'No candidate selected — pick a card in the Lipsanon Mat catalog.';
  const [scale, setScale] = useState(LIPSANON_MAT_COMMITTED_SCALE);
  const [motion, setMotion] = useState<LipsanonMotionTuning>(LIPSANON_MOTION_COMMITTED);
  // Clicking a lipsanon plays the real take: the same travel, to the same corner of the screen
  // the game sends it to. Reset lays them back out so it can be watched again.
  const [taken, setTaken] = useState<LipsanonId[]>([]);
  const { flight, launch, element: flightElement } = useLipsanonFlight(
    (lipsanonId) => setTaken((current) => (current.includes(lipsanonId) ? current : [...current, lipsanonId])),
  );
  const tune = <Key extends keyof LipsanonMotionTuning>(key: Key, value: LipsanonMotionTuning[Key]): void =>
    setMotion((current) => ({ ...current, [key]: value }));
  const stage = useRef<HTMLElement | null>(null);
  const measured = useTunedMatMeasurement(stage, scale, id);
  return (
    <>
      <section className="al-lab-main" aria-label="Lipsanon mat preview">
        {!found ? <p className="al-lab-empty">{empty}</p> : (
          <div className="al-lab-stages">
            <figure ref={stage} className="al-stage lipsanon-mat-figure" data-testid="lipsanon-mat-stage" data-mat={found.mat} data-generator={found.generator}>
              <LipsanonMatStage
                candidate={found}
                backdrop={backdrop}
                scale={scale}
                motion={motion}
                taken={taken}
                flying={flight?.lipsanonId ?? null}
                onTake={(lipsanonId, icon, landing) => {
                  if (!launch(lipsanonId, icon, slotPoint(landing))) {
                    setTaken((current) => (current.includes(lipsanonId) ? current : [...current, lipsanonId]));
                  }
                }}
              />
              <figcaption>{found.matLabel} — {found.generatorLabel}</figcaption>
            </figure>
            {flightElement}
          </div>
        )}
      </section>
      <aside className="tileset-view-controls" aria-label="Lipsanon mat controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <StudioStepper
              itemNoun="candidate"
              label="Candidate"
              onChange={onSelect}
              options={items.map((item) => ({ id: item.id, label: `${item.matLabel} — ${item.generatorLabel}` }))}
              value={found?.id ?? ''}
            />
            {/* Clicking a lipsanon on the stage plays its travel to the corner. This lays them
                back out so it can be replayed without leaving the screen. */}
            <label className="tileset-catalog-zoom">
              <span>Take animation <strong data-testid="lipsanon-mat-taken-count">{taken.length ? 'taken' : 'ready'}</strong> — click a lipsanon on the mat</span>
              <div className="pages-ctl-row">
                <ChromeButton
                  unit="inner-text-button"
                  data-testid="lipsanon-mat-reset-take"
                  disabled={taken.length === 0}
                  onClick={() => setTaken([])}
                >
                  Reset lipsana
                </ChromeButton>
              </div>
            </label>
            <SliderRow
              label={<>Others vanish <strong data-testid="lipsanon-recede-value">{motion.recede.toFixed(2)}×</strong> — 0 shrinks them to a point, 1 only fades them</>}
              value={motion.recede}
              set={(value) => tune('recede', value)}
              min={0}
              max={1}
              step={0.01}
              nudge={0.01}
              dflt={LIPSANON_MOTION_COMMITTED.recede}
            />
            <SliderRow
              label={<>Mat scale <strong data-testid="lipsanon-mat-scale-value">{scale.toFixed(2)}×</strong> the lipsanon row</>}
              value={scale}
              set={setScale}
              min={1}
              max={3}
              step={0.01}
              nudge={0.01}
              dflt={LIPSANON_MAT_COMMITTED_SCALE}
            />
            <p className="tileset-catalog-note" data-testid="lipsanon-mat-scale-readout">
              {measured
                ? `Mat ${measured.matWidth}×${measured.matHeight} over a ${measured.rowWidth}px lipsanon row. Committed value is ${LIPSANON_MAT_COMMITTED_SCALE.toFixed(2)}× — the reset returns here.`
                : `Committed value is ${LIPSANON_MAT_COMMITTED_SCALE.toFixed(2)}×.`}
            </p>

            {/* The lipsana' idle life. The stage above runs the SAME rules the game runs, so
                what is tuned here is what ships once the value is committed to style.css. */}
            <label className="tileset-catalog-zoom">
              <span>Float</span>
              <div className="pages-ctl-row">
                <ChoiceGroup
                  ariaLabel="Float character"
                  value={motion.stepped ? 'stepped' : 'smooth'}
                  options={[
                    { value: 'smooth', label: 'Smooth', title: 'Interpolate between the bob’s stops' },
                    { value: 'stepped', label: 'Pixel-stepped', title: 'Hold each whole-pixel stop' },
                  ]}
                  onChange={(value) => tune('stepped', value === 'stepped')}
                />
                {ctlReset(() => tune('stepped', LIPSANON_MOTION_COMMITTED.stepped))}
              </div>
            </label>
            <SliderRow
              label={<>Float rise <strong data-testid="lipsanon-float-rise-value">{motion.rise}px</strong></>}
              value={motion.rise}
              set={(value) => tune('rise', Math.round(value))}
              min={0}
              max={14}
              step={1}
              nudge={1}
              dflt={LIPSANON_MOTION_COMMITTED.rise}
            />
            <SliderRow
              label={<>Float period <strong data-testid="lipsanon-float-period-value">{motion.period.toFixed(1)}s</strong></>}
              value={motion.period}
              set={(value) => tune('period', value)}
              min={0.8}
              max={9}
              step={0.1}
              nudge={0.1}
              dflt={LIPSANON_MOTION_COMMITTED.period}
            />
            <SliderRow
              label={<>Glow <strong data-testid="lipsanon-glow-value">{motion.glow.toFixed(2)}×</strong></>}
              value={motion.glow}
              set={(value) => tune('glow', value)}
              min={0}
              max={2.5}
              step={0.05}
              nudge={0.05}
              dflt={LIPSANON_MOTION_COMMITTED.glow}
            />
            <SliderRow
              label={<>Tray stroke <strong data-testid="lipsanon-tray-stroke-value">{motion.trayStroke}px</strong></>}
              value={motion.trayStroke}
              set={(value) => tune('trayStroke', Math.round(value))}
              min={0}
              max={4}
              step={1}
              nudge={1}
              dflt={LIPSANON_MOTION_COMMITTED.trayStroke}
            />

            {/* Emphasis on hover. Independent on purpose: adding light to the lipsanon and
                taking it away from everything else are different readings, and they can be
                combined. Hover a lipsanon on the stage to judge each one. */}
            <label className="tileset-catalog-zoom">
              <span>Hover emphasis</span>
              <div className="pages-ctl-row">
                {ctlReset(() => tune('hover', LIPSANON_MOTION_COMMITTED.hover))}
              </div>
            </label>
            {LIPSANON_HOVER_EMPHASES.map(({ key, label, note }) => (
              <label className="tileset-catalog-zoom" key={key}>
                <span>{label} <em>— {note}</em></span>
                <div className="pages-ctl-row">
                  <Toggle
                    label={`${label} on hover`}
                    checked={motion.hover[key]}
                    onChange={(checked) => tune('hover', { ...motion.hover, [key]: checked })}
                  />
                </div>
              </label>
            ))}

            <p className="tileset-catalog-note" data-testid="lipsanon-motion-readout">
              {motion.stepped
                ? `Pixel-stepped: 12 held stops per cycle, so the bob advances about every ${Math.round(motion.period * 1000 / 12)}ms and never lands off-pixel.`
                : 'Smooth: the bob’s whole-pixel stops are interpolated, so it moves every frame and can sit between pixels.'}
              {` Committed is ${LIPSANON_MOTION_COMMITTED.stepped ? 'pixel-stepped' : 'smooth'}, ${LIPSANON_MOTION_COMMITTED.rise}px over ${LIPSANON_MOTION_COMMITTED.period.toFixed(1)}s, glow ${LIPSANON_MOTION_COMMITTED.glow.toFixed(2)}× — every reset returns there.`}
            </p>
            <TunedScaleExport candidate={found} measured={measured} motion={motion} scale={scale} />
            {found ? (
              <dl className="al-meta">
                <div><dt>Mat</dt><dd>{found.matLabel}</dd></div>
                <div><dt>Generator</dt><dd>{found.generatorLabel}</dd></div>
                <div><dt>Native</dt><dd>{found.version.media!.width ?? '?'}×{found.version.media!.height ?? '?'}</dd></div>
                <div><dt>Behind it</dt><dd>Spolia · Table (codex)</dd></div>
                <div><dt>Status</dt><dd>{found.version.status === 'candidate' ? 'candidate · not installed' : found.version.status}</dd></div>
                <div><dt>Slot</dt><dd>{found.version.slot}</dd></div>
                <div><dt>SHA-256</dt><dd>{found.version.media!.sha256}</dd></div>
              </dl>
            ) : <p className="tileset-catalog-note">{empty}</p>}
          </div>
        </section>
      </aside>
    </>
  );
}
