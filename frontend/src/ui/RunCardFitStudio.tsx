import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { RUN_CARD_BY_ID, RUN_CARD_DECK, type RunCardDefinition } from '../run/model';
import { RunCard } from './RunCard';
import { RUN_CARD_FORMATION_ISO_TILE } from './RunCardFace';
import {
  RUN_CARD_FORMATION_FIT_COMMITTED,
  RUN_CARD_FORMATION_FIT_LIMITS,
  runCardFormationFitCss,
  runCardFormationFitStyle,
  sameRunCardFormationFit,
  type RunCardFormationFitTuning,
} from './runCardFormationFit';
import { SliderRow } from './dressing/SliderRow';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

// Studio → Card Fit. The card's formation diagram is now drawn to the room the contents panel
// leaves rather than at one fixed size, and the only judgement left in that is how far a small
// footprint may grow before it stops reading as the same board the busy cards draw.
//
// That is not answerable one card at a time: the cap is a single number governing every shape the
// deck deals, and it is right only if it is right for the lone seat AND for the four-seat run
// beside it. Every distinct footprint is mounted here, at the size the Run prints a card, under
// one live cap.

const DRAFT_KEY = 'studio.runCardFormationFit.draft.v1';

/** The width a Sectio offer prints at — the size these cards are actually dealt. */
export const RUN_CARD_FIT_PRINTED_WIDTH = 196;

type FootprintSpecimen = Readonly<{
  shape: string;
  cells: number;
  card: RunCardDefinition;
}>;

/** A footprint's shape, blind to where on the deployment band it was authored. */
function footprintShape(cells: readonly Readonly<{ x: number; y: number }>[]): string {
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  return cells.map((cell) => `${cell.x - minX}${cell.y - minY}`).sort().join(' ');
}

/**
 * One dealt card per footprint the deck can offer. Named cards are preferred as the representative
 * — they are the ones with a name a reader recognises — but every shape appears whether or not one
 * of them happens to carry a name.
 */
function footprintSpecimens(): readonly FootprintSpecimen[] {
  const named = new Set(Object.values(RUN_CARD_BY_ID)
    .filter((card) => !/^f-/.test(card.id))
    .map((card) => card.id));
  const chosen = new Map<string, FootprintSpecimen>();
  for (const card of RUN_CARD_DECK) {
    const cells = card.formation ?? [];
    if (!cells.length) continue;
    const shape = footprintShape(cells);
    const current = chosen.get(shape);
    if (!current || (!named.has(current.card.id) && named.has(card.id))) {
      chosen.set(shape, { shape, cells: cells.length, card });
    }
  }
  return [...chosen.values()].sort((left, right) => (
    left.cells - right.cells || left.shape.localeCompare(right.shape)
  ));
}

const SPECIMENS = footprintSpecimens();

/** The same ladder, once more with a seat spent — the vacant mark is drawn at the fitted size too. */
const SPENT_SPECIMEN = SPECIMENS.find((specimen) => specimen.cells === 3) ?? null;

function readDraft(): RunCardFormationFitTuning {
  if (typeof window === 'undefined') return { ...RUN_CARD_FORMATION_FIT_COMMITTED };
  try {
    const value = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null') as Partial<RunCardFormationFitTuning> | null;
    const limits = RUN_CARD_FORMATION_FIT_LIMITS.maxScale;
    if (
      value && typeof value.maxScale === 'number'
      && value.maxScale >= limits.min && value.maxScale <= limits.max
    ) return { maxScale: value.maxScale };
  } catch {
    // A malformed old draft is disposable; the committed constant remains authoritative.
  }
  return { ...RUN_CARD_FORMATION_FIT_COMMITTED };
}

