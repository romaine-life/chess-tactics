import {
  applyPropSeats,
  type PropSeatMap,
} from '../core/props';

// Explicit synthetic renderer initialization. These values exercise the seat
// schema and code-owned base identities; they are not imported production data.
export const TEST_PROP_SEATS: PropSeatMap = {
  oak: { anchorX: 96, anchorY: 255, scale: 1, w: 2, h: 2, default: true },
  cottage: { anchorX: 91, anchorY: 110, scale: 0.62, w: 2, h: 2 },
  cabin: { anchorX: 118, anchorY: 107, scale: 0.35, w: 1, h: 1 },
  lodge: { anchorX: 103, anchorY: 126, scale: 1, w: 2, h: 2 },
  rock: { anchorX: 20, anchorY: 44, scale: 1, w: 1, h: 1 },
  fieldstone: { anchorX: 25, anchorY: 46, scale: 1, w: 1, h: 1 },
  'cottage-test-small': {
    base: 'cottage',
    label: 'Synthetic 1x1 cottage',
    anchorX: 91,
    anchorY: 110,
    scale: 0.42,
    w: 1,
    h: 1,
  },
};

export function applyTestPropSeats(): void {
  applyPropSeats(structuredClone(TEST_PROP_SEATS));
}
