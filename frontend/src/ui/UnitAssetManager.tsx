import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import {
  acceptUnitAsset,
  archiveUnitAsset,
  createUnitAsset,
  fetchAdminUnitCatalog,
  updateUnitAsset,
  uploadUnitSprite,
  type UnitAssetMetadataInput,
} from '../net/unitAssets';
import { UNIT_PALETTE_LABELS, UNIT_PALETTES, type UnitPalette } from '../core/pieces';
import {
  familyLabels,
  rookDirections,
  type Direction,
  type LiveUnitCatalog,
  type LiveUnitCatalogAsset,
  type UnitAsset,
} from './unitCatalog';
import { UnitRecaptureEditor, type UnitArtPreview } from './UnitRecaptureEditor';

type MetadataDraft = {
  label: string;
  method: string;
  notes: string;
  footprintShape: 'circle' | 'square';
  sourceCanvasWidth: number;
  sourceCanvasHeight: number;
  sourceFootprintPx: number;
  anchorXPercent: number;
  anchorYPercent: number;
};

const draftFromAsset = (asset: LiveUnitCatalogAsset): MetadataDraft => ({
  label: asset.label,
  method: asset.method,
  notes: asset.notes,
  footprintShape: asset.footprint.shape,
  sourceCanvasWidth: asset.footprint.sourceCanvasWidth,
  sourceCanvasHeight: asset.footprint.sourceCanvasHeight,
  sourceFootprintPx: asset.footprint.sourceFootprintPx,
  anchorXPercent: Math.round(asset.anchor.x * 100000) / 1000,
  anchorYPercent: Math.round(asset.anchor.y * 100000) / 1000,
});

const directionFromFile = (file: File): Direction | null => {
  const name = file.name.toLowerCase().replace(/\.png$/i, '');
  return rookDirections.includes(name as Direction) ? name as Direction : null;
};

const paletteFromFile = (file: File, fallback: UnitPalette): UnitPalette => {
  const parts = String(file.webkitRelativePath || file.name).toLowerCase().split(/[\\/]/);
  return UNIT_PALETTES.find((palette) => parts.includes(palette)) ?? fallback;
};

