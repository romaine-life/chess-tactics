/**
 * Studio → Card Pool. A parameterised re-derivation of the offer catalog, so the questions this
 * design is actually stuck on — how big is common, what does a cost band admit, what does dropping
 * rotation collapse cost — can be asked and answered live instead of one probe script at a time.
 *
 * This deliberately does NOT read `runCardRarity` or `createRunCardOffer`. The shipped rules are
 * one point in the space; the point of the studio is to stand somewhere else and look. Defaults
 * reproduce the shipped generator (4x2 grid, <=4 units, <=9 material, rotation-canonical), so a
 * fresh load lands on the live catalog and every knob moves away from a known position.
 */

export type PoolPiece = 'P' | 'N' | 'B' | 'R' | 'Q';

export const POOL_PIECES: readonly PoolPiece[] = ['P', 'N', 'B', 'R', 'Q'];

export const POOL_PIECE_NAME: Readonly<Record<PoolPiece, string>> = {
  P: 'Pawn', N: 'Knight', B: 'Bishop', R: 'Rook', Q: 'Queen',
};

export type PoolCell = Readonly<{ x: number; y: number }>;

export type PoolKnobs = Readonly<{
  /** Material per piece. Drives value, and therefore density and cost. */
  pieceValue: Readonly<Record<PoolPiece, number>>;
  /** The generator grid. The shipped generator is 4 wide by 2 deep. */
  cols: number;
  rows: number;
  /** Largest footprint the generator will emit. */
  maxCells: number;
  /** Material ceiling. The shipped generator exempts a completed Queen+Pawn pair. */
  maxValue: number;
  allowQueenPawnOverCap: boolean;
  /** Rotation-canonical identity (shipped) vs every orientation and seating distinct. */
  collapseRotation: boolean;
  /** cost = value * (density / 3) ^ densityPower * costScale, rounded to `roundTo`. */
  densityPower: number;
  costScale: number;
  roundTo: number;
  /** Two Bishops whose cells differ in colour parity — the blind-spot fix. */
  bishopPairBonus: number;
  /** Any piece defending another piece's square on the card's own geometry. */
  supportBonus: number;
  /** Pawns are directional, so pawn support is not rotation-invariant. */
  countPawnSupport: boolean;
  /** Cost bands. */
  commonMaxCost: number;
  uncommonMaxCost: number;
}>;

export const DEFAULT_POOL_KNOBS: PoolKnobs = {
  pieceValue: { P: 1, N: 3, B: 3, R: 5, Q: 9 },
  cols: 4,
  rows: 2,
  maxCells: 4,
  maxValue: 9,
  allowQueenPawnOverCap: true,
  collapseRotation: true,
  densityPower: 0.5,
  costScale: 10,
  roundTo: 5,
  bishopPairBonus: 0,
  supportBonus: 0,
  countPawnSupport: false,
  commonMaxCost: 35,
  uncommonMaxCost: 90,
};

export type PoolBand = 'common' | 'uncommon' | 'rare';

export type PoolCard = Readonly<{
  key: string;
  cells: readonly PoolCell[];
  pieces: readonly PoolPiece[];
  /** Total material. */
  value: number;
  /** Cells occupied — the board the card eats. */
  volume: number;
  /** value / volume, which is also mean piece value. */
  density: number;
  /** Price before synergy. */
  baseCost: number;
  cost: number;
  band: PoolBand;
  hasBishopPair: boolean;
  supportPairs: number;
}>;

const key = (cells: readonly PoolCell[]): string => cells.map((c) => `${c.x},${c.y}`).join(' ');

function connected(cells: readonly PoolCell[]): boolean {
  if (cells.length <= 1) return true;
  const seen = new Set([key([cells[0]])]);
  const stack: PoolCell[] = [cells[0]];
  while (stack.length > 0) {
    const cur = stack.pop() as PoolCell;
    for (const next of cells) {
      const k = key([next]);
      if (seen.has(k)) continue;
      if (Math.abs(next.x - cur.x) + Math.abs(next.y - cur.y) !== 1) continue;
      seen.add(k);
      stack.push(next);
    }
  }
  return seen.size === cells.length;
}

