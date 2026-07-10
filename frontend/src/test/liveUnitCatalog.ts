import { UNIT_PALETTES } from '../core/pieces';
import {
  activeUnitFamilies,
  rookDirections,
  type LiveUnitCatalog,
  type PieceId,
} from '../ui/unitCatalog';

export function testLiveUnitCatalog({
  revision = 1,
  sha256 = 'a'.repeat(64),
  scales = {},
}: {
  revision?: number;
  sha256?: string;
  scales?: Partial<Record<PieceId, number>>;
} = {}): LiveUnitCatalog {
  const url = `/api/unit-sprites/${sha256}.png`;
  const sprites = Object.fromEntries(UNIT_PALETTES.map((palette) => [
    palette,
    Object.fromEntries(rookDirections.map((direction) => [direction, {
      url,
      sha256,
      width: 512,
      height: 512,
      byteLength: 1024,
    }])),
  ]));

  return {
    schemaVersion: 1,
    revision,
    families: activeUnitFamilies.map((family) => ({
      family,
      acceptedAssetId: `asset-${family}`,
      displayScalePercent: scales[family] ?? 100,
      rowRevision: revision,
    })),
    assets: activeUnitFamilies.map((family) => ({
      id: `asset-${family}`,
      family,
      label: `${family} test art`,
      method: 'Test',
      notes: '',
      status: 'candidate',
      accepted: true,
      footprint: {
        shape: family === 'rook' ? 'square' : 'circle',
        sourceCanvasWidth: 512,
        sourceCanvasHeight: 512,
        sourceFootprintPx: 150,
      },
      anchor: { x: 0.5, y: 0.8 },
      rowRevision: revision,
      sprites,
      spriteCount: UNIT_PALETTES.length * rookDirections.length,
      complete: true,
    })),
  };
}
