import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { familyLabels, type LiveUnitCatalog, type UnitAsset } from './unitCatalog';
import { publishUnitScale } from '../net/unitAssets';
import {
  UNIT_SIZE_DEFAULT,
  UNIT_SIZE_IMAGE_MAX_H,
  candidateReviewFamilyScale,
  resetUnitSize,
  setUnitSizePercent,
  setUnitScalePercentForAsset,
  unitScaleBoundsForAsset,
  unitScalePercentForAsset,
  unitSizeHandoffSpec,
  useUnitSizeDraft,
} from './unitSizeTuning';

export function UnitSizeControls({
  catalog = null,
  unit,
  onCatalogChange,
}: {
  catalog?: LiveUnitCatalog | null;
  unit: UnitAsset;
  onCatalogChange?: (catalog: LiveUnitCatalog) => void;
}): ReactElement {
  const piece = unit.family;
  const draft = useUnitSizeDraft();
  const initializedCandidates = useRef(new Set<string>());
  const [copyState, setCopyState] = useState('');
  const [publishState, setPublishState] = useState('');
  const spec = useMemo(() => unitSizeHandoffSpec(piece, draft, unit), [draft, catalog?.revision, piece, unit]);
  const family = catalog?.families.find((entry) => entry.family === piece);
  const changed = Boolean(family && family.displayScalePercent !== draft[piece]);
  const label = familyLabels[piece];
  const value = unitScalePercentForAsset(unit, draft) ?? UNIT_SIZE_DEFAULT;
  const bounds = unitScaleBoundsForAsset(unit);
  const imageH = Math.round(UNIT_SIZE_IMAGE_MAX_H * ((draft[piece] ?? UNIT_SIZE_DEFAULT) / 100));

  useEffect(() => {
    setCopyState('');
    setPublishState('');
  }, [piece, unit.id]);

  useEffect(() => {
    const familyScale = candidateReviewFamilyScale(unit);
    if (familyScale === null || initializedCandidates.current.has(unit.id)) return;
    initializedCandidates.current.add(unit.id);
    if (draft[piece] !== familyScale) setUnitSizePercent(piece, familyScale);
  }, [piece, unit.id, unit.nativeScalePercent, unit.speculative, unit.archived]);

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

  const publishSize = async (): Promise<void> => {
    if (!catalog || !family || !changed || publishState === 'Publishing') return;
    setPublishState('Publishing');
    try {
      const next = await publishUnitScale(piece, draft[piece], family.rowRevision);
      onCatalogChange?.(next);
      setPublishState('Published');
      window.setTimeout(() => setPublishState(''), 1400);
    } catch {
      setPublishState('Publish failed');
      window.setTimeout(() => setPublishState(''), 2200);
    }
  };

  return (
    <section className="unit-size-controls" aria-label={`${label} size tuning`}>
      <div className="unit-size-controls-head">
        <strong>{label} Size</strong>
        <span className="unit-size-controls-actions">
          {catalog ? (
            <button type="button" onClick={() => void publishSize()} disabled={!changed || publishState === 'Publishing'}>
              {publishState || 'Publish'}
            </button>
          ) : null}
          <button
            type="button"
            className="pages-mini-reset unit-size-reset"
            onClick={() => resetUnitSize(piece)}
            title={`Reset ${label} size`}
            aria-label={`Reset ${label} size`}
          >
            ↺
          </button>
        </span>
      </div>
      <div className="unit-size-list">
        <label className="unit-size-row is-single">
          <span>
            <strong>Scale</strong>
            <em>{value}% · {imageH}px</em>
          </span>
          <input
            type="number"
            min={bounds.min}
            max={bounds.max}
            step={1}
            value={value}
            onChange={(event) => setUnitScalePercentForAsset(unit, Number(event.target.value))}
            aria-label={`${label} size percent`}
          />
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={1}
            value={value}
            onChange={(event) => setUnitScalePercentForAsset(unit, Number(event.target.value))}
            aria-label={`${label} size`}
          />
        </label>
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
