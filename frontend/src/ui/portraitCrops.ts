import { drawableAssets, type DrawableAsset } from '@chess-tactics/board-render';

export const PORTRAIT_PIECES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const;
export type PortraitPiece = (typeof PORTRAIT_PIECES)[number];
export type PortraitCrop = { cx: number; cy: number; s: number };

function cropFromAsset(asset: DrawableAsset): PortraitCrop {
  const raw = asset.behavior.crop;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`unit portrait ${asset.id} has no database-owned crop`);
  const { cx, cy, s } = raw as Record<string, unknown>;
  if (![cx, cy, s].every((value) => typeof value === 'number' && Number.isFinite(value)) || (s as number) <= 0) {
    throw new Error(`unit portrait ${asset.id} has an invalid database-owned crop`);
  }
  return { cx: cx as number, cy: cy as number, s: s as number };
}

export function installedPortraitAssets(): Record<PortraitPiece, DrawableAsset> {
  const result = {} as Record<PortraitPiece, DrawableAsset>;
  for (const piece of PORTRAIT_PIECES) {
    const matches = drawableAssets('unit-portrait').filter((asset) => asset.behavior.piece === piece);
    if (matches.length !== 1) throw new Error(`drawable catalog requires exactly one unit portrait for ${piece}; found ${matches.length}`);
    cropFromAsset(matches[0]);
    result[piece] = matches[0];
  }
  return result;
}

export function installedPortraitCrops(): Record<PortraitPiece, PortraitCrop> {
  const assets = installedPortraitAssets();
  return Object.fromEntries(PORTRAIT_PIECES.map((piece) => [piece, cropFromAsset(assets[piece])])) as Record<PortraitPiece, PortraitCrop>;
}
