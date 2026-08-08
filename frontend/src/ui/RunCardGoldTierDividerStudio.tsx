import { useCallback, useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { saveRunCardGoldTierDividerGeometry } from '../net/runCardGoldTierDividerGeometry';
import { SliderRow } from './dressing/SliderRow';
import {
  RUN_CARD_GOLD_TIER_COIN_DEFAULTS,
  RUN_CARD_GOLD_TIER_COIN_LIMITS,
  RunCardGoldTierDivider,
  useRunCardGoldTierDividerSource,
  type RunCardGoldTierCoinTuning,
} from './shared/RunCardGoldTierDivider';
import {
  RUN_CARD_COIN_MARK_FILL,
  RUN_CARD_COIN_MARK_LIMITS,
  useRunCardCostCrownCandidates,
} from './shared/runCardCostCrown';
import { RunCard } from './RunCard';
import { RUN_STARTER_CARD_BY_ID } from '../run/model';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

const DRAFT_KEY = 'studio.runCardGoldTierDivider.coinDraft.v1';
const MARK_DRAFT_KEY = 'studio.runCardGoldTierDivider.markDraft.v1';

function sameTuning(left: RunCardGoldTierCoinTuning, right: RunCardGoldTierCoinTuning): boolean {
  return left.size === right.size && left.x === right.x && left.y === right.y;
}

function readMarkDraft(): number {
  if (typeof window === 'undefined') return RUN_CARD_COIN_MARK_FILL;
  const value = Number(window.localStorage.getItem(MARK_DRAFT_KEY));
  return Number.isInteger(value)
    && value >= RUN_CARD_COIN_MARK_LIMITS.fill.min
    && value <= RUN_CARD_COIN_MARK_LIMITS.fill.max
    ? value
    : RUN_CARD_COIN_MARK_FILL;
}

function readDraft(): RunCardGoldTierCoinTuning {
  if (typeof window === 'undefined') return { ...RUN_CARD_GOLD_TIER_COIN_DEFAULTS };
  try {
    const value = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null') as Partial<RunCardGoldTierCoinTuning> | null;
    if (
      value
      && Number.isInteger(value.size)
      && Number.isInteger(value.x)
      && Number.isInteger(value.y)
      && value.size! >= RUN_CARD_GOLD_TIER_COIN_LIMITS.size.min
      && value.size! <= RUN_CARD_GOLD_TIER_COIN_LIMITS.size.max
      && value.x! >= RUN_CARD_GOLD_TIER_COIN_LIMITS.x.min
      && value.x! <= RUN_CARD_GOLD_TIER_COIN_LIMITS.x.max
      && value.y! >= RUN_CARD_GOLD_TIER_COIN_LIMITS.y.min
      && value.y! <= RUN_CARD_GOLD_TIER_COIN_LIMITS.y.max
    ) return { size: value.size!, x: value.x!, y: value.y! };
  } catch {
    // A malformed old draft is disposable; the Git-owned baseline remains authoritative.
  }
  return { ...RUN_CARD_GOLD_TIER_COIN_DEFAULTS };
}

export function RunCardGoldTierDividerCatalog({ onOpen }: { onOpen: () => void }): ReactElement {
  const source = useRunCardGoldTierDividerSource();
  return (
    <div
      className="tileset-studio-grid pages-grid run-card-gold-tier-divider-catalog"
      aria-label="Card gold divider instruments"
      data-testid="run-card-gold-tier-divider-catalog"
    >
      <StudioCatalogCard
        title="Gold Tier Divider"
        badge="Live coin fitting"
        selected
        onSelect={onOpen}
        onOpen={onOpen}
        titleText="Open the shared Cards and Chartulary gold-tier divider fitting instrument"
        imageClassName="run-card-gold-tier-divider-catalog-image"
        media={(
          <span className="run-card-gold-tier-divider-catalog-specimen">
            <RunCardGoldTierDivider value={10} source={source} />
          </span>
        )}
        textExtra={<span>Tune the real runtime coin inside the generated rail.</span>}
      />
    </div>
  );
}

export function RunCardGoldTierDividerViewer({
  header,
  viewerZoom,
}: {
  header: ReactNode;
  viewerZoom: number;
}): ReactElement {
  const source = useRunCardGoldTierDividerSource();
  const marks = useRunCardCostCrownCandidates();
  const [baseline, setBaseline] = useState<RunCardGoldTierCoinTuning>({ ...RUN_CARD_GOLD_TIER_COIN_DEFAULTS });
  const [tuning, setTuning] = useState<RunCardGoldTierCoinTuning>(readDraft);
  const [markBaseline, setMarkBaseline] = useState(RUN_CARD_COIN_MARK_FILL);
  const [markFill, setMarkFill] = useState(readMarkDraft);
  const [markVersionId, setMarkVersionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Reset uses the Git-owned geometry currently rendered by Cards and Chartulary.');

  // Nothing is selected until the catalog answers, so the instrument opens on whatever the
  // runtime actually installed rather than on an arbitrary candidate.
  const selectedMark = marks.candidates.find((candidate) => candidate.versionId === markVersionId)
    ?? marks.candidates.find((candidate) => candidate.installed)
    ?? marks.candidates[0]
    ?? null;
  const markUrl = selectedMark?.url ?? null;

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(tuning));
  }, [tuning]);

  useEffect(() => {
    window.localStorage.setItem(MARK_DRAFT_KEY, String(markFill));
  }, [markFill]);

  const update = useCallback((patch: Partial<RunCardGoldTierCoinTuning>): void => {
    setTuning((current) => ({ ...current, ...patch }));
    setStatus('Draft changed. Save defaults to hand these exact pixels to the runtime.');
  }, []);

  const dirty = !sameTuning(tuning, baseline) || markFill !== markBaseline;

  const resetAll = (): void => {
    setTuning({ ...baseline });
    setMarkFill(markBaseline);
    setStatus('Draft reset to the runtime defaults.');
  };

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setStatus('Saving runtime defaults…');
    try {
      const saved = await saveRunCardGoldTierDividerGeometry({ coin: tuning, mark: { fill: markFill } });
      const next = { ...saved.coin };
      setBaseline(next);
      setTuning(next);
      setMarkBaseline(saved.mark.fill);
      setMarkFill(saved.mark.fill);
      setStatus('Saved. Cards and Chartulary now use these defaults; Vite will refresh the imported geometry.');
    } catch (reason) {
      setStatus(reason instanceof Error ? `Save failed: ${reason.message}` : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(JSON.stringify({ coin: tuning, mark: { fill: markFill } }, null, 2));
    setStatus('Copied the current geometry JSON.');
  };

  const stageStyle = { '--run-card-gold-tier-studio-zoom': viewerZoom } as CSSProperties;
  return (
    <>
      <section
        className="tileset-studio-main run-card-gold-tier-divider-studio"
        aria-label="Card gold divider fitting stage"
        data-run-card-gold-tier-divider-studio=""
        data-testid="run-card-gold-tier-divider-studio"
        style={stageStyle}
      >
        <div className="run-card-gold-tier-divider-studio-stage">
          <div className="run-card-gold-tier-divider-studio-specimens">
            {[360, 520, 720].map((width, index) => (
              <figure key={width}>
                <figcaption>{width}px row</figcaption>
                <div className="run-card-gold-tier-divider-studio-row" style={{ inlineSize: `${width}px` }}>
                  <RunCardGoldTierDivider value={[1, 2, 10][index]} source={source} coinTuning={tuning} />
                </div>
              </figure>
            ))}
          </div>
          <figure className="run-card-gold-tier-divider-studio-magnifier">
            <figcaption>Cradle inspection · 4× pixels</figcaption>
            <div className="run-card-gold-tier-divider-studio-crop">
              <div className="run-card-gold-tier-divider-studio-crop-content">
                <RunCardGoldTierDivider value={1} source={source} coinTuning={tuning} />
              </div>
            </div>
          </figure>
          {/* Every generated mark on the two coins it is actually struck on, at the sizes they
              print at. Judging one candidate per address made the coins impossible to compare
              and made the fill a number tuned outside the owner's hands (ADR-0530). */}
          <figure className="run-card-coin-mark-study" data-testid="run-card-coin-mark-study">
            <figcaption>
              Struck mark · {marks.status === 'loading' ? 'reading candidates…' : `${marks.candidates.length} candidate${marks.candidates.length === 1 ? '' : 's'}`}
              {marks.message ? ` · ${marks.message}` : ''}
            </figcaption>
            <div className="tileset-studio-grid pages-grid run-card-coin-mark-study-row">
              {marks.candidates.map((candidate) => (
                <StudioCatalogCard
                  key={candidate.versionId}
                  title={candidate.label}
                  badge={candidate.installed ? 'Installed' : 'Candidate'}
                  selected={candidate.versionId === selectedMark?.versionId}
                  onSelect={() => setMarkVersionId(candidate.versionId)}
                  titleText={`Strike ${candidate.label} on the coin`}
                  // The card's thumbnail slot sizes every img to an iso tile, which is right for
                  // a tile and wrong for live components. These specimens are real coins, so they
                  // take the text slot and keep their own layout.
                  showImage={false}
                  textExtra={(
                    <span className="run-card-coin-mark-option-specimen" data-testid="run-card-coin-mark-option">
                      <RunCardGoldTierDivider
                        value="starter"
                        source={source}
                        coinTuning={tuning}
                        crownUrl={candidate.url}
                        markFill={markFill}
                      />
                      <span className="run-card-coin-mark-option-card">
                        <RunCard
                          card={RUN_STARTER_CARD_BY_ID['his-grace']}
                          mode="reference"
                          crownUrl={candidate.url}
                          markFill={markFill}
                        />
                      </span>
                    </span>
                  )}
                />
              ))}
            </div>
          </figure>
        </div>
      </section>
      <aside className="tileset-view-controls" aria-label="Card gold divider controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          {header}
          <div className="tileset-control-stack">
            <div data-testid="run-card-gold-tier-divider-size-control">
              <SliderRow
                label={<>Size · {tuning.size}px</>}
                value={tuning.size}
                set={(size) => update({ size })}
                {...RUN_CARD_GOLD_TIER_COIN_LIMITS.size}
                dflt={baseline.size}
              />
            </div>
            <div data-testid="run-card-gold-tier-divider-x-control">
              <SliderRow
                label={<>Horizontal · {tuning.x}px</>}
                value={tuning.x}
                set={(x) => update({ x })}
                {...RUN_CARD_GOLD_TIER_COIN_LIMITS.x}
                dflt={baseline.x}
              />
            </div>
            <div data-testid="run-card-gold-tier-divider-y-control">
              <SliderRow
                label={<>Vertical · {tuning.y}px</>}
                value={tuning.y}
                set={(y) => update({ y })}
                {...RUN_CARD_GOLD_TIER_COIN_LIMITS.y}
                dflt={baseline.y}
              />
            </div>
            <div data-testid="run-card-coin-mark-fill-control">
              <SliderRow
                label={<>Struck mark · {markFill}% of coin</>}
                value={markFill}
                set={(fill) => {
                  setMarkFill(fill);
                  setStatus('Draft changed. Save defaults to hand these exact pixels to the runtime.');
                }}
                {...RUN_CARD_COIN_MARK_LIMITS.fill}
                dflt={markBaseline}
              />
            </div>
            <button
              type="button"
              className="tileset-view-action"
              data-testid="run-card-gold-tier-divider-save"
              disabled={busy || !dirty}
              onClick={() => { void save(); }}
            >
              {busy ? 'Saving…' : 'Save runtime defaults'}
            </button>
            <button type="button" className="tileset-view-action" disabled={!dirty} onClick={resetAll}>Reset all</button>
            <button type="button" className="tileset-view-action" onClick={() => { void copy(); }}>Copy tuning JSON</button>
          </div>
          <dl>
            <div><dt>Size</dt><dd>{tuning.size}px</dd></div>
            <div><dt>X</dt><dd>{tuning.x}px from divider left</dd></div>
            <div><dt>Y</dt><dd>{tuning.y}px from divider top</dd></div>
            <div><dt>Mark</dt><dd>{markFill}% of the drawn coin</dd></div>
            <div><dt>Showing</dt><dd>{selectedMark ? `${selectedMark.label}${selectedMark.installed ? ' (installed)' : ' (candidate)'}` : 'no mark uploaded'}</dd></div>
          </dl>
          {markUrl && !selectedMark?.installed ? (
            <p>This mark is a candidate. Accept it in Live Media to install it.</p>
          ) : null}
          <p role="status">{status}</p>
        </section>
      </aside>
    </>
  );
}
