import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { saveRunCardRowSizing } from '../net/runCardRowSizing';
import { RUN_CARD_CATALOG } from '../run/model';
import { RunCard } from './RunCard';
import { RunCardRow } from './RunCardRow';
import {
  RUN_CARD_ASPECT_HEIGHT,
  RUN_CARD_ASPECT_WIDTH,
  RUN_CARD_ROW_SIZING_DEFAULTS,
  RUN_CARD_ROW_SIZING_LIMITS,
  runCardRowCardHeight,
  runCardRowCardWidth,
  type RunCardRowSizing,
} from './runCardRowSizing';
import { SliderRow } from './dressing/SliderRow';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

const DRAFT_KEY = 'studio.runCardRowSizing.draft.v1';

/**
 * The Run's real card lane, measured off the live Bona Vacantia workspace body at
 * each window the app is verified at. The instrument prints these boxes at 1:1 so
 * a card in here is the same number of pixels as a card on the screen it ships to.
 */
const LANES: readonly Readonly<{ id: string; label: string; width: number; height: number }>[] = Object.freeze([
  { id: 'wide', label: '1440 × 900 window', width: 1082, height: 792 },
  { id: 'medium', label: '1280 × 800 window', width: 961, height: 692 },
  { id: 'narrow', label: '740 × 430 window', width: 506, height: 322 },
]);

/** Bona Vacantia and the ordinary Sectio deal three; a Quartermaster Sectio deals four. */
const COUNTS: readonly number[] = Object.freeze([3, 4]);

function sameSizing(left: RunCardRowSizing, right: RunCardRowSizing): boolean {
  return left.maxWidth === right.maxWidth
    && left.heightFill === right.heightFill
    && left.gap === right.gap;
}

function withinLimits(value: Partial<RunCardRowSizing> | null): value is RunCardRowSizing {
  if (!value) return false;
  return (Object.keys(RUN_CARD_ROW_SIZING_LIMITS) as (keyof RunCardRowSizing)[]).every((key) => {
    const limits = RUN_CARD_ROW_SIZING_LIMITS[key];
    const candidate = value[key];
    return Number.isInteger(candidate) && candidate! >= limits.min && candidate! <= limits.max;
  });
}

function readDraft(): RunCardRowSizing {
  if (typeof window === 'undefined') return { ...RUN_CARD_ROW_SIZING_DEFAULTS };
  try {
    const value = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null') as Partial<RunCardRowSizing> | null;
    if (withinLimits(value)) return { maxWidth: value.maxWidth, heightFill: value.heightFill, gap: value.gap };
  } catch {
    // A malformed old draft is disposable; the Git-owned baseline remains authoritative.
  }
  return { ...RUN_CARD_ROW_SIZING_DEFAULTS };
}

/**
 * The in-game workspace inset the live card rows sit inside, on both sides of an
 * axis. The Studio's own density is the comfortable one, so this is written out
 * rather than read from `--ds-inset`.
 */
const LANE_INSET = 16;

/**
 * The row the live screens print, mounted inside one exact Run card lane.
 *
 * The lane box is always built at 1:1 so the row measures the real number of
 * pixels it gets in the Run; the viewer's zoom only scales the finished picture.
 */
function LanePreview({
  lane,
  count,
  sizing,
  zoom,
}: {
  lane: typeof LANES[number];
  count: number;
  sizing: RunCardRowSizing;
  zoom: number;
}): ReactElement {
  const cards = RUN_CARD_CATALOG.slice(0, count);
  return (
    <figure className="run-card-size-studio-lane" data-testid={`run-card-size-lane-${lane.id}`}>
      <figcaption>{lane.label} · card lane {lane.width} × {lane.height}px</figcaption>
      <div
        className="run-card-size-studio-lane-scaler"
        style={{
          blockSize: `${Math.round(lane.height * zoom)}px`,
          inlineSize: `${Math.round(lane.width * zoom)}px`,
        }}
      >
        <div
          className="run-card-size-studio-lane-box"
          style={{
            blockSize: `${lane.height}px`,
            inlineSize: `${lane.width}px`,
            scale: `${zoom}`,
          }}
        >
          <RunCardRow count={cards.length} sizing={sizing}>
            {cards.map((card) => <RunCard key={card.id} card={card} mode="reference" />)}
          </RunCardRow>
        </div>
      </div>
    </figure>
  );
}

export function RunCardSizeCatalog({ onOpen }: { onOpen: () => void }): ReactElement {
  return (
    <div
      className="tileset-studio-grid pages-grid run-card-size-catalog"
      aria-label="Card size instruments"
      data-testid="run-card-size-catalog"
    >
      <StudioCatalogCard
        title="Card Size"
        badge={`${RUN_CARD_ROW_SIZING_DEFAULTS.maxWidth}px maximum`}
        selected
        onSelect={onOpen}
        onOpen={onOpen}
        titleText="Open the Bona Vacantia and Sectio card-size instrument"
        imageClassName="run-card-size-catalog-image"
        media={(
          <span className="run-card-size-catalog-specimen">
            {RUN_CARD_CATALOG.slice(0, 3).map((card) => (
              <RunCard key={card.id} card={card} mode="reference" />
            ))}
          </span>
        )}
        textExtra={<span>How large the Run prints its card rows.</span>}
      />
    </div>
  );
}

