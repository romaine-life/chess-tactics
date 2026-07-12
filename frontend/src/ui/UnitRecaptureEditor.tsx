import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { UNIT_PALETTE_LABELS, UNIT_PALETTES, type UnitPalette } from '../core/pieces';
import { createUnitAsset, fetchAdminUnitCatalog, updateUnitAsset, uploadUnitSprite } from '../net/unitAssets';
import {
  unitDeliveryRasterForAsset,
  useUnitSizeDraft,
} from './unitSizeTuning';
import {
  familyLabels,
  rookDirectionLabel,
  rookDirections,
  type Direction,
  type LiveUnitCatalog,
  type LiveUnitCatalogAsset,
  type UnitAsset,
} from './unitCatalog';
import { recaptureUnitRaster, unitContainRect, type UnitRaster } from './unitRasterResize';

type DirectionRasters = Record<Direction, UnitRaster>;
type PaletteRasters = Record<UnitPalette, DirectionRasters>;

const RECAPTURE_VERSION = 2;
const RECAPTURE_METHOD = 'Accepted sprite smooth recapture';

export type UnitArtPreview = {
  width: number;
  height: number;
  sprites: Partial<Record<UnitPalette, Partial<Record<Direction, string>>>>;
};

const rasterToCanvas = (raster: UnitRaster): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas unavailable');
  context.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
  return canvas;
};

const rasterToDataUrl = (raster: UnitRaster): string => rasterToCanvas(raster).toDataURL('image/png');

const rasterToBlob = (raster: UnitRaster): Promise<Blob> => new Promise((resolve, reject) => {
  rasterToCanvas(raster).toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('PNG encoding failed'));
  }, 'image/png');
});

