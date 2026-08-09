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
  /**
   * Emit one representative orientation per footprint class rather than every rotation of it.
   *
   * This is a GENERATION restriction and not an identity rule, and it cannot be folded into
   * `collapseRotation`. Quotienting by rotation is what merges a vertical domino with a horizontal
   * one, but the same quarter-turns also merge N-over-P with P-over-N — the 180 turn is in the same
   * group as the 90. So "shape is orientation-blind, seat is not" is unreachable by collapsing, and
   * the only coherent way to get it is to generate one orientation and keep every seating.
   *
   * Combined with `collapseRotation: false` this is the vertical-only, front-and-back-distinct rule.
   */
  oneOrientationPerShape: boolean;
  /** cost = value * (density / 3) ^ densityPower * costScale, rounded to `roundTo`. */
  densityPower: number;
  costScale: number;
  roundTo: number;
  /** Two Bishops whose cells differ in colour parity — the blind-spot fix. */
  bishopPairBonus: number;
  /** Per defence on the card. A piece covered twice contributes two. */
  supportBonus: number;
  /**
   * Whether a Pawn sheltering a piece counts toward synergy at all. This is a design question
   * (is pawn shelter worth money?), not a workaround: while the player rotates, `cardSynergy`
   * already reads the best orientation, so the directional term is priceable either way.
   */
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
  oneOrientationPerShape: false,
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
  /** Total defences across the card: per piece, how many others cover it, summed. */
  defences: number;
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

/** The footprint's rotation class, blind to who is seated in it. */
function shapeClass(cells: readonly PoolCell[]): string {
  return [0, 1, 2, 3]
    .map((turns) => normalize(rotate(cells, turns)).map((c) => `${c.x}${c.y}`).join(''))
    .sort()[0];
}

