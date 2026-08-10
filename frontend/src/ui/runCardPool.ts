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

/**
 * One step of a price formula, applied in order starting from the card's raw material.
 *
 * Adding a pricing idea means adding a kind here and a model that uses it — never a constant that
 * every other model has to carry at zero.
 */
export type PoolTerm =
  /** x (density / 3) ^ power x scale — pays for concentration rather than raw material. */
  | Readonly<{ kind: 'density'; power: number; scale: number }>
  /** x (1 + bonus) when the card holds two Bishops on opposite colours. */
  | Readonly<{ kind: 'bishopPair'; bonus: number }>
  /** x (1 + defences x bonus). `countPawnSupport` decides whether Pawn shelter counts. */
  | Readonly<{ kind: 'defences'; bonus: number; countPawnSupport: boolean }>
  /** x (1 - blocked x penalty). A Pawn directly behind a friendly piece can never advance. */
  | Readonly<{ kind: 'blockedPawn'; penalty: number }>
  /** Round to the nearest `to`. Normally last. */
  | Readonly<{ kind: 'round'; to: number }>;

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
  /**
   * The price formula, as an ordered list of terms starting from raw material.
   *
   * A model owns its FORMULA and not merely its constants. A pricing idea that exists on every
   * model with a zero in front of it is not a proposal you can compare against anything -- it is
   * one formula wearing several hats. Since we do not yet know what later terms will do, the shape
   * of the formula has to be per-model too, not just its numbers.
   */
  terms: readonly PoolTerm[];
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
  terms: [
    { kind: 'density', power: 0.5, scale: 10 },
    { kind: 'round', to: 5 },
  ],
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
  cost: number;
  band: PoolBand;
  hasBishopPair: boolean;
  /** Total defences across the card: per piece, how many others cover it, summed. */
  defences: number;
  /** Pawns immobilised by a friendly piece directly in front of them. */
  blockedPawns: number;
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

/**
 * When only one orientation of a shape is emitted, which one it should be.
 *
 * The DEEPEST one — the rotation extending furthest toward the enemy edge — because depth is what
 * front and back are made of. A horizontal domino has no front: both cells stand the same distance
 * from the enemy, so a card built on one cannot sell you an ordering. Left to enumeration order the
 * generator picked the horizontal domino, which is exactly the orientation that makes a bought
 * facing meaningless.
 */
function deepestOrientation(cells: readonly PoolCell[]): PoolCell[] {
  const depth = (cs: readonly PoolCell[]): number => Math.max(...cs.map((c) => c.y)) + 1;
  return [0, 1, 2, 3]
    .map((turns) => normalize(rotate(cells, turns)))
    .sort((a, b) => (
      depth(b) - depth(a)
      || a.map((c) => `${c.x}${c.y}`).join('').localeCompare(b.map((c) => `${c.x}${c.y}`).join(''))
    ))[0];
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
      out.push(deepestOrientation(cells));
      continue;
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
  countPawnSupport: boolean,
): Readonly<{ defences: number; hasBishopPair: boolean }> {
  const hasBishopPair = hasOppositeColourBishopPair(cells, pieces);
  const turns = knobs.collapseRotation ? [0, 1, 2, 3] : [0];
  const defences = Math.max(...turns.map((turn) => (
    countDefences(rotateSeated(cells, turn), pieces, countPawnSupport)
  )));
  return { defences, hasBishopPair };
}

/**
 * Pawns that cannot move: one sits directly in front of them, on the same card.
 *
 * A Pawn only advances forward, so a friendly piece on the square ahead immobilises it completely
 * — and because a Pawn captures diagonally, that Pawn is not defending the thing blocking it
 * either. It is a dead unit paying rent on a cell. This is the DIRECTLY-behind case only; a Pawn
 * diagonally behind covers the piece and is counted as a defence instead.
 */
export function countBlockedPawns(
  cells: readonly PoolCell[],
  pieces: readonly PoolPiece[],
): number {
  let blocked = 0;
  for (let i = 0; i < cells.length; i += 1) {
    if (pieces[i] !== 'P') continue;
    // y = 0 is the enemy edge, so forward is one row toward zero.
    if (cells.some((cell) => cell.x === cells[i].x && cell.y === cells[i].y - 1)) blocked += 1;
  }
  return blocked;
}