async function loadRaster(url: string, width: number, height: number): Promise<UnitRaster> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`accepted sprite returned ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    if (bitmap.width !== width || bitmap.height !== height) {
      throw new Error(`accepted sprite is ${bitmap.width}x${bitmap.height}, expected ${width}x${height}`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2D canvas unavailable');
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, width, height);
    return { width, height, data: new Uint8ClampedArray(image.data) };
  } finally {
    bitmap.close();
  }
}

function RasterCanvas({ raster, label }: { raster: UnitRaster; label: string }): ReactElement {
  const ref = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;
    canvas.width = raster.width;
    canvas.height = raster.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
  }, [raster]);
  return <canvas ref={ref} width={raster.width} height={raster.height} aria-label={label} />;
}

function acceptedAsset(catalog: LiveUnitCatalog, selectedUnit: UnitAsset): LiveUnitCatalogAsset | undefined {
  return catalog.assets.find((asset) => asset.family === selectedUnit.family && asset.accepted);
}

function currentRecaptureCandidate(asset: LiveUnitCatalogAsset | undefined): boolean {
  if (!asset || asset.method !== RECAPTURE_METHOD) return false;
  try {
    const provenance = JSON.parse(asset.notes) as { pipeline?: string; version?: number; resampler?: string };
    return provenance.pipeline === 'accepted-sprite-recapture'
      && provenance.version === RECAPTURE_VERSION
      && provenance.resampler === 'premultiplied-area-contain';
  } catch {
    return false;
  }
}

export function UnitRecaptureEditor({
  catalog,
  selectedUnit,
  onCatalogChange,
  onSelectUnit,
  onPreviewChange,
}: {
  catalog: LiveUnitCatalog;
  selectedUnit: UnitAsset;
  onCatalogChange: (catalog: LiveUnitCatalog) => void;
  onSelectUnit: (unitId: string) => void;
  onPreviewChange: (preview: UnitArtPreview | null) => void;
}): ReactElement {
  const sizes = useUnitSizeDraft();
  const { width: targetWidth, height: targetHeight } = unitDeliveryRasterForAsset(selectedUnit, sizes);
  const source = acceptedAsset(catalog, selectedUnit);
  const selectedCandidate = selectedUnit.catalogAssetId
    ? catalog.assets.find((asset) => asset.id === selectedUnit.catalogAssetId && !asset.accepted)
    : undefined;
  const candidateAtTarget = Boolean(
    selectedCandidate?.complete
    && selectedCandidate.status === 'candidate'
    && selectedCandidate.footprint.sourceCanvasWidth === targetWidth
    && selectedCandidate.footprint.sourceCanvasHeight === targetHeight,
  );
  const candidateIsCurrent = candidateAtTarget && currentRecaptureCandidate(selectedCandidate);
  const [palette, setPalette] = useState<UnitPalette>('navy-blue');
  const [recaptured, setRecaptured] = useState<PaletteRasters | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setRecaptured(null);
    setStatus('');
    onPreviewChange(null);
  }, [source?.id, targetWidth, targetHeight, onPreviewChange]);

  useEffect(() => () => onPreviewChange(null), [onPreviewChange]);

  const recapture = async (): Promise<void> => {
    if (!source || busy) return;
    setBusy(true);
    setStatus('Loading accepted sprites');
    try {
      let completed = 0;
      const entries = await Promise.all(UNIT_PALETTES.map(async (unitPalette) => {
        const directions = await Promise.all(rookDirections.map(async (direction) => {
          const sprite = source.sprites[unitPalette]?.[direction];
          if (!sprite) throw new Error(`accepted ${unitPalette}/${direction} sprite is missing`);
          const raw = await loadRaster(sprite.url, source.footprint.sourceCanvasWidth, source.footprint.sourceCanvasHeight);
          completed += 1;
          setStatus(`Recapturing ${completed}/48`);
          return [direction, recaptureUnitRaster(raw, targetWidth, targetHeight)] as const;
        }));
        return [unitPalette, Object.fromEntries(directions) as DirectionRasters] as const;
      }));
      setRecaptured(Object.fromEntries(entries) as PaletteRasters);
      const fit = unitContainRect(
        source.footprint.sourceCanvasWidth,
        source.footprint.sourceCanvasHeight,
        targetWidth,
        targetHeight,
      );
      setStatus(`Accepted ${source.footprint.sourceCanvasWidth}x${source.footprint.sourceCanvasHeight} -> ${fit.width}x${fit.height} in ${targetWidth}x${targetHeight}`);
    } catch (error) {
      setRecaptured(null);
      setStatus(error instanceof Error ? error.message : 'Recapture failed');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!recaptured) {
      onPreviewChange(null);
      return;
    }
    const sprites = Object.fromEntries(UNIT_PALETTES.map((unitPalette) => [
      unitPalette,
      Object.fromEntries(rookDirections.map((direction) => [
        direction,
        rasterToDataUrl(recaptured[unitPalette][direction]),
      ])),
    ])) as UnitArtPreview['sprites'];
    onPreviewChange({ width: targetWidth, height: targetHeight, sprites });
  }, [onPreviewChange, recaptured, targetHeight, targetWidth]);

  const sourceLabel = useMemo(() => source
    ? `${source.footprint.sourceCanvasWidth}x${source.footprint.sourceCanvasHeight} accepted`
    : 'Accepted source missing', [source]);

  const saveCandidate = async (): Promise<void> => {
    if (!source || !recaptured || busy) return;
    setBusy(true);
    setStatus(candidateAtTarget ? 'Updating candidate' : 'Creating candidate');
    try {
      const fit = unitContainRect(
        source.footprint.sourceCanvasWidth,
        source.footprint.sourceCanvasHeight,
        targetWidth,
        targetHeight,
      );
      const provenance = {
        pipeline: 'accepted-sprite-recapture',
        version: RECAPTURE_VERSION,
        sourceAssetId: source.id,
        sourceCatalogRevision: catalog.revision,
        sourceRaster: {
          width: source.footprint.sourceCanvasWidth,
          height: source.footprint.sourceCanvasHeight,
        },
        deliveryRaster: { width: targetWidth, height: targetHeight },
        containedRaster: fit,
        spatialResampling: true,
        aspectRatioPreserved: true,
        alphaMode: 'premultiplied',
        resampler: 'premultiplied-area-contain',
      };
      const metadata = {
        family: selectedUnit.family,
        label: `${familyLabels[selectedUnit.family]} recaptured ${targetWidth}x${targetHeight}`,
        method: RECAPTURE_METHOD,
        notes: JSON.stringify(provenance),
        footprintShape: source.footprint.shape,
        sourceCanvasWidth: targetWidth,
        sourceCanvasHeight: targetHeight,
        sourceFootprintPx: Math.max(
          1,
          source.footprint.sourceFootprintPx * fit.width / source.footprint.sourceCanvasWidth,
        ),
        anchorX: source.anchor.x,
        anchorY: source.anchor.y,
      };
      let assetId: string;
      let revision: number;
      if (candidateAtTarget && selectedCandidate) {
        const updated = await updateUnitAsset(selectedCandidate.id, metadata, selectedCandidate.rowRevision);
        assetId = selectedCandidate.id;
        revision = updated.assets.find((asset) => asset.id === assetId)?.rowRevision ?? selectedCandidate.rowRevision + 1;
        onCatalogChange(updated);
      } else {
        const created = await createUnitAsset(metadata);
        assetId = created.assetId;
        revision = created.catalog.assets.find((asset) => asset.id === assetId)?.rowRevision ?? 0;
      }
      let uploaded = 0;
      for (const unitPalette of UNIT_PALETTES) {
        for (const direction of rookDirections) {
          setStatus(`Uploading ${uploaded + 1}/48`);
          const result = await uploadUnitSprite(
            assetId,
            unitPalette,
            direction,
            await rasterToBlob(recaptured[unitPalette][direction]),
            revision,
          );
          revision = result.rowRevision;
          uploaded += 1;
        }
      }
      const next = await fetchAdminUnitCatalog();
      onCatalogChange(next);
      onSelectUnit(`candidate:${assetId}`);
      setStatus(candidateAtTarget ? 'Calibration candidate updated' : 'Calibration candidate ready');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Candidate upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="unit-recapture-editor">
      <div className="unit-recapture-toolbar" role="toolbar" aria-label="Accepted unit recapture">
        <button type="button" onClick={() => void recapture()} disabled={busy || !source}>Recapture accepted</button>
        <select value={palette} onChange={(event) => setPalette(event.target.value as UnitPalette)} aria-label="Preview palette">
          {UNIT_PALETTES.map((id) => <option key={id} value={id}>{UNIT_PALETTE_LABELS[id]}</option>)}
        </select>
        <strong>{targetWidth}x{targetHeight}</strong>
      </div>

      {recaptured ? (
        <div className="unit-recapture-rotation" aria-label="Eight-direction recapture preview">
          {rookDirections.map((direction) => (
            <figure key={direction}>
              <RasterCanvas raster={recaptured[palette][direction]} label={`${rookDirectionLabel[direction]} recaptured ${selectedUnit.family}`} />
              <figcaption>{rookDirectionLabel[direction]}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      <dl className="unit-recapture-summary">
        <div><dt>Source</dt><dd>{sourceLabel}</dd></div>
        <div><dt>Output</dt><dd>{targetWidth}x{targetHeight} calibration PNG</dd></div>
        <div><dt>Sampling</dt><dd>Smooth contain</dd></div>
      </dl>

      <p className="unit-asset-production-gate">
        Calibration only · this resampled candidate cannot be accepted. Regenerate the approved dimensions natively in Blender (ADR-0076).
      </p>

      <div className="unit-recapture-actions">
        <button
          type="button"
          onClick={() => void saveCandidate()}
          disabled={busy || !recaptured || candidateIsCurrent}
        >
          {candidateIsCurrent ? 'Calibration ready' : candidateAtTarget ? 'Update calibration' : 'Create calibration candidate'}
        </button>
      </div>
      {status ? <output className="unit-asset-status">{status}</output> : null}
    </div>
  );
}
