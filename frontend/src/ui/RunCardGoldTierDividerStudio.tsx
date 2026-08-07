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
import { StudioCatalogCard } from './studio/StudioCatalogCard';

const DRAFT_KEY = 'studio.runCardGoldTierDivider.coinDraft.v1';

function sameTuning(left: RunCardGoldTierCoinTuning, right: RunCardGoldTierCoinTuning): boolean {
  return left.size === right.size && left.x === right.x && left.y === right.y;
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
  const [baseline, setBaseline] = useState<RunCardGoldTierCoinTuning>({ ...RUN_CARD_GOLD_TIER_COIN_DEFAULTS });
  const [tuning, setTuning] = useState<RunCardGoldTierCoinTuning>(readDraft);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Reset uses the Git-owned geometry currently rendered by Cards and Chartulary.');

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(tuning));
  }, [tuning]);

  const update = useCallback((patch: Partial<RunCardGoldTierCoinTuning>): void => {
    setTuning((current) => ({ ...current, ...patch }));
    setStatus('Draft changed. Save defaults to hand these exact pixels to the runtime.');
  }, []);

  const resetAll = (): void => {
    setTuning({ ...baseline });
    setStatus('Draft reset to the runtime defaults.');
  };

  const save = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setStatus('Saving runtime defaults…');
    try {
      const saved = await saveRunCardGoldTierDividerGeometry({ coin: tuning });
      const next = { ...saved.coin };
      setBaseline(next);
      setTuning(next);
      setStatus('Saved. Cards and Chartulary now use these defaults; Vite will refresh the imported geometry.');
    } catch (reason) {
      setStatus(reason instanceof Error ? `Save failed: ${reason.message}` : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(JSON.stringify({ coin: tuning }, null, 2));
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
            <button
              type="button"
              className="tileset-view-action"
              data-testid="run-card-gold-tier-divider-save"
              disabled={busy || sameTuning(tuning, baseline)}
              onClick={() => { void save(); }}
            >
              {busy ? 'Saving…' : 'Save runtime defaults'}
            </button>
            <button type="button" className="tileset-view-action" disabled={sameTuning(tuning, baseline)} onClick={resetAll}>Reset all</button>
            <button type="button" className="tileset-view-action" onClick={() => { void copy(); }}>Copy tuning JSON</button>
          </div>
          <dl>
            <div><dt>Size</dt><dd>{tuning.size}px</dd></div>
            <div><dt>X</dt><dd>{tuning.x}px from divider left</dd></div>
            <div><dt>Y</dt><dd>{tuning.y}px from divider top</dd></div>
          </dl>
          <p role="status">{status}</p>
        </section>
      </aside>
    </>
  );
}
