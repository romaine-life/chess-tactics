import { boardLabCellPosition } from './boardProjection';

// THE single way a doodad renders on a board — shared by the game board (SkirmishBoard)
// and the Studio editor (StudioEditableBoard) so a doodad seats identically in both.
// A doodad is a back/front sprite pair, contact-anchored at the tile point and z-sorted to
// BRACKET the unit on its cell (back behind it, front over its shins) — the unit renders at
// z = (x+y)+20000, so back sits one below and front one above. Do not re-implement per board.

export type Doodad = { x: number; y: number; type: string };

export function DoodadSprite({ doodad }: { doodad: Doodad }) {
  const { left, top, zIndex } = boardLabCellPosition(doodad);
  const base = zIndex + 20000; // share the unit depth band so cross-cell sorting still holds
  const common = {
    position: 'absolute' as const,
    left,
    top,
    width: 96,
    height: 180,
    transform: 'translate(-50%, -38.333%)', // seat the (48,69) contact pixel on the cell centre
    pointerEvents: 'none' as const,
  };
  const src = (half: 'back' | 'front') => `/assets/doodads/${doodad.type}/${half}.png`;
  return (
    <>
      <img src={src('back')} alt="" data-doodad="back" draggable={false} style={{ ...common, zIndex: base - 1 }} />
      <img src={src('front')} alt="" data-doodad="front" draggable={false} style={{ ...common, zIndex: base + 1 }} />
    </>
  );
}
