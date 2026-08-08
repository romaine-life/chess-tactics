import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { saveRunCardRowSizing } from '../net/runCardRowSizing';
import { RUN_CARD_CATALOG } from '../run/model';
import { RunCard } from './RunCard';
import {
  RUN_CARD_ROW_SIZING_DEFAULTS,
  RUN_CARD_ROW_SIZING_LIMITS,
  runCardRowCardHeight,
  runCardRowSizingCss,
  sameRunCardRowSizing,
  type RunCardRowSizing,
} from './runCardRowSizing';
import { SliderRow, ctlReset } from './dressing/SliderRow';
import { ChoiceGroup } from './shared/ChoiceGroup';
import { useInjectedStyle } from './dressing/useInjectedStyle';
import { useWindowScaledPreview } from './useWindowScaledPreview';
import { StudioCatalogCard } from './studio/StudioCatalogCard';
import {
  RUN_CARD_LIFE_COMMITTED,
  RUN_CARD_LIFE_LIMITS,
  runCardLifeCss,
  sameRunCardLife,
  type RunCardLifeTuning,
} from './runCardLife';

const DRAFT_KEY = 'studio.runCardRowSizing.draft.v1';
const LIFE_DRAFT_KEY = 'studio.runCardLife.draft.v1';

/**
 * The two screens this tuning is for, each addressed by the craft spec that puts
 * a Run on it. Opening one crafts the account's active Run onto that state — the
 * owner's Run is disposable test state and this is a development instrument.
 */
const SCREENS: readonly Readonly<{ id: string; label: string; route: string; cards: number }>[] = Object.freeze([
  { id: 'vacantia', label: 'Bona Vacantia · opening grant', route: '/run?craft=bona-vacantia&battle=1', cards: 3 },
  { id: 'sectio', label: 'Sectio · card offers', route: '/run?craft=sectio&battle=3&gold=25', cards: 3 },
]);

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
    if (withinLimits(value)) return { size: value.size, maxWidth: value.maxWidth, gap: value.gap };
  } catch {
    // A malformed old draft is disposable; the Git-owned baseline remains authoritative.
  }
  return { ...RUN_CARD_ROW_SIZING_DEFAULTS };
}

/**
 * The card LIFE draft. It rides the same injected-stylesheet channel the sizing does, so every
 * knob moves the drift and the light on the real screen beside it. Unlike the sizing there is no
 * Save: the committed numbers are Git-owned constants in runCardLife.ts, mirrored as the CSS
 * fallbacks — so Copy hands over the exact block to paste, and Reset returns to what ships
 * (ADR-0057).
 */
function readLifeDraft(): RunCardLifeTuning {
  if (typeof window === 'undefined') return { ...RUN_CARD_LIFE_COMMITTED };
  try {
    const value = JSON.parse(window.localStorage.getItem(LIFE_DRAFT_KEY) ?? 'null') as Partial<RunCardLifeTuning> | null;
    if (value && typeof value === 'object') return { ...RUN_CARD_LIFE_COMMITTED, ...value };
  } catch {
    // A malformed old draft is disposable; the committed constants remain authoritative.
  }
  return { ...RUN_CARD_LIFE_COMMITTED };
}