/** One applied step, so the formula readout and the worked example share a single source. */
export type PoolPriceStep = Readonly<{
  term: PoolTerm;
  /** The term written out with this model's constants, independent of any card. */
  formula: string;
  /** The same term with this card's numbers substituted, or null when it did not apply. */
  worked: string | null;
  before: number;
  after: number;
}>;

/** The term written with its constants only — what the Pricing panel prints. */
export function poolTermFormula(term: PoolTerm): string {
  if (term.kind === 'density') return `x (density / 3)^${term.power} x ${term.scale}`;
  if (term.kind === 'bishopPair') return `x (1 + ${term.bonus}) when the card holds an opposite-colour Bishop pair`;
  if (term.kind === 'defences') {
    return `x (1 + defences x ${term.bonus})${term.countPawnSupport ? '' : ', Pawn shelter not counted'}`;
  }
  if (term.kind === 'blockedPawn') return `x (1 - blocked Pawns x ${term.penalty})`;
  return `rounded to the nearest ${term.to}`;
}

export function poolTermLabel(term: PoolTerm): string {
  if (term.kind === 'density') return 'Density curve';
  if (term.kind === 'bishopPair') return 'Bishop pair';
  if (term.kind === 'defences') return 'Defences';
  if (term.kind === 'blockedPawn') return 'Blocked pawns';
  return 'Rounding';
}

/**
 * Run a model's formula over one card, from raw material through every term it declares.
 *
 * A model that does not declare a term does not carry it at all, so its price is derived from
 * exactly the steps it names -- there is no inert factor sitting in the arithmetic multiplying
 * by one.
 */
/** Run the declared terms once, over one specific seating of the card. */
function runTerms(
  seated: readonly PoolCell[],
  pieces: readonly PoolPiece[],
  knobs: PoolKnobs,
  value: number,
  density: number,
  hasBishopPair: boolean,
): Readonly<{ cost: number; steps: PoolPriceStep[]; defences: number; blockedPawns: number }> {
  const steps: PoolPriceStep[] = [];
  let cost = value;
  let defences = 0;
  let blockedPawns = 0;
  for (const term of knobs.terms) {
    const before = cost;
    let worked: string | null = null;
    if (term.kind === 'density') {
      cost = before * (density / 3) ** term.power * term.scale;
      worked = `x (${density.toFixed(2)} / 3)^${term.power} x ${term.scale}`;
    } else if (term.kind === 'bishopPair') {
      if (hasBishopPair) { cost = before * (1 + term.bonus); worked = `x (1 + ${term.bonus})`; }
    } else if (term.kind === 'defences') {
      defences = countDefences(seated, pieces, term.countPawnSupport);
      if (defences > 0) { cost = before * (1 + defences * term.bonus); worked = `x (1 + ${defences} x ${term.bonus})`; }
    } else if (term.kind === 'blockedPawn') {
      blockedPawns = countBlockedPawns(seated, pieces);
      if (blockedPawns > 0) {
        cost = before * (1 - blockedPawns * term.penalty);
        worked = `x (1 - ${blockedPawns} x ${term.penalty})`;
      }
    } else {
      cost = roundTo(before, term.to);
      worked = `-> ${cost}`;
    }
    steps.push({ term, formula: poolTermFormula(term), worked, before, after: cost });
  }
  return { cost, steps, defences, blockedPawns };
}

/**
 * Run a model's formula over one card, from raw material through every term it declares.
 *
 * A model that does not declare a term does not carry it at all, so its price is derived from
 * exactly the steps it names -- there is no inert factor sitting in the arithmetic multiplying
 * by one.
 *
 * While the player rotates at placement, the whole chain is evaluated once per quarter turn and
 * the BEST result is the price. It has to be the whole chain and not each term separately: a card
 * is placed in ONE orientation, so the turn that maximises defences may be the same turn that
 * blocks a Pawn, and taking each term's best independently would price a card the player can
 * never actually field. Price stands in for value here, so the best result is the highest one --
 * the arrangement the player will choose.
 */
