import {
  flatContactSplitPercent,
  propHalfSrc,
  propZBracket,
  seatTransformPercent,
  structureSeatPoint,
  structureSourceHalfSrc,
  structureSourceSprite,
  structureSourceSplitMode,
  type StructureSplitMode,
} from '@chess-tactics/board-render/render/structureGeometry';
import { propDef, type PlacedProp, type PropDef, type StructurePart } from '../core/props';
import { doodadAsset } from '../ui/doodadCatalog';

export {
  flatContactClipRects,
  flatContactSplitPercent,
  propHalfSrc,
  propZBracket,
  seatTransformPercent,
  structureSeatPoint,
  structureSourceHalfSrc,
  structureSourceSprite,
  structureSourceSplitMode,
  type StructureSplitMode,
} from '@chess-tactics/board-render/render/structureGeometry';

function StructurePartSprites({
  anchor,
  w,
  h,
  parts,
  attrsFor,
}: {
  anchor: { x: number; y: number };
  w: number;
  h: number;
  parts: readonly StructurePart[];
  attrsFor: (half: 'back' | 'front', index: number) => Record<string, string>;
}) {
  return (
    <>
      {parts.map((part, index) => {
        const sprite = structureSourceSprite(part.source);
        return (
          <StructureSprite
            key={`${part.source.kind}-${part.source.id}-${index}`}
            anchor={anchor}
            w={w}
            h={h}
            sprite={{ w: sprite.w, h: sprite.h, anchorX: part.anchorX, anchorY: part.anchorY, scale: part.scale }}
            srcFor={(half) => structureSourceHalfSrc(part.source, half)}
            splitMode={structureSourceSplitMode(part.source)}
            attrsFor={(half) => attrsFor(half, index)}
          />
        );
      })}
    </>
  );
}

export function StructureSprite({
  anchor,
  w,
  h,
  sprite,
  srcFor,
  splitMode = 'authored',
  attrsFor,
}: {
  anchor: { x: number; y: number };
  w: number;
  h: number;
  sprite: { w: number; h: number; anchorX: number; anchorY: number; scale?: number };
  srcFor: (half: 'back' | 'front') => string;
  splitMode?: StructureSplitMode;
  attrsFor: (half: 'back' | 'front') => Record<string, string>;
}) {
  const { left, top } = structureSeatPoint(anchor, w, h);
  const { back: zBack, front: zFront } = propZBracket(anchor.x, anchor.y, w, h);
  const { x: translateX, y: translateY } = seatTransformPercent(sprite);
  const scale = sprite.scale ?? 1;
  const common = {
    position: 'absolute' as const,
    left,
    top,
    width: sprite.w * scale,
    height: sprite.h * scale,
    transform: `translate(${translateX}%, ${translateY}%)`,
    pointerEvents: 'none' as const,
  };
  const splitPercent = splitMode === 'flat-contact' ? flatContactSplitPercent(sprite) : null;
  const clipFor = (half: 'back' | 'front') => splitPercent == null
    ? {}
    : {
        clipPath: half === 'back'
          ? `inset(0 0 ${100 - splitPercent}% 0)`
          : `inset(${splitPercent}% 0 0 0)`,
      };
  return (
    <>
      <img src={srcFor('back')} alt="" {...attrsFor('back')} draggable={false} style={{ ...common, ...clipFor('back'), zIndex: zBack }} />
      <img src={srcFor('front')} alt="" {...attrsFor('front')} draggable={false} style={{ ...common, ...clipFor('front'), zIndex: zFront }} />
    </>
  );
}

export function PropSprite({ prop, def }: { prop: PlacedProp; def?: PropDef }) {
  const resolved = def ?? propDef(prop.propId);
  if (!resolved) return null;
  if (resolved.spriteParts?.length) {
    return (
      <StructurePartSprites
        anchor={{ x: prop.x, y: prop.y }}
        w={resolved.w}
        h={resolved.h}
        parts={resolved.spriteParts}
        attrsFor={(half, index) => ({ 'data-prop': prop.propId, 'data-half': half, 'data-part': String(index + 1) })}
      />
    );
  }
  const source = resolved.spriteSource ?? { kind: 'prop' as const, id: resolved.spriteId };
  return (
    <StructureSprite
      anchor={{ x: prop.x, y: prop.y }}
      w={resolved.w}
      h={resolved.h}
      sprite={resolved.sprite}
      srcFor={(half) => structureSourceHalfSrc(source, half)}
      splitMode={structureSourceSplitMode(source)}
      attrsFor={(half) => ({ 'data-prop': prop.propId, 'data-half': half })}
    />
  );
}

export type Doodad = { x: number; y: number; type: string };

export function DoodadSprite({ doodad }: { doodad: Doodad }) {
  const asset = doodadAsset(doodad.type);
  if (asset.parts?.length) {
    return (
      <StructurePartSprites
        anchor={{ x: doodad.x, y: doodad.y }}
        w={1}
        h={1}
        parts={asset.parts}
        attrsFor={(half, index) => ({ 'data-doodad': half, 'data-part': String(index + 1) })}
      />
    );
  }
  return (
    <StructureSprite
      anchor={{ x: doodad.x, y: doodad.y }}
      w={1}
      h={1}
      sprite={asset.sprite ?? { w: 96, h: 180, anchorX: 48, anchorY: 69 }}
      srcFor={(half) => half === 'back' ? asset.back : asset.front}
      splitMode={asset.source ? structureSourceSplitMode(asset.source) : 'authored'}
      attrsFor={(half) => ({ 'data-doodad': half })}
    />
  );
}
