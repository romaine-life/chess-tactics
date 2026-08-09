import type { PieceType, Side, UnitFacing } from './types';
import { resolvedUnitSpritePath } from './unitSpriteRegistry';
import { drawableAssets } from '../art/drawableCatalog';

export const PLAYABLE_PIECE_TYPES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const satisfies readonly PieceType[];
export type PlayablePieceType = typeof PLAYABLE_PIECE_TYPES[number];

export const isPlayablePieceType = (type: PieceType): type is PlayablePieceType =>
  (PLAYABLE_PIECE_TYPES as readonly PieceType[]).includes(type);

export const PIECE_LABEL: Record<PieceType, string> = {
  pawn: 'Pawn',
  knight: 'Knight',
  bishop: 'Bishop',
  rook: 'Rook',
  queen: 'Queen',
  king: 'King',
  rock: 'Rock',
  'random-rock': 'Rock',
};

export const PIECE_MARK: Record<PieceType, string> = {
  pawn: 'P',
  knight: 'N',
  bishop: 'B',
  rook: 'R',
  queen: 'Q',
  king: 'K',
  rock: 'O',
  'random-rock': '?',
};

// Team-color palettes. Every accepted live asset has 8 directions in each palette;
// a board side is assigned a palette (default player navy-blue / enemy crimson).
export const UNIT_PALETTES = ['navy-blue', 'crimson', 'golden', 'emerald', 'black', 'white'] as const;
export type UnitPalette = typeof UNIT_PALETTES[number];
export const DEFAULT_PALETTE: UnitPalette = 'navy-blue';
export const isUnitPalette = (value: unknown): value is UnitPalette =>
  typeof value === 'string' && (UNIT_PALETTES as readonly string[]).includes(value);
export const UNIT_PALETTE_LABELS: Record<UnitPalette, string> = {
  'navy-blue': 'Navy',
  crimson: 'Crimson',
  golden: 'Golden',
  emerald: 'Emerald',
  black: 'Black',
  white: 'White',
};

// ---------------------------------------------------------------------------
// Declared factions
//
// A level DECLARES its sides. The engine fields exactly two of them — `sideForFaction` resolves a
// unit to `player` when its palette matches the declared player faction and to `enemy` otherwise —
// so the declaration is a pair, and every palette outside it is undeclared and unpaintable.
//
// Before this existed, a board's factions were INFERRED from whatever colours happened to be
// painted: six palettes were offered, one became the player, and the rest silently collapsed into a
// single enemy side. The declaration replaces that inference, so the colour a piece wears follows
// from the faction it belongs to rather than being an independent choice.
// ---------------------------------------------------------------------------

export const FACTION_ROLES = ['player', 'enemy'] as const;
export type FactionRole = typeof FACTION_ROLES[number];

/** A brand-new board opens on the classic chess pairing. */
export const DEFAULT_DECLARED_FACTIONS: Record<FactionRole, UnitPalette> = { player: 'white', enemy: 'black' };

export type DeclaredFactions = Record<FactionRole, UnitPalette>;

/** The board fields the declaration reads. Structural so this module stays free of board imports. */
type FactionDeclarationSource = {
  playerFaction?: string | null;
  enemyFaction?: string | null;
  units?: Record<string, { faction?: string }>;
};

const paintedPalettes = (board: FactionDeclarationSource): UnitPalette[] => {
  const painted = new Set<string>(Object.values(board.units ?? {}).map((unit) => unit.faction ?? ''));
  return UNIT_PALETTES.filter((palette) => painted.has(palette));
};

/**
 * The two factions a board declares, always resolved to real palettes so every level has values.
 *
 * An authored declaration wins. A board that never authored one is READ, not rewritten: the player
 * falls back to the first painted palette (matching how the editor's own preview picked a side) and
 * the enemy to the first painted palette that is not the player. Only a board with nothing painted
 * reaches the default pairing. Resolution is pure — persisting it is an explicit authoring act, so
 * merely opening an old level cannot claim a side for it.
 */
export function resolveDeclaredFactions(board: FactionDeclarationSource): DeclaredFactions {
  const painted = paintedPalettes(board);
  // A declared enemy half is not available to the player's fallback. Reading the opposition's own
  // colour as the player is exactly how a single-colour board inverts: every piece is the enemy's,
  // the enemy half says so, and "the first painted palette is the player" hands it back anyway.
  const declaredOpposition = isUnitPalette(board.enemyFaction) ? board.enemyFaction : undefined;
  const player = isUnitPalette(board.playerFaction)
    ? board.playerFaction
    : painted.find((palette) => palette !== declaredOpposition)
      ?? (declaredOpposition === DEFAULT_DECLARED_FACTIONS.player
        ? DEFAULT_DECLARED_FACTIONS.enemy
        : DEFAULT_DECLARED_FACTIONS.player);
  const declaredEnemy = declaredOpposition && declaredOpposition !== player
    ? declaredOpposition
    : undefined;
  const enemy = declaredEnemy
    ?? painted.find((palette) => palette !== player)
    ?? (player === DEFAULT_DECLARED_FACTIONS.enemy ? DEFAULT_DECLARED_FACTIONS.player : DEFAULT_DECLARED_FACTIONS.enemy);
  return { player, enemy };
}