export function poolPriceSteps(
  cells: readonly PoolCell[],
  pieces: readonly PoolPiece[],
  knobs: PoolKnobs,
): Readonly<{
  value: number; volume: number; density: number; hasBishopPair: boolean;
  defences: number; blockedPawns: number; cost: number; steps: readonly PoolPriceStep[];
}> {
  const value = pieces.reduce((total, piece) => total + knobs.pieceValue[piece], 0);
  const volume = cells.length;
  const density = volume === 0 ? 0 : value / volume;
  const hasBishopPair = hasOppositeColourBishopPair(cells, pieces);
  const turns = knobs.collapseRotation ? [0, 1, 2, 3] : [0];
  const best = turns
    .map((turn) => runTerms(rotateSeated(cells, turn), pieces, knobs, value, density, hasBishopPair))
    .reduce((a, b) => (b.cost > a.cost ? b : a));
  return {
    value,
    volume,
    density,
    hasBishopPair,
    defences: best.defences,
    blockedPawns: best.blockedPawns,
    cost: best.cost,
    steps: best.steps,
  };
}

export function priceCard(
  cells: readonly PoolCell[],
  pieces: readonly PoolPiece[],
  knobs: PoolKnobs,
): Pick<PoolCard, 'value' | 'volume' | 'density' | 'cost' | 'band' | 'hasBishopPair' | 'defences' | 'blockedPawns'> {
  const {
    value, volume, density, hasBishopPair, defences, blockedPawns, cost,
  } = poolPriceSteps(cells, pieces, knobs);
  const band: PoolBand = cost <= knobs.commonMaxCost
    ? 'common'
    : cost <= knobs.uncommonMaxCost ? 'uncommon' : 'rare';
  return { value, volume, density, cost, band, hasBishopPair, defences, blockedPawns };
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
 *
 * A DATED label is a snapshot of where the design stood at that moment, kept so it can be returned
 * to and compared against rather than reconstructed from memory. Dated entries sort chronologically
 * and are never edited afterwards — editing one would destroy the thing it exists to preserve. The
 * undated entries above are standing reference positions, not moments.
 */
export type PoolModel = Readonly<{
  id: string;
  label: string;
  note: string;
  knobs: PoolKnobs;
}>;

export const POOL_MODELS: readonly PoolModel[] = Object.freeze([
  {
    id: '2026-08-09-1921-2x2-no-rotation',
    label: '2026-08-09 19:21 · 2x2, no rotation',
    note: 'The 19:13 shape rule and pricing, with rotation collapse dropped so facing is bought rather than chosen at placement. Every orientation is therefore its own card — a player who cannot turn a card needs the horizontal pair and the vertical pair sold separately. That is what takes the catalog from 68 to 244, and what finally gives the blocked-Pawn penalty teeth: 98 cards carry one here against 10 with rotation on.',
    knobs: {
      ...DEFAULT_POOL_KNOBS,
      cols: 2,
      rows: 2,
      collapseRotation: false,
      terms: [
        { kind: 'density', power: 0.5, scale: 10 },
        { kind: 'bishopPair', bonus: 0.25 },
        { kind: 'defences', bonus: 0.1, countPawnSupport: true },
        { kind: 'blockedPawn', penalty: 0.15 },
        { kind: 'round', to: 5 },
      ],
      commonMaxCost: 70,
      uncommonMaxCost: 100,
    },
  },
  {
    id: '2026-08-09-1913-2x2-max',
    label: '2026-08-09 19:13 · 2x2 max',
    note: 'The 19:07 pricing exactly, with the generator restricted to a two-by-two grid — nothing longer than two cells in either direction. So the vocabulary is 1x1, 1x2, the L, and the square, and every card fits any band that is at least two-by-two. Only the shape rule differs from its parent, so any change in the tiers is the shape rule and nothing else.',
    knobs: {
      ...DEFAULT_POOL_KNOBS,
      cols: 2,
      rows: 2,
      terms: [
        { kind: 'density', power: 0.5, scale: 10 },
        { kind: 'bishopPair', bonus: 0.25 },
        { kind: 'defences', bonus: 0.1, countPawnSupport: true },
        { kind: 'blockedPawn', penalty: 0.15 },
        { kind: 'round', to: 5 },
      ],
      commonMaxCost: 70,
      uncommonMaxCost: 100,
    },
  },
  {
    id: '2026-08-09-1907-synergy-70-100',
    label: '2026-08-09 19:07 · Synergy, bands 70/100',
    note: 'Saved as found: the synergy formula with the bands moved to 70 and 100. Tier COUNTS land near target (152 / 93 / 23) but the membership does not — common is 75% four-cell, 71 of those carry two or more minors, and rare fills with triple-minor clusters priced above rook-and-minor. Kept as the record of where that setting actually leads.',
    knobs: {
      ...DEFAULT_POOL_KNOBS,
      terms: [
        { kind: 'density', power: 0.5, scale: 10 },
        { kind: 'bishopPair', bonus: 0.25 },
        { kind: 'defences', bonus: 0.1, countPawnSupport: true },
        { kind: 'blockedPawn', penalty: 0.15 },
        { kind: 'round', to: 5 },
      ],
      commonMaxCost: 70,
      uncommonMaxCost: 100,
    },
  },
  {
    id: 'synergy',
    label: 'Synergy priced',
    note: 'The density curve plus what material cannot express: the opposite-colour Bishop pair, defences, and a penalty for a Pawn stuck directly behind a friendly piece. Pawn shelter counts as a defence here.',
    knobs: {
      ...DEFAULT_POOL_KNOBS,
      terms: [
        { kind: 'density', power: 0.5, scale: 10 },
        { kind: 'bishopPair', bonus: 0.25 },
        { kind: 'defences', bonus: 0.1, countPawnSupport: true },
        { kind: 'blockedPawn', penalty: 0.15 },
        { kind: 'round', to: 5 },
      ],
    },
  },
  {
    id: 'material-bands',
    label: 'Material bands',
    note: 'cost = material, nothing else, and rarity by raw value. NOT the shipped rarity: that also steps any Bishop card up a band and steps awkward footprints down one, which is what puts 23 four-cell cards into common.',
    knobs: { ...DEFAULT_POOL_KNOBS, terms: [], commonMaxCost: 4, uncommonMaxCost: 6 },
  },
  {
    id: 'density-cost',
    label: 'Density cost curve',
    note: 'Price pays for concentration rather than raw material, and the rarity bands are drawn on price. No synergy terms at all — this is the formula against which the synergy proposals are compared.',
    knobs: DEFAULT_POOL_KNOBS,
  },
  {
    id: 'front-and-back',
    label: 'Front and back',
    note: 'The density curve, generated one orientation per shape with every seating distinct — the vertical-only rule, where who stands in front is bought rather than chosen at placement.',
    knobs: { ...DEFAULT_POOL_KNOBS, collapseRotation: false, oneOrientationPerShape: true },
  },
  {
    id: 'every-orientation',
    label: 'Every orientation',
    note: 'Rotation collapse simply dropped, so each rotation of a shape is also its own card. The expensive reading, and the one that doubles the small tier for nothing.',
    knobs: { ...DEFAULT_POOL_KNOBS, collapseRotation: false },
  },
  {
    id: 'small-catalog',
    label: 'Small catalog',
    note: 'The density curve with footprints capped at two cells — the tier called the game’s identity, generated exhaustively.',
    knobs: { ...DEFAULT_POOL_KNOBS, maxCells: 2 },
  },
  {
    id: 'generate-small-author-big',
    label: 'Generate small, author big',
    note: 'Two-cell cap, one orientation, seatings distinct: complete coverage of the tier that carries the identity, leaving 3- and 4-cell to be authored rather than generated.',
    knobs: {
      ...DEFAULT_POOL_KNOBS, maxCells: 2, collapseRotation: false, oneOrientationPerShape: true,
    },
  },
  {
    id: 'synergy-no-pawns',
    label: 'Synergy, pawns excluded',
    note: 'The same proposal with Pawn shelter not counted as a defence, so "is a Pawn in front worth paying for" reads as a difference between two models rather than an argument. The blocked-Pawn penalty applies in both.',
    knobs: {
      ...DEFAULT_POOL_KNOBS,
      terms: [
        { kind: 'density', power: 0.5, scale: 10 },
        { kind: 'bishopPair', bonus: 0.25 },
        { kind: 'defences', bonus: 0.1, countPawnSupport: false },
        { kind: 'blockedPawn', penalty: 0.15 },
        { kind: 'round', to: 5 },
      ],
    },
  },
]);

/**
 * The model the page opens on. Taken from the head of the list rather than named separately, so
 * "first in the list" and "what loads" cannot drift apart.
 */
export const DEFAULT_POOL_MODEL: PoolModel = POOL_MODELS[0];

export function sameKnobs(a: PoolKnobs, b: PoolKnobs): boolean {
  return (Object.keys(a) as (keyof PoolKnobs)[]).every((field) => {
    if (field === 'pieceValue') return POOL_PIECES.every((piece) => a.pieceValue[piece] === b.pieceValue[piece]);
    if (field === 'terms') return JSON.stringify(a.terms) === JSON.stringify(b.terms);
    return a[field] === b[field];
  });
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
