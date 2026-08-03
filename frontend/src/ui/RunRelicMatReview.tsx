import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode, type RefObject } from 'react';
import { fetchAdminLiveMediaCatalog, type AdminLiveMediaCatalog, type AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import { RUN_RELIC_BY_ID, type RunRelicId } from '../run/model';
import { RunRelicIcon } from './RunRelics';
import { Tooltip } from './shared/InfoTip';
import { StudioCatalogCard } from './studio/StudioCatalogCard';
import { StudioStepper } from './studio/StudioStepper';
import { SliderRow } from './dressing/SliderRow';
import { ChromeButton } from './shared/ChromeButton';

/**
 * Candidate MATS -- the surface the Run's relic offers are laid out on at the head of a
 * Conflict -- read straight from the live-media catalog.
 *
 * A mat cannot be judged alone. It is a middle layer: the chosen Spolia backdrop is
 * behind it and the relic icons sit on it, and whether it works is entirely a question of
 * what it does between those two. So every card and the viewer stage mount the actual
 * composite rather than showing the mat's pixels on a checkerboard.
 *
 * Read-only. Nothing here accepts, installs, or promotes a candidate.
 */
const RELIC_MAT_SLOT = /^review\/run-relic-mat\/([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)\.png$/;

/** The backdrop the owner chose for this screen; the mat is judged over these pixels. */
export const RELIC_MAT_BACKDROP_SLOT = 'review/run-screen-art/spolia-inventory/codex.png';

/** The mat the owner chose. The Viewer opens on it rather than on whatever sorts first. */
export const RELIC_MAT_CHOSEN_ID = 'mat-tray--codex';

/**
 * The committed mat width, as a multiple of the relic row's. Mirrors --relic-mat-scale in
 * style.css and is what the Viewer's tuning slider resets to -- a reset returns to the
 * value the game ships, never to zero or to the slider's floor (ADR-0057).
 */
export const RELIC_MAT_COMMITTED_SCALE = 1.74;

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

/** Relics whose icons are installed, chosen to read as an estate inventory. */
const REVIEW_RELICS: readonly RunRelicId[] = ['congressional-approval', 'training-linens', 'quartermasters-ledger'];

export interface RelicMatCandidate {
  id: string;
  mat: string;
  matLabel: string;
  generator: string;
  generatorLabel: string;
  version: AdminLiveMediaVersion;
}

/** Newest candidate per (mat, generator), ordered by mat then generator. */
export function relicMatCandidates(catalog: AdminLiveMediaCatalog): RelicMatCandidate[] {
  const newest = new Map<string, RelicMatCandidate>();
  for (const version of catalog.versions) {
    const match = RELIC_MAT_SLOT.exec(version.slot ?? '');
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
export function relicMatBackdropUrl(catalog: AdminLiveMediaCatalog): string {
  const newest = catalog.versions
    .filter((version) => version.slot === RELIC_MAT_BACKDROP_SLOT && version.media)
    .sort((left, right) => right.rowRevision - left.rowRevision)[0];
  return newest?.media?.url ?? '';
}

export function useRelicMatCatalog(): {
  items: RelicMatCandidate[];
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
  const items = useMemo(() => catalog ? relicMatCandidates(catalog) : [], [catalog]);
  const backdrop = useMemo(() => catalog ? relicMatBackdropUrl(catalog) : '', [catalog]);
  // Land on the owner's pick, falling back to first-sorted only if it is not in the
  // catalog -- an unreachable default would silently show the wrong mat, not nothing.
  const defaultId = useMemo(() => (
    items.some((item) => item.id === RELIC_MAT_CHOSEN_ID) ? RELIC_MAT_CHOSEN_ID : items[0]?.id ?? ''
  ), [items]);
  return { items, backdrop, defaultId, loading: !catalog && !error, error, refresh: () => setNonce((value) => value + 1) };
}

export function findRelicMat(items: readonly RelicMatCandidate[], id: string): RelicMatCandidate | null {
  return items.find((item) => item.id === id) ?? null;
}

/**
 * The composite under review: backdrop, mat, and the relic icons laid on it raw at their
 * installed 64x64 -- no card, no name, no effect text. The words arrive on hover through
 * the shared Tooltip, which is the same trigger the held-relic strip already uses.
 *
 * `cards` is off for the catalog thumbnails, where 64px icons would be illegible anyway
 * and the only question is which mat to open.
 */
export function RelicMatStage({
  candidate,
  backdrop,
  cards = true,
  scale,
}: {
  candidate: RelicMatCandidate;
  backdrop: string;
  cards?: boolean;
  scale?: number;
}): ReactElement {
  return (
    <div
      className="relic-mat-stage"
      data-mat={candidate.mat}
      data-generator={candidate.generator}
      data-cards={cards ? 'on' : 'off'}
      style={scale === undefined ? undefined : { '--relic-mat-scale-tuned': scale } as CSSProperties}
    >
      {backdrop ? <img className="relic-mat-backdrop" src={backdrop} alt="" draggable={false} /> : null}
      <div className="relic-mat-layer">
        {/* Out of flow on purpose: in flow the mat's own natural width feeds back into the
            row's intrinsic sizing, and the layer grows to the raster instead of the cards. */}
        <img className="relic-mat-art" src={candidate.version.media!.url} alt="" draggable={false} />
        {cards ? (
          <div className="relic-mat-cards" data-testid="relic-mat-offers">
            {REVIEW_RELICS.map((relicId) => {
              const relic = RUN_RELIC_BY_ID[relicId];
              return (
                <Tooltip
                  className="relic-mat-offer"
                  key={relicId}
                  label={`${relic.name}. ${relic.description}`}
                  popupMaxInlineSize={288}
                  title={relic.name}
                  trigger={<RunRelicIcon relicId={relicId} />}
                >
                  <span>{relic.description}</span>
                </Tooltip>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Catalog main pane: the grid. Selection lives here, not in the Controls rail. */
export function RelicMatCatalog({
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
  items: readonly RelicMatCandidate[];
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
          {loading ? <p className="tileset-catalog-note" role="status">Loading relic-mat candidates…</p> : null}
          {!loading && !error && !visible.length
            ? <p className="tileset-catalog-note">No relic-mat candidates match the current search.</p>
            : null}
          {visible.length ? (
            <div className="tileset-studio-grid" data-testid="relic-mat-grid">
              {visible.map((item) => (
                <StudioCatalogCard
                  key={item.id}
                  title={item.matLabel}
                  badge={item.generatorLabel}
                  media={<RelicMatStage candidate={item} backdrop={backdrop} cards={false} />}
                  imageClassName="relic-mat-card-image"
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
 * grown past the pane or is still hugging the relics -- so report what it actually drew.
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
    const art = root?.querySelector('.relic-mat-art');
    const row = root?.querySelector('.relic-mat-cards');
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
  scale,
}: {
  candidate: RelicMatCandidate | null;
  measured: TunedMatMeasurement | null;
  scale: number;
}): ReactElement | null {
  const [copied, setCopied] = useState(false);
  if (!candidate) return null;

  const summary = [
    `Relic mat: ${candidate.version.slot}`,
    `Mat scale: ${scale.toFixed(2)}× the relic row`,
    measured ? `Measured: mat ${measured.matWidth}×${measured.matHeight} over a ${measured.rowWidth}px row` : null,
    `Backdrop: ${RELIC_MAT_BACKDROP_SLOT}`,
    `Committed: ${RELIC_MAT_COMMITTED_SCALE.toFixed(2)}×`,
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
      data-testid="relic-mat-export"
      onClick={() => { void copy(); }}
    >
      {copied ? 'Copied' : 'Export value'}
    </ChromeButton>
  );
}

/** Viewer stage: the composite as large as the pane allows, plus the Details readout. */
export function RelicMatViewer({
  items,
  backdrop,
  id,
  header,
  onSelect,
}: {
  items: readonly RelicMatCandidate[];
  backdrop: string;
  id: string;
  header?: ReactNode;
  onSelect: (id: string) => void;
}): ReactElement {
  const found = id ? findRelicMat(items, id) : null;
  const empty = 'No candidate selected — pick a card in the Relic Mat catalog.';
  const [scale, setScale] = useState(RELIC_MAT_COMMITTED_SCALE);
  const stage = useRef<HTMLElement | null>(null);
  const measured = useTunedMatMeasurement(stage, scale, id);
  return (
    <>
      <section className="al-lab-main" aria-label="Relic mat preview">
        {!found ? <p className="al-lab-empty">{empty}</p> : (
          <div className="al-lab-stages">
            <figure ref={stage} className="al-stage relic-mat-figure" data-testid="relic-mat-stage" data-mat={found.mat} data-generator={found.generator}>
              <RelicMatStage candidate={found} backdrop={backdrop} scale={scale} />
              <figcaption>{found.matLabel} — {found.generatorLabel}</figcaption>
            </figure>
          </div>
        )}
      </section>
      <aside className="tileset-view-controls" aria-label="Relic mat controls">
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
            <SliderRow
              label={<>Mat scale <strong data-testid="relic-mat-scale-value">{scale.toFixed(2)}×</strong> the relic row</>}
              value={scale}
              set={setScale}
              min={1}
              max={3}
              step={0.01}
              nudge={0.01}
              dflt={RELIC_MAT_COMMITTED_SCALE}
            />
            <p className="tileset-catalog-note" data-testid="relic-mat-scale-readout">
              {measured
                ? `Mat ${measured.matWidth}×${measured.matHeight} over a ${measured.rowWidth}px relic row. Committed value is ${RELIC_MAT_COMMITTED_SCALE.toFixed(2)}× — the reset returns here.`
                : `Committed value is ${RELIC_MAT_COMMITTED_SCALE.toFixed(2)}×.`}
            </p>
            <TunedScaleExport candidate={found} measured={measured} scale={scale} />
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