/** Footprints the generator emits: connected, size-capped, left-anchored (the shipped rule). */
export function poolFootprints(knobs: PoolKnobs): PoolCell[][] {
  const out: PoolCell[][] = [];
  const total = knobs.cols * knobs.rows;
  if (total > 20) return out;
  const seenShape = new Set<string>();
  for (let mask = 1; mask < (1 << total); mask += 1) {
    const cells: PoolCell[] = [];
    for (let i = 0; i < total; i += 1) {
      if ((mask & (1 << i)) !== 0) cells.push({ x: i % knobs.cols, y: Math.floor(i / knobs.cols) });
    }
    if (cells.length > knobs.maxCells) continue;
    if (Math.min(...cells.map((c) => c.x)) !== 0) continue;
    if (!connected(cells)) continue;
    if (knobs.oneOrientationPerShape) {
      const shape = shapeClass(cells);
      if (seenShape.has(shape)) continue;
      seenShape.add(shape);
    }
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

/**
 * Total defences on the card: for every piece, how many other pieces cover its square, summed.
 *
 * The count matters and is not merely "is it defended". Whether a square holds is attacker against
 * defender arithmetic -- a piece covered twice survives two attackers where a piece covered once
 * does not -- so a second defender buys something real and is counted.
 *
 * What is NOT read is the defender's identity. A Rook covering a Pawn counts the same as a Pawn
 * covering a Rook, because what changes the position is that a capture becomes a trade, and any
 * defender does that. Value is already carried by the base price this multiplies, so weighting the
 * count by material as well would charge for the same thing twice.
 */
export function countDefences(
  cells: readonly PoolCell[],
  pieces: readonly PoolPiece[],
  countPawnSupport: boolean,
): number {
  let defences = 0;
  for (let target = 0; target < cells.length; target += 1) {
    for (let by = 0; by < cells.length; by += 1) {
      if (by === target) continue;
      if (!countPawnSupport && pieces[by] === 'P') continue;
      if (defends(pieces[by], cells[by], cells[target], cells)) defences += 1;
    }
  }
  return defences;
}

/**
 * Two Bishops on opposite colours. The Bishop is the only piece with a permanent reachability
 * restriction, so it is the only one whose pair removes a blind spot rather than doubling reach --
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

/** Rotate the seats without reordering them, so `pieces[i]` still names `cells[i]`. */
function rotateSeated(cells: readonly PoolCell[], turns: number): PoolCell[] {
  const rotated = rotate(cells, turns);
  const minX = Math.min(...rotated.map((c) => c.x));
  const minY = Math.min(...rotated.map((c) => c.y));
  return rotated.map((c) => ({ x: c.x - minX, y: c.y - minY }));
}

/**
 * The synergy the card will actually deliver.
 *
 * Only ONE term varies with rotation. Support between non-pawn pieces survives a quarter turn —
 * ranks map to files, diagonals to diagonals, knight moves to knight moves — and colour parity is
 * invariant too. A Pawn is the sole directional piece, so which squares it shelters turn with the
 * card and its support is the only rotation-dependent term.
 *
 * So while the player rotates at placement, the card is worth its BEST orientation, because that
 * is the one they will take. Reading the authored seating alone would price a Pawn shelter the
 * player never has to give up. When facing is bought instead, the authored orientation is the only
 * one there is, and the max collapses to it.
 */
export function cardSynergy(
  cells: readonly PoolCell[],
  pieces: readonly PoolPiece[],
  knobs: PoolKnobs,
): Readonly<{ defences: number; hasBishopPair: boolean }> {
  const hasBishopPair = hasOppositeColourBishopPair(cells, pieces);
  const turns = knobs.collapseRotation ? [0, 1, 2, 3] : [0];
  const defences = Math.max(...turns.map((turn) => (
    countDefences(rotateSeated(cells, turn), pieces, knobs.countPawnSupport)
  )));
  return { defences, hasBishopPair };
}

export function priceCard(
  cells: readonly PoolCell[],
  pieces: readonly PoolPiece[],
  knobs: PoolKnobs,
): Pick<PoolCard, 'value' | 'volume' | 'density' | 'baseCost' | 'cost' | 'band' | 'hasBishopPair' | 'defences'> {
  const value = pieces.reduce((total, piece) => total + knobs.pieceValue[piece], 0);
  const volume = cells.length;
  const density = volume === 0 ? 0 : value / volume;
  const baseCost = value * (density / 3) ** knobs.densityPower * knobs.costScale;
  const { hasBishopPair, defences } = cardSynergy(cells, pieces, knobs);
  const withSynergy = baseCost
    * (1 + (hasBishopPair ? knobs.bishopPairBonus : 0))
    * (1 + defences * knobs.supportBonus);
  const cost = roundTo(withSynergy, knobs.roundTo);
  const band: PoolBand = cost <= knobs.commonMaxCost
    ? 'common'
    : cost <= knobs.uncommonMaxCost ? 'uncommon' : 'rare';
  return { value, volume, density, baseCost, cost, band, hasBishopPair, defences };
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

/**
 * Named parameter sets. A design conversation moves by proposing a whole position, not by nudging
 * one number, so the positions worth comparing are written down and selectable rather than
 * reconstructed by hand each time. Adding one is adding an entry here.
 */
export type PoolModel = Readonly<{
  id: string;
  label: string;
  note: string;
  knobs: PoolKnobs;
}>;

export const POOL_MODELS: readonly PoolModel[] = Object.freeze([
  {
    id: 'material-bands',
    label: 'Material bands',
    note: 'The live generator with cost = material and rarity by raw value (<=4, <=6). NOT the shipped rarity: that also steps any Bishop card up a band and steps awkward footprints down one, which is what puts 23 four-cell cards into common. This model shows the bands without those two adjustments.',
    knobs: { ...DEFAULT_POOL_KNOBS, densityPower: 0, costScale: 1, roundTo: 0, commonMaxCost: 4, uncommonMaxCost: 6 },
  },
  {
    id: 'density-cost',
    label: 'Density cost curve',
    note: 'Price reads density on a curve rather than raw material, and the rarity bands are drawn on price. The exact formula is stated live under Pricing.',
    knobs: DEFAULT_POOL_KNOBS,
  },
  {
    id: 'front-and-back',
    label: 'Front and back',
    note: 'One orientation per shape, every seating distinct — the vertical-only rule, where who stands in front is bought rather than chosen at placement.',
    knobs: { ...DEFAULT_POOL_KNOBS, collapseRotation: false, oneOrientationPerShape: true, countPawnSupport: true },
  },
  {
    id: 'every-orientation',
    label: 'Every orientation',
    note: 'Rotation collapse simply dropped: each rotation of a shape is also its own card. The expensive reading, and the one that doubles the small tier for nothing.',
    knobs: { ...DEFAULT_POOL_KNOBS, collapseRotation: false, countPawnSupport: true },
  },
  {
    id: 'small-catalog',
    label: 'Small catalog',
    note: 'Footprints capped at two cells — the tier called the game’s identity, generated exhaustively.',
    knobs: { ...DEFAULT_POOL_KNOBS, maxCells: 2 },
  },
  {
    id: 'generate-small-author-big',
    label: 'Generate small, author big',
    note: 'Two-cell cap, one orientation, seatings distinct: complete coverage of the tier that carries the identity, leaving 3- and 4-cell to be authored rather than generated.',
    knobs: {
      ...DEFAULT_POOL_KNOBS, maxCells: 2, collapseRotation: false, oneOrientationPerShape: true, countPawnSupport: true,
    },
  },
  {
    id: 'synergy',
    label: 'Synergy priced',
    note: 'Density cost plus the two chess rules material cannot express: the opposite-colour Bishop pair, and mutual support.',
    knobs: { ...DEFAULT_POOL_KNOBS, bishopPairBonus: 0.25, supportBonus: 0.1 },
  },
]);

export function sameKnobs(a: PoolKnobs, b: PoolKnobs): boolean {
  return (Object.keys(a) as (keyof PoolKnobs)[]).every((field) => (
    field === 'pieceValue'
      ? POOL_PIECES.every((piece) => a.pieceValue[piece] === b.pieceValue[piece])
      : a[field] === b[field]
  ));
}

export type PoolGrouping = 'none' | 'band' | 'volume' | 'cost' | 'material' | 'density' | 'composition' | 'shape' | 'piece';

export const POOL_GROUPINGS: readonly Readonly<{ id: PoolGrouping; label: string }>[] = Object.freeze([
  { id: 'none', label: 'Flat list' },
  { id: 'band', label: 'Band' },
  { id: 'volume', label: 'Volume' },
  { id: 'cost', label: 'Cost' },
  { id: 'material', label: 'Material' },
  { id: 'density', label: 'Density' },
  { id: 'composition', label: 'Composition' },
  { id: 'shape', label: 'Shape' },
  { id: 'piece', label: 'Contains piece' },
]);

const BAND_ORDER: Readonly<Record<PoolBand, number>> = { common: 0, uncommon: 1, rare: 2 };

/** The footprint alone, blind to who is seated in it. */
export function poolShapeSignature(cells: readonly PoolCell[]): string {
  const w = Math.max(...cells.map((c) => c.x)) + 1;
  const h = Math.max(...cells.map((c) => c.y)) + 1;
  const rows: string[] = [];
  for (let y = 0; y < h; y += 1) {
    let row = '';
    for (let x = 0; x < w; x += 1) row += cells.some((c) => c.x === x && c.y === y) ? '#' : '.';
    rows.push(row);
  }
  return rows.join('/');
}

export type PoolGroup = Readonly<{ key: string; label: string; sort: number; cards: readonly PoolCard[] }>;

/**
 * A register: every group the chosen dimension produces, with its membership. `piece` is the one
 * dimension where a card belongs to more than one group, because a card carrying a Rook and a Pawn
 * is genuinely in both registers.
 */
export function groupPool(cards: readonly PoolCard[], grouping: PoolGrouping): PoolGroup[] {
  if (grouping === 'none') return [{ key: 'all', label: 'All cards', sort: 0, cards }];
  const groups = new Map<string, { label: string; sort: number; cards: PoolCard[] }>();
  const add = (key: string, label: string, sort: number, card: PoolCard): void => {
    const existing = groups.get(key);
    if (existing) existing.cards.push(card);
    else groups.set(key, { label, sort, cards: [card] });
  };
  for (const card of cards) {
    if (grouping === 'band') add(card.band, card.band, BAND_ORDER[card.band], card);
    else if (grouping === 'volume') add(`v${card.volume}`, `${card.volume} cell${card.volume === 1 ? '' : 's'}`, card.volume, card);
    else if (grouping === 'cost') add(`c${card.cost}`, `${card.cost} gold`, card.cost, card);
    else if (grouping === 'material') add(`m${card.value}`, `${card.value} material`, card.value, card);
    else if (grouping === 'density') add(`d${card.density.toFixed(2)}`, `density ${card.density.toFixed(2)}`, card.density, card);
    else if (grouping === 'composition') {
      const composition = [...card.pieces].sort().join('');
      add(composition, composition, card.value * 100 + card.volume, card);
    } else if (grouping === 'shape') {
      const shape = poolShapeSignature(card.cells);
      add(shape, shape, card.volume * 100 + shape.length, card);
    } else {
      for (const piece of POOL_PIECES) {
        if (card.pieces.includes(piece)) add(piece, POOL_PIECE_NAME[piece], POOL_PIECES.indexOf(piece), card);
      }
    }
  }
  return [...groups.entries()]
    .map(([key, value]) => ({ key, label: value.label, sort: value.sort, cards: value.cards }))
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
}

/**
 * What the two rotation settings mean at the table, which is the part neither checkbox states.
 *
 * The catalog rule and the placement rule are joined at the hip. If four quarter-turns are one
 * card, that card cannot carry an orientation, so somebody has to choose one when it is placed —
 * ADR-0515 gives that to the player. If instead each orientation is its own card, the card already
 * says which way it faces, and letting the player turn it at placement would refund the very thing
 * they bought. So the placement rule is implied by the identity rule rather than being free.
 */
export type PoolRotationContract = Readonly<{
  playerRotatesAtPlacement: boolean;
  frontBackIs: 'a placement choice' | 'a purchase';
  orientationsPerShape: 'one card covers all four' | 'one authored orientation' | 'every rotation is its own card';
  summary: string;
}>;

export function poolRotationContract(knobs: PoolKnobs): PoolRotationContract {
  if (knobs.collapseRotation) {
    return {
      playerRotatesAtPlacement: true,
      frontBackIs: 'a placement choice',
      orientationsPerShape: 'one card covers all four',
      summary: 'The card carries no orientation, so the player turns it when placing. Who stands in front is decided on the board, not in the shop.',
    };
  }
  return {
    playerRotatesAtPlacement: false,
    frontBackIs: 'a purchase',
    orientationsPerShape: knobs.oneOrientationPerShape ? 'one authored orientation' : 'every rotation is its own card',
    summary: knobs.oneOrientationPerShape
      ? 'The card fixes its own facing and no rotation happens at placement. Who stands in front is bought.'
      : 'The card fixes its own facing, and every rotation of a shape is separately purchasable — so each card also has a horizontal twin meaning the same thing.',
  };
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