/** What the previewed row is actually printing, read back out of the live screen. */
interface PrintedRow {
  cardWidth: number;
  cardHeight: number;
  boundBy: string;
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
        badge="Live Run screens"
        selected
        onSelect={onOpen}
        onOpen={onOpen}
        titleText="Open the Bona Vacantia and Sectio card-size and card-life instrument"
        imageClassName="run-card-size-catalog-image"
        media={(
          <span className="run-card-size-catalog-specimen">
            {RUN_CARD_CATALOG.slice(0, 3).map((card) => (
              <RunCard key={card.id} card={card} mode="reference" />
            ))}
          </span>
        )}
        textExtra={<span>How large the Run prints its card rows, and how they drift and catch the light.</span>}
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // Full-size, scrollable preview scaled by the Viewer's zoom: the iframe carries the live
  // window's size, so the Run's lane — and therefore the card fit being tuned — resolves at
  // shipped proportions instead of a panel-sized re-centre. See useWindowScaledPreview.
  const { canvasStyle, frameStyle } = useWindowScaledPreview(viewerZoom);
  const [baseline, setBaseline] = useState<RunCardRowSizing>({ ...RUN_CARD_ROW_SIZING_DEFAULTS });
  const [sizing, setSizing] = useState<RunCardRowSizing>(readDraft);
  const [life, setLife] = useState<RunCardLifeTuning>(readLifeDraft);
  const [screenId, setScreenId] = useState(SCREENS[0].id);
  const [printed, setPrinted] = useState<PrintedRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Controls drive the live Run screen beside them. Reset returns to the sizing it ships with.');
  const screen = SCREENS.find((candidate) => candidate.id === screenId) ?? SCREENS[0];

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(sizing));
  }, [sizing]);

  useEffect(() => {
    window.localStorage.setItem(LIFE_DRAFT_KEY, JSON.stringify(life));
  }, [life]);

  // The audition channel: the real screen inside the iframe reads these properties,
  // so every slider moves the cards on the screen they ship to.
  useInjectedStyle(iframeRef, 'run-card-size-tuning', runCardRowSizingCss(sizing));
  useInjectedStyle(iframeRef, 'run-card-life-tuning', runCardLifeCss(life));

  // Read the printed row back out of the live screen rather than recomputing it here:
  // the number shown is the number the screen drew.
  useEffect(() => {
    const read = (): void => {
      try {
        const row = iframeRef.current?.contentDocument?.querySelector('.run-card-row');
        const width = Number(row?.getAttribute('data-run-card-width') ?? Number.NaN);
        setPrinted(Number.isFinite(width) && width > 0
          ? {
            cardWidth: width,
            cardHeight: Number(row?.getAttribute('data-run-card-height') ?? runCardRowCardHeight(width)),
            boundBy: row?.getAttribute('data-run-card-bound-by') ?? '',
          }
          : null);
      } catch {
        // Same-origin access blips while the previewed route navigates; the next tick retries.
      }
    };
    read();
    const timer = window.setInterval(read, 250);
    return () => window.clearInterval(timer);
  }, [screenId]);

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

  const tuneLife = (patch: Partial<RunCardLifeTuning>): void => {
    setLife((current) => ({ ...current, ...patch }));
    setStatus('Life changed. Copy the CSS and paste the numbers into runCardLife.ts to commit them.');
  };

  const copyLife = async (): Promise<void> => {
    await navigator.clipboard.writeText(runCardLifeCss(life));
    setStatus('Copied the card-life CSS.');
  };

  return (
    <>
      <section className="surface-dressing-main is-window-zoom run-card-size-studio" aria-label="Live Run card screen preview">
        <div className="surface-dressing-canvas" style={canvasStyle}>
          <iframe
            ref={iframeRef}
            className="surface-dressing-frame"
            data-testid="run-card-size-preview"
            key={screen.id}
            src={screen.route}
            title={`Live ${screen.label} preview`}
            style={frameStyle}
          />
        </div>
      </section>
      <aside className="tileset-view-controls" aria-label="Card size controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          {header}
          <div className="tileset-control-stack">
            <label className="tileset-category-select">
              <span>Screen</span>
              <select
                value={screen.id}
                onChange={(event) => setScreenId(event.target.value)}
                aria-label="Screen"
                data-testid="run-card-size-screen"
              >
                {SCREENS.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
                ))}
              </select>
            </label>
            <p className="tileset-catalog-note">
              The panel is the <strong>real</strong> screen at live window size — opening it crafts a Run onto that
              state. Every control drives it; defaults are what ships.
            </p>
            <div data-testid="run-card-size-size-control">
              <SliderRow
                label={<>Card size · {sizing.size}% of the room</>}
                value={sizing.size}
                set={(size) => update({ size })}
                {...RUN_CARD_ROW_SIZING_LIMITS.size}
                dflt={baseline.size}
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
            <div data-testid="run-card-size-max-width-control">
              <SliderRow
                label={<>Ceiling · never wider than {sizing.maxWidth}px</>}
                value={sizing.maxWidth}
                set={(maxWidth) => update({ maxWidth })}
                {...RUN_CARD_ROW_SIZING_LIMITS.maxWidth}
                nudge={10}
                dflt={baseline.maxWidth}
              />
            </div>
            <button
              type="button"
              className="tileset-view-action"
              data-testid="run-card-size-save"
              disabled={busy || sameRunCardRowSizing(sizing, baseline)}
              onClick={() => { void save(); }}
            >
              {busy ? 'Saving…' : 'Save runtime defaults'}
            </button>
            <button type="button" className="tileset-view-action" disabled={sameRunCardRowSizing(sizing, baseline)} onClick={resetAll}>Reset all</button>
            <button type="button" className="tileset-view-action" onClick={() => { void copy(); }}>Copy sizing JSON</button>

            {/* Life on the table. The cards drift and give off a little light so the screen reads
                as goods worth taking rather than three thumbnails — the same treatment the
                lipsana on the Conflict mat already carry, scaled for a much larger object. */}
            <h3 className="tileset-catalog-note">Life on the table</h3>
            <label className="tileset-catalog-zoom">
              <span>Drift character</span>
              <div className="pages-ctl-row">
                <ChoiceGroup
                  ariaLabel="Drift character"
                  value={life.stepped ? 'stepped' : 'smooth'}
                  options={[
                    { value: 'smooth', label: 'Smooth' },
                    { value: 'stepped', label: 'Stepped' },
                  ]}
                  onChange={(value) => tuneLife({ stepped: value === 'stepped' })}
                />
                {ctlReset(() => tuneLife({ stepped: RUN_CARD_LIFE_COMMITTED.stepped }))}
              </div>
            </label>
            <SliderRow
              label={<>Drift rise <strong data-testid="run-card-life-rise-value">{life.rise}px</strong></>}
              value={life.rise}
              set={(value) => tuneLife({ rise: Math.round(value) })}
              {...RUN_CARD_LIFE_LIMITS.rise}
              dflt={RUN_CARD_LIFE_COMMITTED.rise}
            />
            <SliderRow
              label={<>Drift period <strong data-testid="run-card-life-period-value">{life.period.toFixed(1)}s</strong></>}
              value={life.period}
              set={(value) => tuneLife({ period: value })}
              {...RUN_CARD_LIFE_LIMITS.period}
              dflt={RUN_CARD_LIFE_COMMITTED.period}
            />
            <SliderRow
              label={<>Glow <strong data-testid="run-card-life-glow-value">{life.glow.toFixed(2)}×</strong></>}
              value={life.glow}
              set={(value) => tuneLife({ glow: value })}
              {...RUN_CARD_LIFE_LIMITS.glow}
              dflt={RUN_CARD_LIFE_COMMITTED.glow}
            />
            <SliderRow
              label={<>Glow breath <strong data-testid="run-card-life-pulse-value">{life.pulse.toFixed(2)}×</strong> — 0 holds one steady light</>}
              value={life.pulse}
              set={(value) => tuneLife({ pulse: value })}
              {...RUN_CARD_LIFE_LIMITS.pulse}
              dflt={RUN_CARD_LIFE_COMMITTED.pulse}
            />
            <SliderRow
              label={<>Hover raise <strong data-testid="run-card-life-hover-raise-value">{life.hoverRaise}px</strong></>}
              value={life.hoverRaise}
              set={(value) => tuneLife({ hoverRaise: Math.round(value) })}
              {...RUN_CARD_LIFE_LIMITS.hoverRaise}
              dflt={RUN_CARD_LIFE_COMMITTED.hoverRaise}
            />
            <SliderRow
              label={<>Hover flare <strong data-testid="run-card-life-hover-flare-value">{life.hoverFlare.toFixed(2)}×</strong></>}
              value={life.hoverFlare}
              set={(value) => tuneLife({ hoverFlare: value })}
              {...RUN_CARD_LIFE_LIMITS.hoverFlare}
              dflt={RUN_CARD_LIFE_COMMITTED.hoverFlare}
            />
            <SliderRow
              label={<>Hover lift shadow <strong data-testid="run-card-life-lift-value">{life.hoverLift.toFixed(2)}×</strong></>}
              value={life.hoverLift}
              set={(value) => tuneLife({ hoverLift: value })}
              {...RUN_CARD_LIFE_LIMITS.hoverLift}
              dflt={RUN_CARD_LIFE_COMMITTED.hoverLift}
            />
            <p className="tileset-catalog-note">
              Hover a card in the panel to see the settle, the raise and the flare. The drift and
              the light are Git-owned constants, so Copy hands over the block to paste into
              <code> runCardLife.ts</code> and <code> style.css</code>.
            </p>
            <button
              type="button"
              className="tileset-view-action"
              data-testid="run-card-life-reset"
              disabled={sameRunCardLife(life, RUN_CARD_LIFE_COMMITTED)}
              onClick={() => { setLife({ ...RUN_CARD_LIFE_COMMITTED }); setStatus('Life reset to what the Run ships.'); }}
            >
              Reset life
            </button>
            <button type="button" className="tileset-view-action" onClick={() => { void copyLife(); }}>Copy card-life CSS</button>
          </div>
          <dl data-testid="run-card-size-readout">
            <div>
              <dt>Printing</dt>
              <dd>{printed ? `${printed.cardWidth}px × ${printed.cardHeight}px` : 'reading the screen…'}</dd>
            </div>
            <div>
              <dt>Row</dt>
              <dd>{printed ? `${screen.cards * printed.cardWidth + (screen.cards - 1) * sizing.gap}px wide` : '—'}</dd>
            </div>
            <div><dt>Bound by</dt><dd>{printed?.boundBy || '—'}</dd></div>
          </dl>
          <p role="status">{status}</p>
        </section>
      </aside>
    </>
  );
}