function normalize(cells: readonly PoolCell[]): PoolCell[] {
  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  return cells.map((c) => ({ x: c.x - minX, y: c.y - minY }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function rotate(cells: readonly PoolCell[], turns: number): PoolCell[] {
  return cells.map((c) => (
    turns === 1 ? { x: -c.y, y: c.x }
      : turns === 2 ? { x: -c.x, y: -c.y }
        : turns === 3 ? { x: c.y, y: -c.x }
          : { x: c.x, y: c.y }
  ));
}

/**
 * Identity for a placed card. With collapse on, the four quarter-turns are one card and the seat
 * assignment rides with the cell — which is why `NP` and `PN` are the same offer today. With it
 * off, every orientation and every seating is its own card, and front/back becomes a purchase.
 */
function cardIdentity(
  cells: readonly PoolCell[],
  pieces: readonly PoolPiece[],
  collapseRotation: boolean,
): string {
  const seated = (turns: number): string => {
    const rotated = rotate(cells, turns);
    const minX = Math.min(...rotated.map((c) => c.x));
    const minY = Math.min(...rotated.map((c) => c.y));
    return rotated
      .map((c, index) => ({ x: c.x - minX, y: c.y - minY, piece: pieces[index] }))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((c) => `${c.x}${c.y}${c.piece}`)
      .join('-');
  };
  if (!collapseRotation) return seated(0);
  return [0, 1, 2, 3].map(seated).sort()[0];
}

/** Footprints the generator emits: connected, size-capped, left-anchored (the shipped rule). */
export function poolFootprints(knobs: PoolKnobs): PoolCell[][] {
  const out: PoolCell[][] = [];
  const total = knobs.cols * knobs.rows;
  if (total > 20) return out;
  for (let mask = 1; mask < (1 << total); mask += 1) {
    const cells: PoolCell[] = [];
    for (let i = 0; i < total; i += 1) {
      if ((mask & (1 << i)) !== 0) cells.push({ x: i % knobs.cols, y: Math.floor(i / knobs.cols) });
    }
    if (cells.length > knobs.maxCells) continue;
    if (Math.min(...cells.map((c) => c.x)) !== 0) continue;
    if (!connected(cells)) continue;
    out.push(cells.sort((a, b) => a.x - b.x || a.y - b.y));
  }
  return out;
}

/** Does `from` attack `to` on the card's own little board, given the other pieces block lines? */
function defends(
  piece: PoolPiece,
  from: PoolCell,
  to: PoolCell,
  occupied: readonly PoolCell[],
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return false;
  if (piece === 'N') return (Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1);
  // y = 0 is the enemy edge, so a Pawn covers the two squares ahead of it diagonally.
  if (piece === 'P') return dy === -1 && Math.abs(dx) === 1;
  const straight = dx === 0 || dy === 0;
  const diagonal = Math.abs(dx) === Math.abs(dy);
  if (piece === 'R' && !straight) return false;
  if (piece === 'B' && !diagonal) return false;
  if (piece === 'Q' && !straight && !diagonal) return false;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  for (let step = 1; step < steps; step += 1) {
    const bx = from.x + sx * step;
    const by = from.y + sy * step;
    if (occupied.some((c) => c.x === bx && c.y === by)) return false;
  }
  return true;
}

/** Pairs where one piece covers another's square. Stability, and it is why connected Rooks read. */
export function countSupportPairs(
  cells: readonly PoolCell[],
  pieces: readonly PoolPiece[],
  countPawnSupport: boolean,
): number {
  let pairs = 0;
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = 0; j < cells.length; j += 1) {
      if (i === j) continue;
      if (!countPawnSupport && pieces[i] === 'P') continue;
      if (defends(pieces[i], cells[i], cells[j], cells)) pairs += 1;
    }
  }
  return pairs;
}

/**
 * Two Bishops on opposite colours. The Bishop is the only piece with a permanent reachability
 * restriction, so it is the only one whose pair removes a blind spot rather than doubling reach —
 * which is why nothing else earns this. Colour parity survives translation and rotation.
 */
export function hasOppositeColourBishopPair(
  cells: readonly PoolCell[],
  pieces: readonly PoolPiece[],
): boolean {
  const parities = cells
    .map((cell, index) => ({ cell, piece: pieces[index] }))
    .filter(({ piece }) => piece === 'B')
    .map(({ cell }) => (cell.x + cell.y) % 2);
  return parities.includes(0) && parities.includes(1);
}

export function roundTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function priceCard(
  cells: readonly PoolCell[],
  pieces: readonly PoolPiece[],
  knobs: PoolKnobs,
): Pick<PoolCard, 'value' | 'volume' | 'density' | 'baseCost' | 'cost' | 'band' | 'hasBishopPair' | 'supportPairs'> {
  const value = pieces.reduce((total, piece) => total + knobs.pieceValue[piece], 0);
  const volume = cells.length;
  const density = volume === 0 ? 0 : value / volume;
  const baseCost = value * (density / 3) ** knobs.densityPower * knobs.costScale;
  const hasBishopPair = hasOppositeColourBishopPair(cells, pieces);
  const supportPairs = countSupportPairs(cells, pieces, knobs.countPawnSupport);
  const withSynergy = baseCost
    * (1 + (hasBishopPair ? knobs.bishopPairBonus : 0))
    * (1 + supportPairs * knobs.supportBonus);
  const cost = roundTo(withSynergy, knobs.roundTo);
  const band: PoolBand = cost <= knobs.commonMaxCost
    ? 'common'
    : cost <= knobs.uncommonMaxCost ? 'uncommon' : 'rare';
  return { value, volume, density, baseCost, cost, band, hasBishopPair, supportPairs };
}

export function buildPool(knobs: PoolKnobs): PoolCard[] {
  const byIdentity = new Map<string, PoolCard>();
  for (const footprint of poolFootprints(knobs)) {
    const pieces: PoolPiece[] = [];
    const walk = (index: number, value: number): void => {
      if (index === footprint.length) {
        const cells = normalize(footprint);
        const identity = cardIdentity(footprint, pieces, knobs.collapseRotation);
        if (byIdentity.has(identity)) return;
        const seated = [...pieces];
        byIdentity.set(identity, {
          key: identity,
          cells,
          pieces: seated,
          ...priceCard(footprint, seated, knobs),
        });
        return;
      }
      for (const piece of POOL_PIECES) {
        const next = value + knobs.pieceValue[piece];
        const completesQueenPawn = knobs.allowQueenPawnOverCap
          && footprint.length === 2
          && index === 1
          && ((pieces[0] === 'Q' && piece === 'P') || (pieces[0] === 'P' && piece === 'Q'));
        if (next > knobs.maxValue && !completesQueenPawn) continue;
        pieces.push(piece);
        walk(index + 1, next);
        pieces.pop();
      }
    };
    walk(0, 0);
  }
  return [...byIdentity.values()].sort((a, b) => a.cost - b.cost || a.volume - b.volume || a.key.localeCompare(b.key));
}

export type PoolSummary = Readonly<{
  total: number;
  byBand: Readonly<Record<PoolBand, number>>;
  /** [band][volume 1..4+] */
  byBandVolume: Readonly<Record<PoolBand, readonly number[]>>;
  byVolume: readonly number[];
  /** One-card-one-art: commons are templated, so only the upper bands owe illustrations. */
  artOwed: number;
  /** How often one card of a band reaches a 20-card pile at the shipped 16/3/1 quota. */
  perPileShare: Readonly<Record<PoolBand, number>>;
}>;

export const POOL_PILE_SLOTS: Readonly<Record<PoolBand, number>> = { common: 16, uncommon: 3, rare: 1 };

export function summarizePool(cards: readonly PoolCard[]): PoolSummary {
  const bands: PoolBand[] = ['common', 'uncommon', 'rare'];
  const byBand = { common: 0, uncommon: 0, rare: 0 };
  const byVolume = [0, 0, 0, 0, 0];
  const byBandVolume: Record<PoolBand, number[]> = {
    common: [0, 0, 0, 0, 0], uncommon: [0, 0, 0, 0, 0], rare: [0, 0, 0, 0, 0],
  };
  for (const card of cards) {
    byBand[card.band] += 1;
    const slot = Math.min(card.volume, 4);
    byVolume[slot] += 1;
    byBandVolume[card.band][slot] += 1;
  }
  const perPileShare = { common: 0, uncommon: 0, rare: 0 };
  for (const band of bands) {
    perPileShare[band] = byBand[band] === 0 ? 0 : POOL_PILE_SLOTS[band] / byBand[band];
  }
  return {
    total: cards.length,
    byBand,
    byBandVolume,
    byVolume,
    artOwed: byBand.uncommon + byBand.rare,
    perPileShare,
  };
}
