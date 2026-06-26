import type { CSSProperties, ReactElement } from 'react';
import type { DoodadAsset } from './doodadCatalog';

// Self-contained isometric preview: one tile, its contact diamond, and a unit standing
// *in* the doodad — back half behind it, front half over its shins. This is the clean
// isolated view (formerly a mockup HTML) promoted to a real Studio component.

const STEP_X = 48;
const STEP_Y = (96 * Math.tan((30 * Math.PI) / 180)) / 2; // 27.7128
const TILE_AX = 48;
const TILE_AY = 69; // contact pixel in the 96x180 frame
const OX = 130;
const OY = 150; // cell point on the stage

const layer = (z: number): CSSProperties => ({
  position: 'absolute',
  left: OX - TILE_AX,
  top: OY - TILE_AY,
  width: 96,
  height: 180,
  zIndex: z,
});

export function DoodadLabView({
  doodad,
  tileSrc = '/assets/tiles/textured/dirt-a.png',
  unitSrc = '/assets/units/queen/crimson/south.png',
}: {
  doodad: DoodadAsset;
  tileSrc?: string;
  unitSrc?: string;
}): ReactElement {
  const diamond = [
    [OX, OY - STEP_Y],
    [OX + STEP_X, OY],
    [OX, OY + STEP_Y],
    [OX - STEP_X, OY],
  ]
    .map((point) => point.join(','))
    .join(' ');

  return (
    <div data-testid="doodad-lab-view" style={{ position: 'relative', width: 260, height: 260, margin: '0 auto' }}>
      <img src={tileSrc} alt="" draggable={false} style={layer(100)} />
      <svg
        width={260}
        height={260}
        style={{ position: 'absolute', left: 0, top: 0, zIndex: 150, overflow: 'visible', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <polygon points={diamond} fill="rgba(80,150,255,.10)" stroke="#6fb3ff" strokeWidth={1.2} strokeDasharray="4 3" />
      </svg>
      <img src={doodad.back} alt="" data-doodad="back" draggable={false} style={layer(199)} />
      <span
        style={{
          position: 'absolute',
          left: OX,
          top: OY,
          width: 72,
          height: 86,
          transform: 'translate(-50%, -78%)',
          display: 'grid',
          placeItems: 'center',
          zIndex: 200,
          pointerEvents: 'none',
        }}
      >
        <img
          src={unitSrc}
          alt=""
          draggable={false}
          style={{ maxHeight: 92, maxWidth: 78, objectFit: 'contain', filter: 'drop-shadow(0 4px 3px rgba(0,0,0,.4))' }}
        />
      </span>
      <img src={doodad.front} alt="" data-doodad="front" draggable={false} style={layer(201)} />
    </div>
  );
}