export function RunCardSizeViewer({
  header,
  viewerZoom,
}: {
  header: ReactNode;
  viewerZoom: number;
}): ReactElement {
  const [baseline, setBaseline] = useState<RunCardRowSizing>({ ...RUN_CARD_ROW_SIZING_DEFAULTS });
  const [sizing, setSizing] = useState<RunCardRowSizing>(readDraft);
  const [laneId, setLaneId] = useState(LANES[0].id);
  const [count, setCount] = useState(COUNTS[0]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Reset uses the Git-owned sizing the Bona Vacantia and Sectio currently print.');
  const lane = LANES.find((candidate) => candidate.id === laneId) ?? LANES[0];

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(sizing));
  }, [sizing]);

  const update = useCallback((patch: Partial<RunCardRowSizing>): void => {
    setSizing((current) => ({ ...current, ...patch }));
    setStatus('Draft changed. Save defaults to hand these exact numbers to the Run.');
  }, []);

  const resetAll = (): void => {
    setSizing({ ...baseline });
    setStatus('Draft reset to the runtime defaults.');
  };

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setStatus('Saving runtime defaults…');
    try {
      const saved = await saveRunCardRowSizing({ card: sizing });
      const next = { ...saved.card };
      setBaseline(next);
      setSizing(next);
      setStatus('Saved. Bona Vacantia and the Sectio now print these sizes; Vite will refresh the imported numbers.');
    } catch (reason) {
      setStatus(reason instanceof Error ? `Save failed: ${reason.message}` : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(JSON.stringify({ card: sizing }, null, 2));
    setStatus('Copied the current sizing JSON.');
  };

  const box = { width: lane.width - LANE_INSET, height: lane.height - LANE_INSET };
  const cardWidth = runCardRowCardWidth({ count, box, sizing });
  const widthFit = (box.width - (count - 1) * sizing.gap) / count;
  const heightFit = (box.height * (sizing.heightFill / 100) * RUN_CARD_ASPECT_WIDTH) / RUN_CARD_ASPECT_HEIGHT;
  const boundBy = sizing.maxWidth <= Math.min(widthFit, heightFit)
    ? 'the tuned maximum'
    : heightFit <= widthFit ? 'the lane height' : 'the lane width';

  return (
    <>
      <section
        className="tileset-studio-main run-card-size-studio"
        aria-label="Card size stage"
        data-testid="run-card-size-studio"
      >
        <LanePreview lane={lane} count={count} sizing={sizing} zoom={viewerZoom} />
      </section>
      <aside className="tileset-view-controls" aria-label="Card size controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          {header}
          <div className="tileset-control-stack">
            <div data-testid="run-card-size-max-width-control">
              <SliderRow
                label={<>Largest card · {sizing.maxWidth}px wide</>}
                value={sizing.maxWidth}
                set={(maxWidth) => update({ maxWidth })}
                {...RUN_CARD_ROW_SIZING_LIMITS.maxWidth}
                nudge={4}
                dflt={baseline.maxWidth}
              />
            </div>
            <div data-testid="run-card-size-height-fill-control">
              <SliderRow
                label={<>Screen height used · {sizing.heightFill}%</>}
                value={sizing.heightFill}
                set={(heightFill) => update({ heightFill })}
                {...RUN_CARD_ROW_SIZING_LIMITS.heightFill}
                dflt={baseline.heightFill}
              />
            </div>
            <div data-testid="run-card-size-gap-control">
              <SliderRow
                label={<>Space between cards · {sizing.gap}px</>}
                value={sizing.gap}
                set={(gap) => update({ gap })}
                {...RUN_CARD_ROW_SIZING_LIMITS.gap}
                nudge={2}
                dflt={baseline.gap}
              />
            </div>
            <label className="tileset-category-select">
              <span>Window</span>
              <select value={lane.id} onChange={(event) => setLaneId(event.target.value)} aria-label="Window">
                {LANES.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
                ))}
              </select>
            </label>
            <label className="tileset-category-select">
              <span>Cards dealt</span>
              <select value={count} onChange={(event) => setCount(Number(event.target.value))} aria-label="Cards dealt">
                {COUNTS.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate === 3 ? '3 · Bona Vacantia and Sectio' : '4 · Quartermaster Sectio'}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="tileset-view-action"
              data-testid="run-card-size-save"
              disabled={busy || sameSizing(sizing, baseline)}
              onClick={() => { void save(); }}
            >
              {busy ? 'Saving…' : 'Save runtime defaults'}
            </button>
            <button type="button" className="tileset-view-action" disabled={sameSizing(sizing, baseline)} onClick={resetAll}>Reset all</button>
            <button type="button" className="tileset-view-action" onClick={() => { void copy(); }}>Copy sizing JSON</button>
          </div>
          <dl>
            <div><dt>Card</dt><dd>{cardWidth}px × {runCardRowCardHeight(cardWidth)}px</dd></div>
            <div><dt>Row</dt><dd>{count * cardWidth + (count - 1) * sizing.gap}px wide</dd></div>
            <div><dt>Lane</dt><dd>{lane.width}px × {lane.height}px</dd></div>
            <div><dt>Bound by</dt><dd>{boundBy}</dd></div>
          </dl>
          <p role="status">{status}</p>
        </section>
      </aside>
    </>
  );
}
