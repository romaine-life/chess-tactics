import { useMemo, useState, type ReactElement } from 'react';
import { familyLabels, type LiveUnitCatalog, type PieceId } from './unitCatalog';
import { publishUnitScale } from '../net/unitAssets';
import {
  UNIT_SIZE_DEFAULT,
  UNIT_SIZE_IMAGE_MAX_H,
  UNIT_SIZE_MAX,
  UNIT_SIZE_MIN,
  UNIT_SIZE_PIECES,
  resetUnitSize,
  setUnitSizePercent,
  unitSizeHandoffSpec,
  useUnitSizeDraft,
} from './unitSizeTuning';

export function UnitSizeControls({
  catalog = null,
  focusFamily,
  onCatalogChange,
}: {
  catalog?: LiveUnitCatalog | null;
  focusFamily?: PieceId;
  onCatalogChange?: (catalog: LiveUnitCatalog) => void;
}): ReactElement {
  const draft = useUnitSizeDraft();
  const [copyState, setCopyState] = useState('');
  const [publishState, setPublishState] = useState('');
  const spec = useMemo(() => unitSizeHandoffSpec(draft), [draft, catalog?.revision]);
  const visiblePieces = useMemo(
    () => focusFamily
      ? [focusFamily, ...UNIT_SIZE_PIECES.filter((piece) => piece !== focusFamily)]
      : UNIT_SIZE_PIECES,
    [focusFamily],
  );
  const changedPieces = catalog
    ? UNIT_SIZE_PIECES.filter((piece) => catalog.families.find((family) => family.family === piece)?.displayScalePercent !== draft[piece])
    : [];

  const copySpec = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(spec);
      setCopyState('Copied');
      window.setTimeout(() => setCopyState(''), 1200);
    } catch {
      setCopyState('Select text');
      window.setTimeout(() => setCopyState(''), 1600);
    }
  };

  const publishSizes = async (): Promise<void> => {
    if (!catalog || !changedPieces.length || publishState === 'Publishing') return;
    setPublishState('Publishing');
    try {
      let next = catalog;
      for (const piece of changedPieces) {
        const family = next.families.find((entry) => entry.family === piece);
        if (!family || family.displayScalePercent === draft[piece]) continue;
        next = await publishUnitScale(piece, draft[piece], family.rowRevision);
      }
      onCatalogChange?.(next);
      setPublishState('Published');
      window.setTimeout(() => setPublishState(''), 1400);
    } catch {
      setPublishState('Publish failed');
      window.setTimeout(() => setPublishState(''), 2200);
    }
  };

  return (
    <section className="unit-size-controls" aria-label="Unit size tuning">
      <div className="unit-size-controls-head">
        <strong>Unit Size</strong>
        <span className="unit-size-controls-actions">
          {catalog ? (
            <button type="button" onClick={() => void publishSizes()} disabled={!changedPieces.length || publishState === 'Publishing'}>
              {publishState || 'Publish sizes'}
            </button>
          ) : null}
          <button type="button" onClick={() => resetUnitSize()} title="Reset every unit size">Reset all</button>
        </span>
      </div>
      <div className="unit-size-list">
        {visiblePieces.map((piece) => {
          const value = draft[piece] ?? UNIT_SIZE_DEFAULT;
          const imageH = Math.round(UNIT_SIZE_IMAGE_MAX_H * (value / 100));
          return (
            <label key={piece} className="unit-size-row">
              <span>
                <strong>{familyLabels[piece]}</strong>
                <em>{value}% · {imageH}px</em>
              </span>
              <input
                type="number"
                min={UNIT_SIZE_MIN}
                max={UNIT_SIZE_MAX}
                step={1}
                value={value}
                onChange={(event) => setUnitSizePercent(piece, Number(event.target.value))}
                aria-label={`${familyLabels[piece]} size percent`}
              />
              <button
                type="button"
                className="pages-mini-reset unit-size-reset"
                title={`Reset ${familyLabels[piece]} size`}
                aria-label={`Reset ${familyLabels[piece]} size`}
                onClick={() => resetUnitSize(piece)}
              >
                ↺
              </button>
              <input
                type="range"
                min={UNIT_SIZE_MIN}
                max={UNIT_SIZE_MAX}
                step={1}
                value={value}
                onChange={(event) => setUnitSizePercent(piece, Number(event.target.value))}
                aria-label={`${familyLabels[piece]} size`}
              />
            </label>
          );
        })}
      </div>
      <div className="unit-size-spec">
        <div className="unit-size-spec-head">
          <strong>Handoff</strong>
          <button type="button" onClick={() => void copySpec()}>{copyState || 'Copy'}</button>
        </div>
        <textarea readOnly value={spec} aria-label="Unit size handoff spec" />
      </div>
    </section>
  );
}