export function RunCardFitCatalog({ onOpen }: { onOpen: () => void }): ReactElement {
  return (
    <div
      className="tileset-studio-grid pages-grid run-card-fit-catalog"
      aria-label="Card fit instruments"
      data-testid="run-card-fit-catalog"
    >
      <StudioCatalogCard
        title="Card Fit"
        badge="Every dealt footprint"
        selected
        onSelect={onOpen}
        onOpen={onOpen}
        titleText="Tune how far a small formation grows into the room its card leaves"
        imageClassName="run-card-fit-catalog-image"
        imageStyle={{ minHeight: 152 }}
        media={(
          <span className="run-card-fit-catalog-specimen" style={{ inlineSize: 132 }}>
            <RunCard card={RUN_CARD_BY_ID.p} mode="reference" />
            <RunCard card={RUN_CARD_BY_ID['f-01112131-kppp']} mode="reference" />
          </span>
        )}
        textExtra={<span>One seat against four, on the one cap that governs both.</span>}
      />
    </div>
  );
}

export function RunCardFitViewer({
  header,
  viewerZoom,
}: {
  header: ReactNode;
  viewerZoom: number;
}): ReactElement {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<RunCardFormationFitTuning>(readDraft);
  const [showBox, setShowBox] = useState(true);
  const [printed, setPrinted] = useState<Readonly<Record<string, number>>>({});
  const [status, setStatus] = useState(
    'Every dealt footprint, at the size the Run prints a card. The cap is the only number in the fit.',
  );
  const cardWidth = Math.round(RUN_CARD_FIT_PRINTED_WIDTH * viewerZoom);

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(fit));
  }, [fit]);

  // What each card actually printed, read back off the live screen rather than recomputed here:
  // the scale reported is the scale the card drew.
  const measure = useCallback((): void => {
    const grid = gridRef.current;
    if (!grid) return;
    const next: Record<string, number> = {};
    for (const specimen of grid.querySelectorAll<HTMLElement>('[data-footprint-shape]')) {
      const face = specimen.querySelector('.run-card-prototype');
      const seat = specimen.querySelector('.run-card-formation-square');
      if (!face || !seat) continue;
      const faceWidth = face.getBoundingClientRect().width;
      const committed = faceWidth * RUN_CARD_FORMATION_ISO_TILE.width / 100;
      if (committed <= 0) continue;
      next[specimen.dataset.footprintShape ?? ''] = seat.getBoundingClientRect().width / committed;
    }
    setPrinted(next);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(measure);
    const timer = window.setInterval(measure, 400);
    return () => { cancelAnimationFrame(frame); window.clearInterval(timer); };
  }, [measure, fit, cardWidth]);

  const grown = Object.values(printed).filter((scale) => scale > 1.005).length;
  const capped = Object.values(printed).filter((scale) => scale >= fit.maxScale - .005).length;

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(runCardFormationFitCss(fit));
    setStatus('Copied the cap as CSS. Commit it in runCardFormationFit.ts and style.css.');
  };

  return (
    <>
      <section className="run-card-fit-viewer" data-testid="run-card-fit-viewer">
        <p className="run-card-fit-note">
          The space is the contents panel less its padding and two lines of flavour — the whole
          deck&apos;s longest — so it is the same space on every card, whatever that card&apos;s
          prose runs to. It is drawn <span className="run-card-fit-key is-space">dashed</span>;
          the drawing fitted into it is drawn <span className="run-card-fit-key is-drawing">solid</span>.
          Every footprint is scaled until it touches that space on its tightest axis and centred in
          it — one seat or four, no special case. The panel is short rather than narrow, so at the
          dealt size the height is what binds, and the cap is the rail that would catch a small
          footprint if it did not.
        </p>
        <div
          className="run-card-fit-grid"
          data-formation-box={showBox ? 'on' : 'off'}
          ref={gridRef}
          style={{
            ...runCardFormationFitStyle(fit),
            '--run-card-fit-face-width': `${cardWidth}px`,
          } as CSSProperties}
        >
          {SPECIMENS.map((specimen) => (
            <figure className="run-card-fit-specimen" data-footprint-shape={specimen.shape} key={specimen.shape}>
              <span className="run-card-fit-face">
                <RunCard card={specimen.card} mode="reference" />
              </span>
              <figcaption>
                <strong>{specimen.cells === 1 ? '1 seat' : `${specimen.cells} seats`}</strong>
                <span>
                  {printed[specimen.shape]
                    ? `${printed[specimen.shape].toFixed(2)}× the committed size`
                    : 'measuring…'}
                </span>
              </figcaption>
            </figure>
          ))}
          {/* A card whose unit has been spent keeps its whole footprint and marks the seat vacant.
              The mark is part of the drawing, so it has to be judged at the fitted size too. */}
          {SPENT_SPECIMEN ? (
            <figure className="run-card-fit-specimen" data-footprint-shape={`${SPENT_SPECIMEN.shape} spent`}>
              <span className="run-card-fit-face">
                <RunCard card={SPENT_SPECIMEN.card} mode="reference" emptyPieceIndices={[0]} />
              </span>
              <figcaption>
                <strong>{SPENT_SPECIMEN.cells} seats, one spent</strong>
                <span>
                  {printed[`${SPENT_SPECIMEN.shape} spent`]
                    ? `${printed[`${SPENT_SPECIMEN.shape} spent`].toFixed(2)}× the committed size`
                    : 'measuring…'}
                </span>
              </figcaption>
            </figure>
          ) : null}
        </div>
      </section>
      <aside className="tileset-view-controls" aria-label="Card fit controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          {header}
          <div className="tileset-control-stack">
            <p className="tileset-catalog-note">
              Cards print at {cardWidth}px
              {viewerZoom === 1 ? ' — the size the Run deals them.' : `, against ${RUN_CARD_FIT_PRINTED_WIDTH}px dealt. Zoom drives it.`}
            </p>
            <div data-testid="run-card-fit-max-scale-control">
              <SliderRow
                label={<>Largest a diagram may print <strong data-testid="run-card-fit-max-scale-value">{fit.maxScale.toFixed(2)}×</strong></>}
                value={fit.maxScale}
                set={(maxScale) => {
                  setFit({ maxScale });
                  setStatus('Cap changed. Copy the CSS and commit the number in runCardFormationFit.ts.');
                }}
                {...RUN_CARD_FORMATION_FIT_LIMITS.maxScale}
                dflt={RUN_CARD_FORMATION_FIT_COMMITTED.maxScale}
              />
            </div>
            <p className="tileset-catalog-note">
              1× is exactly the diagram the card used to print at every size. Held by the cap counts
              the cards the cap is actually deciding; at the dealt size that is normally none,
              because the panel&apos;s height runs out first.
            </p>
            <button
              type="button"
              className="tileset-view-action"
              data-testid="run-card-fit-show-box"
              aria-pressed={showBox}
              onClick={() => setShowBox((current) => !current)}
            >
              {showBox ? 'Hide the space' : 'Show the space'}
            </button>
            <button
              type="button"
              className="tileset-view-action"
              data-testid="run-card-fit-reset"
              disabled={sameRunCardFormationFit(fit, RUN_CARD_FORMATION_FIT_COMMITTED)}
              onClick={() => {
                setFit({ ...RUN_CARD_FORMATION_FIT_COMMITTED });
                setStatus('Cap reset to what the Run ships.');
              }}
            >
              Reset cap
            </button>
            <button type="button" className="tileset-view-action" onClick={() => { void copy(); }}>Copy cap CSS</button>
          </div>
          <dl data-testid="run-card-fit-readout">
            <div><dt>Footprints</dt><dd>{SPECIMENS.length}</dd></div>
            <div><dt>Larger than committed</dt><dd>{grown}</dd></div>
            <div><dt>Held by the cap</dt><dd>{capped}</dd></div>
          </dl>
          <p role="status">{status}</p>
        </section>
      </aside>
    </>
  );
}
