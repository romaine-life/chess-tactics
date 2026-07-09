import type { CSSProperties } from 'react';

export * from '@chess-tactics/board-render/ui/unitCatalog';

export type UnitPlacementStyle = CSSProperties & {
  '--tile-anchor-x': string;
  '--tile-anchor-y': string;
  '--unit-anchor-x': string;
  '--unit-anchor-y': string;
  '--unit-size': string;
  '--unit-footprint-size': string;
  '--stack-shift-y': string;
};