/**
 * Palettes worn by pieces on the board that no faction declares.
 *
 * These are the legacy three-plus-colour boards. Their pieces still play — everything outside the
 * player faction is the enemy side — but the colour is a side the level never declared, so the
 * editor surfaces them for repair instead of pretending they are a faction.
 */
export function undeclaredPaintedFactions(
  board: FactionDeclarationSource,
  declared: DeclaredFactions,
): UnitPalette[] {
  return paintedPalettes(board).filter((palette) => palette !== declared.player && palette !== declared.enemy);
}

export const UNIT_FACINGS: readonly UnitFacing[] = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

export const defaultFacingForSide = (side: Side): UnitFacing => {
  if (side === 'enemy') return 'south';
  return 'north';
};

export const facingFromDelta = (dx: number, dy: number): UnitFacing | null => {
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  if (sx === 0 && sy === 0) return null;
  if (sx === 0 && sy < 0) return 'north';
  if (sx > 0 && sy < 0) return 'north-east';
  if (sx > 0 && sy === 0) return 'east';
  if (sx > 0 && sy > 0) return 'south-east';
  if (sx === 0 && sy > 0) return 'south';
  if (sx < 0 && sy > 0) return 'south-west';
  if (sx < 0 && sy === 0) return 'west';
  return 'north-west';
};

export const pieceSpritePath = (type: PlayablePieceType, palette: UnitPalette = DEFAULT_PALETTE, direction: UnitFacing = 'south') =>
  resolvedUnitSpritePath(type, palette, direction);

/**
 * The palettes a player may wear. Every other palette is reserved for opponents, so the color on
 * the pieces you command is never also on the pieces you are fighting.
 */
export const PLAYER_PALETTES = ['white', 'navy-blue'] as const;
export type PlayerPalette = typeof PLAYER_PALETTES[number];
export const isPlayerPalette = (value: unknown): value is PlayerPalette =>
  typeof value === 'string' && (PLAYER_PALETTES as readonly string[]).includes(value);
export const DEFAULT_PLAYER_PALETTE: PlayerPalette = 'white';
/** Palettes an opponent may wear — the complement of the player's, in catalog order. */
export const OPPONENT_PALETTES: readonly UnitPalette[] = UNIT_PALETTES.filter((palette) => !isPlayerPalette(palette));

// A player's own color is a preference, not level content: a level authors WHICH faction is the
// player, and the player chooses what that faction wears. Held as replaceable module state (the
// same shape as the accepted sprite registry) because the sprite resolvers below are plain
// functions called from canvas paint paths, not React. `initPlayerPalette` in the frontend
// keeps it in step with the stored setting.
let chosenPlayerPalette: PlayerPalette = DEFAULT_PLAYER_PALETTE;
export function setPlayerPalette(palette: PlayerPalette): void {
  chosenPlayerPalette = palette;
}
export function currentPlayerPalette(): PlayerPalette {
  return chosenPlayerPalette;
}

// Which palette a board side wears when nothing else decides. The player entry is the fallback
// only — `paletteForSide` answers for the player from the preference above.
export const PALETTE_FOR_SIDE: Record<Side, UnitPalette> = {
  player: DEFAULT_PLAYER_PALETTE,
  enemy: 'crimson',
  neutral: 'navy-blue',
};

/**
 * Which palette a board side wears on a GAMEPLAY surface — the war-room board, the HUD portraits,
 * the promotion picker, Run cards. The player's side always wears the chosen player palette, so
 * the preference reaches authored campaign levels (every level saved through the editor stamps an
 * explicit palette on its units, which would otherwise win). An opponent keeps its authored
 * palette unless that collides with the player's choice, in which case it falls back to the enemy
 * default so the two sides can never render as the same color.
 *
 * Authoring surfaces deliberately do not come through here: the Level Editor paints and draws by
 * faction (`renderPlan.staticUnitSubject`), so an author keeps seeing the colors they placed.
 */
export const paletteForSide = (side: Side, palette?: string | null): UnitPalette => {
  if (side === 'player') return currentPlayerPalette();
  if (isUnitPalette(palette)) return palette === currentPlayerPalette() ? PALETTE_FOR_SIDE[side] : palette;
  return PALETTE_FOR_SIDE[side];
};

// Piece portraits: a dedicated eye-level perspective bust (separate contract from the
// true-iso board sprite), one per palette. See docs/portrait-contract.md.
export const portraitPath = (type: PlayablePieceType, palette: UnitPalette = DEFAULT_PALETTE) =>
  drawableAssets('unit-portrait').find((asset) => asset.behavior.piece === type)?.media[palette]?.media.immutableUrl
  ?? (() => { throw new Error(`drawable catalog has no ${type}/${palette} portrait`); })();