export function UnitAssetManager({
  catalog,
  selectedUnit,
  onCatalogChange,
  onSelectUnit,
  onArtPreview,
}: {
  catalog: LiveUnitCatalog;
  selectedUnit: UnitAsset;
  onCatalogChange: (catalog: LiveUnitCatalog) => void;
  onSelectUnit: (unitId: string) => void;
  onArtPreview: (preview: UnitArtPreview | null) => void;
}): ReactElement {
  const selectedAsset = selectedUnit.catalogAssetId
    ? catalog.assets.find((asset) => asset.id === selectedUnit.catalogAssetId)
    : undefined;
  const candidate = selectedAsset && !selectedAsset.accepted && selectedAsset.status !== 'archived' ? selectedAsset : null;
  const accepted = catalog.assets.find((asset) => asset.family === selectedUnit.family && asset.accepted);
  const source = selectedAsset ?? accepted;
  const [draft, setDraft] = useState<MetadataDraft | null>(() => candidate ? draftFromAsset(candidate) : null);
  const [palette, setPalette] = useState<UnitPalette>('navy-blue');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [archivedId, setArchivedId] = useState('');
  const recaptureAvailable = import.meta.env.DEV;
  const [editorMode, setEditorMode] = useState<'asset' | 'recapture'>(() => recaptureAvailable ? 'recapture' : 'asset');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const archived = useMemo(
    () => catalog.assets.filter((asset) => asset.status === 'archived' && asset.family === selectedUnit.family),
    [catalog, selectedUnit.family],
  );

  useEffect(() => {
    setDraft(candidate ? draftFromAsset(candidate) : null);
  }, [candidate?.id, candidate?.rowRevision]);

  useEffect(() => {
    if (archivedId && archived.some((asset) => asset.id === archivedId)) return;
    setArchivedId(archived[0]?.id ?? '');
  }, [archived, archivedId]);

  const commitCatalog = (next: LiveUnitCatalog): void => {
    onCatalogChange(next);
  };

  const createCandidate = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setStatus('Creating');
    try {
      const base = source;
      if (!base) throw new Error(`accepted live asset is missing for ${selectedUnit.family}`);
      const input: UnitAssetMetadataInput = {
        family: selectedUnit.family,
        label: `${familyLabels[selectedUnit.family]} candidate`,
        method: 'Generated',
        notes: '',
        footprintShape: base.footprint.shape,
        sourceCanvasWidth: base.footprint.sourceCanvasWidth,
        sourceCanvasHeight: base.footprint.sourceCanvasHeight,
        sourceFootprintPx: base.footprint.sourceFootprintPx,
        anchorX: base.anchor.x,
        anchorY: base.anchor.y,
      };
      const created = await createUnitAsset(input);
      commitCatalog(created.catalog);
      onSelectUnit(`candidate:${created.assetId}`);
      setStatus('Created');
    } catch {
      setStatus('Create failed');
    } finally {
      setBusy(false);
    }
  };

  const saveMetadata = async (): Promise<void> => {
    if (!candidate || !draft || busy) return;
    setBusy(true);
    setStatus('Saving');
    try {
      const next = await updateUnitAsset(candidate.id, {
        family: candidate.family,
        label: draft.label,
        method: draft.method,
        notes: draft.notes,
        footprintShape: draft.footprintShape,
        sourceCanvasWidth: draft.sourceCanvasWidth,
        sourceCanvasHeight: draft.sourceCanvasHeight,
        sourceFootprintPx: draft.sourceFootprintPx,
        anchorX: draft.anchorXPercent / 100,
        anchorY: draft.anchorYPercent / 100,
      }, candidate.rowRevision);
      commitCatalog(next);
      setStatus('Saved');
    } catch {
      setStatus('Save failed');
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(event.target.files ?? []);
    if (!candidate || busy || !files.length) return;
    const frames = files
      .map((file) => ({ file, direction: directionFromFile(file), palette: paletteFromFile(file, palette) }))
      .filter((entry): entry is { file: File; direction: Direction; palette: UnitPalette } => Boolean(entry.direction));
    if (!frames.length) {
      setStatus('Use direction filenames');
      event.target.value = '';
      return;
    }
    setBusy(true);
    let revision = candidate.rowRevision;
    try {
      for (const [index, frame] of frames.entries()) {
        setStatus(`Uploading ${index + 1}/${frames.length}`);
        const result = await uploadUnitSprite(candidate.id, frame.palette, frame.direction, frame.file, revision);
        revision = result.rowRevision;
      }
      const next = await fetchAdminUnitCatalog();
      commitCatalog(next);
      setStatus(`Uploaded ${frames.length}`);
    } catch {
      setStatus('Upload failed');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const acceptCandidate = async (asset: LiveUnitCatalogAsset): Promise<void> => {
    if (busy || !asset.complete) return;
    setBusy(true);
    setStatus('Accepting');
    try {
      const next = await acceptUnitAsset(asset.id, asset.rowRevision);
      commitCatalog(next);
      onSelectUnit(asset.family);
      setStatus('Accepted');
    } catch {
      setStatus('Accept failed');
    } finally {
      setBusy(false);
    }
  };

  const archiveCandidate = async (): Promise<void> => {
    if (!candidate || busy) return;
    setBusy(true);
    setStatus('Archiving');
    try {
      const next = await archiveUnitAsset(candidate.id, candidate.rowRevision);
      commitCatalog(next);
      onSelectUnit(candidate.family);
      setStatus('Archived');
    } catch {
      setStatus('Archive failed');
    } finally {
      setBusy(false);
    }
  };

  const archivedSelection = archived.find((asset) => asset.id === archivedId);

  return (
    <section className="unit-asset-manager" aria-label="Unit asset manager">
      <div className="unit-size-controls-head">
        <strong>Unit Art</strong>
        <span className="unit-asset-modes" role="tablist" aria-label="Unit Art editor">
          <button type="button" role="tab" aria-selected={editorMode === 'asset'} className={editorMode === 'asset' ? 'is-active' : ''} onClick={() => setEditorMode('asset')}>Asset</button>
          {recaptureAvailable ? <button type="button" role="tab" aria-selected={editorMode === 'recapture'} className={editorMode === 'recapture' ? 'is-active' : ''} onClick={() => setEditorMode('recapture')}>Recapture</button> : null}
        </span>
      </div>

      {recaptureAvailable && editorMode === 'recapture' ? (
        <UnitRecaptureEditor
          catalog={catalog}
          selectedUnit={selectedUnit}
          onCatalogChange={onCatalogChange}
          onSelectUnit={onSelectUnit}
          onPreviewChange={onArtPreview}
        />
      ) : candidate && draft ? (
        <div className="unit-asset-editor">
          <div className="unit-asset-fields">
            <label><span>Label</span><input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
            <label><span>Method</span><input value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })} /></label>
            <label className="is-wide"><span>Notes</span><input value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
            <label><span>Footprint</span><select value={draft.footprintShape} onChange={(event) => setDraft({ ...draft, footprintShape: event.target.value as 'circle' | 'square' })}><option value="circle">Circle</option><option value="square">Square</option></select></label>
            <label><span>Contact px</span><input type="number" min={1} max={4096} value={draft.sourceFootprintPx} onChange={(event) => setDraft({ ...draft, sourceFootprintPx: Number(event.target.value) })} /></label>
            <label><span>Canvas W</span><input type="number" min={1} max={4096} value={draft.sourceCanvasWidth} onChange={(event) => setDraft({ ...draft, sourceCanvasWidth: Number(event.target.value) })} /></label>
            <label><span>Canvas H</span><input type="number" min={1} max={4096} value={draft.sourceCanvasHeight} onChange={(event) => setDraft({ ...draft, sourceCanvasHeight: Number(event.target.value) })} /></label>
            <label><span>Anchor X %</span><input type="number" min={0} max={100} step={0.001} value={draft.anchorXPercent} onChange={(event) => setDraft({ ...draft, anchorXPercent: Number(event.target.value) })} /></label>
            <label><span>Anchor Y %</span><input type="number" min={0} max={100} step={0.001} value={draft.anchorYPercent} onChange={(event) => setDraft({ ...draft, anchorYPercent: Number(event.target.value) })} /></label>
          </div>
          <div className="unit-asset-actions">
            <button type="button" onClick={() => void createCandidate()} disabled={busy}>New candidate</button>
            <button type="button" onClick={() => void saveMetadata()} disabled={busy}>Save metadata</button>
            <select value={palette} onChange={(event) => setPalette(event.target.value as UnitPalette)} aria-label="Upload palette">
              {UNIT_PALETTES.map((id) => <option key={id} value={id}>{UNIT_PALETTE_LABELS[id]}</option>)}
            </select>
            <label className="unit-asset-upload">
              <span>Upload PNGs</span>
              <input ref={fileInputRef} type="file" accept="image/png,.png" multiple onChange={(event) => void uploadFiles(event)} disabled={busy} />
            </label>
            <button type="button" onClick={() => void acceptCandidate(candidate)} disabled={busy || !candidate.complete}>Accept</button>
            <button type="button" onClick={() => void archiveCandidate()} disabled={busy}>Archive</button>
          </div>
          <div className="unit-asset-completeness">
            {UNIT_PALETTES.map((id) => {
              const count = rookDirections.filter((direction) => candidate.sprites[id]?.[direction]).length;
              return <span key={id} className={count === 8 ? 'is-complete' : ''}>{UNIT_PALETTE_LABELS[id]} {count}/8</span>;
            })}
          </div>
        </div>
      ) : (
        <div className="unit-asset-current">
          <span>{familyLabels[selectedUnit.family]}</span>
          <strong>{accepted?.label ?? 'Committed fallback'}</strong>
          <button type="button" onClick={() => void createCandidate()} disabled={busy}>New candidate</button>
        </div>
      )}

      {editorMode === 'asset' && archived.length ? (
        <div className="unit-asset-archive-row">
          <select value={archivedId} onChange={(event) => setArchivedId(event.target.value)} aria-label="Archived unit art">
            {archived.map((asset) => <option key={asset.id} value={asset.id}>{familyLabels[asset.family]} · {asset.label}</option>)}
          </select>
          <button type="button" disabled={busy || !archivedSelection?.complete} onClick={() => archivedSelection && void acceptCandidate(archivedSelection)}>Restore accepted</button>
        </div>
      ) : null}
      {editorMode === 'asset' && status ? <output className="unit-asset-status">{status}</output> : null}
    </section>
  );
}
