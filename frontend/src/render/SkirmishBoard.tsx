import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { tileFrameSrc, tileAssets, tileFamilies, edgeTiles, type TileAsset } from '../art/tileset';
import { countIllegalEdges, solveSocketBoard, type SocketBoardCell, type SocketBoardResult } from '../core/tileBoardGenerator';
import { densityFieldAt, resolveGroundCover } from '../core/groundCover';
import type { BoardSize, GameState, Move, Piece, TerrainType, Vec } from '../core/types';
import { attackedSquares, enemyThreats, inBounds, isEnemy, legalMoves, livingPieces, pieceAt, pieceHp, pieceMaxHp } from '../core/rules';
import { canTraverse, elevationAt } from '../core/terrain';
import { PIECE_LABEL, PIECE_MARK, PLAYABLE_PIECE_TYPES, defaultFacingForSide, pieceSpritePath, type PlayablePieceType, type UnitPalette } from '../core/pieces';
import { familyIdForAsset, tileSocketsForAsset, type TileFamilyId } from '../core/tileSockets';
import { useSkirmish } from '../game/store';
import { useSkirmishView } from '../game/skirmishView';
import { BoardLabBoard, boardLabCellPosition } from './BoardLabBoard';
import { GroundCoverLayer } from './GroundCoverLayer';
import { PropSprite } from './BoardStructure';
import { ViewPane } from '../ui/shared/ViewPane';
import { useBoardArtReveal } from './boardArtReady';
import { groundCoverSet } from '../core/groundCover';
import { featureFrameSrc } from '../art/tileset';
import { FENCE_ART_PENDING, featureMaskAt, type FeatureKind, type FeatureMaterial } from '../core/featureAutotile';
import { decodeBoard, type EditorBoard } from '../ui/boardCode';

const TERRAIN_TO_FAMILY: Record<Exclude<TerrainType, 'void'>, TileFamilyId> = {
  grass: 'grass',
  road: 'stone',
  stone: 'stone',
  bridge: 'stone',
  cliff: 'stone',
  rock: 'stone',
  water: 'water',
  dirt: 'dirt',
  pebble: 'pebble',
  sand: 'sand',
};

function terrainFamilyForGame(terrain: TerrainType | undefined): TileFamilyId | null {
  if (!terrain || terrain === 'void') return null;
  return TERRAIN_TO_FAMILY[terrain];
}

const tileAssetById = new Map(tileAssets.map((asset) => [asset.id, asset]));

function isPlayablePieceType(type: Piece['type']): type is PlayablePieceType {
  return (PLAYABLE_PIECE_TYPES as readonly Piece['type'][]).includes(type);
}

// Team palettes: each side is assigned a body color so the two armies read apart.
const SIDE_PALETTE: Record<Piece['side'], UnitPalette> = {
  player: 'navy-blue',
  enemy: 'crimson',
  neutral: 'navy-blue',
};

// Neutral rocks: two boulder variants x 8 rotations. Pick deterministically from the
// piece id so each rock on the board looks distinct (no repeated-blob feel) yet stays
// stable across re-renders.
const ROCK_VARIANTS = ['boulder', 'granite'] as const;
const ROCK_DIRECTIONS = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'] as const;
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rockSpritePath(piece: Piece): string {
  const h = hashId(piece.id);
  const variant = ROCK_VARIANTS[h % ROCK_VARIANTS.length];
  const dir = ROCK_DIRECTIONS[(h >>> 5) % ROCK_DIRECTIONS.length];
  return `/assets/units/rock/${variant}/${dir}.png`;
}

// Prop colliders are neutral `rock` pieces stamped under a multi-cell prop (id `prop-…`); their
// VISUAL is the one tall PropSprite, so the collider itself must draw nothing — without this
// guard the rock branch below would paint a phantom boulder on every footprint cell.
const isPropCollider = (piece: Piece): boolean => piece.id.startsWith('prop-');

function pieceImageSrc(piece: Piece): string | null {
  if (isPropCollider(piece)) return null;
  if (piece.type === 'rock' || piece.type === 'random-rock') return rockSpritePath(piece);
  if (piece.side === 'neutral' || !isPlayablePieceType(piece.type)) return null;
  return pieceSpritePath(piece.type, SIDE_PALETTE[piece.side], piece.facing ?? defaultFacingForSide(piece.side));
}

function terrainMapForGame(game: GameState): TileFamilyId[] {
  const byKey = new Map((game.terrain ?? []).map((cell) => [`${cell.x},${cell.y}`, terrainFamilyForGame(cell.terrain)]));
  const map: TileFamilyId[] = [];
  for (let y = 0; y < game.size.rows; y += 1) {
    for (let x = 0; x < game.size.cols; x += 1) {
      map.push(byKey.get(`${x},${y}`) ?? 'grass');
    }
  }
  return map;
}

function voidTerrainKeys(game: GameState): Set<string> {
  return new Set((game.terrain ?? []).filter((cell) => cell.terrain === 'void').map((cell) => `${cell.x},${cell.y}`));
}

function legacyFeatureMapForGame(game: GameState): Map<string, { kind: FeatureKind; material: FeatureMaterial }> | undefined {
  const map = new Map<string, { kind: FeatureKind; material: FeatureMaterial }>();
  for (const cell of game.terrain ?? []) {
    if (cell.terrain === 'road') map.set(`${cell.x},${cell.y}`, { kind: 'road', material: 'cobble' });
  }
  return map.size ? map : undefined;
}

function featureOverlaysForBoard(board: EditorBoard): Record<string, { kind: FeatureKind; material: FeatureMaterial; mask: number }> {
  const isSevered = (edge: string): boolean => board.featureCuts[edge] === true;
  const isExit = (edge: string): boolean => board.featureExits[edge] === true;
  const presentByKind: Record<FeatureKind, Set<string>> = { road: new Set(), river: new Set(), fence: new Set() };
  for (const [key, feature] of Object.entries(board.features)) presentByKind[feature.kind].add(key);

  const out: Record<string, { kind: FeatureKind; material: FeatureMaterial; mask: number }> = {};
  for (const [key, feature] of Object.entries(board.features)) {
    const [x, y] = key.split(',').map(Number);
    const mask = featureMaskAt(presentByKind[feature.kind], x, y, isSevered, isExit);
    out[key] = { kind: feature.kind, material: feature.material, mask };
  }
  return out;
}

function resolveBoardCode(game: GameState): EditorBoard | null {
  if (!game.boardCode) return null;
  const board = decodeBoard(game.boardCode);
  if (!board || board.cols !== game.size.cols || board.rows !== game.size.rows) return null;
  return board;
}

function coverMapForGame(game: GameState, exactBoard: EditorBoard | null): Map<string, 'sparse' | 'filled'> {
  if (exactBoard) return new Map(Object.entries(exactBoard.cover));
  return new Map((game.terrain ?? []).filter((cell) => cell.cover).map((cell) => [`${cell.x},${cell.y}`, cell.cover!.density]));
}

function resolveSkirmishGroundCover(
  result: SocketBoardResult<TileAsset>,
  game: GameState,
  seed: number,
  exactBoard: EditorBoard | null,
): SocketBoardResult<TileAsset> {
  // Resolve ambient ground cover ONCE here (placement/build time), not per render.
  // Painted cover (level data) is authoritative; a level with NO cover painted at all
  // falls back to a low-frequency density field so generated/legacy boards still grow grass.
  const painted = coverMapForGame(game, exactBoard);
  const hasPainted = exactBoard ? true : painted.size > 0;
  resolveGroundCover(result.cells, seed, (cell) =>
    painted.get(`${cell.x},${cell.y}`) ?? (hasPainted ? null : densityFieldAt(cell.x, cell.y, seed)),
  );
  const voids = voidTerrainKeys(game);
  if (voids.size > 0) {
    for (const cell of result.cells) {
      if (!voids.has(`${cell.x},${cell.y}`)) continue;
      cell.asset = undefined;
      cell.sideAsset = undefined;
      cell.feature = undefined;
      cell.groundCover = undefined;
      cell.missing = undefined;
    }
  }
  return result;
}

function generatedSkirmishBoard(game: GameState, seed: number): SocketBoardResult<TileAsset> {
  return solveSocketBoard({
    assets: tileAssets,
    terrainMap: terrainMapForGame(game),
    seed,
    columns: game.size.cols,
    rows: game.size.rows,
    familyAssets: tileFamilies,
    featureMap: legacyFeatureMapForGame(game),
    edgeAssets: edgeTiles,
  });
}

function exactSkirmishBoard(
  game: GameState,
  seed: number,
  exactBoard: EditorBoard,
  base: SocketBoardResult<TileAsset>,
): SocketBoardResult<TileAsset> {
  const featureOverlays = featureOverlaysForBoard(exactBoard);
  const cells: SocketBoardCell<TileAsset>[] = base.cells.map((cell) => {
    const key = `${cell.x},${cell.y}`;
    const exactAsset = tileAssetById.get(exactBoard.cells[key]);
    const exactFeature = featureOverlays[key];
    const feature = exactFeature && !(FENCE_ART_PENDING && exactFeature.kind === 'fence') ? exactFeature : undefined;
    if (!exactAsset) return { ...cell, feature };

    const terrain = familyIdForAsset(exactAsset, tileFamilies);
    return {
      ...cell,
      asset: exactAsset,
      sideAsset: undefined,
      terrain,
      sockets: tileSocketsForAsset(exactAsset, tileFamilies),
      feature,
      missing: undefined,
    };
  });

  return resolveSkirmishGroundCover({
    cells,
    fallbacks: base.fallbacks,
    stats: {
      placed: cells.length,
      missingPlacements: cells.filter((cell) => !cell.asset).length,
      illegalEdges: countIllegalEdges(cells, tileFamilies),
      candidateAssets: base.stats.candidateAssets,
    },
  }, game, seed, exactBoard);
}

export function buildSkirmishBoard(game: GameState, seed: number): SocketBoardResult<TileAsset> {
  const base = generatedSkirmishBoard(game, seed);
  const exactBoard = resolveBoardCode(game);
  if (!exactBoard) return resolveSkirmishGroundCover(base, game, seed, null);
  return exactSkirmishBoard(game, seed, exactBoard, base);
}

function terrainBlocks(env: ReturnType<typeof useSkirmish.getState>['env'], piece: Piece, x: number, y: number): boolean {
  return !!env.terrain && !canTraverse(env.terrain, elevationAt(env.terrain, piece.x, piece.y), x, y);
}

function addBlockedStep(
  out: Map<string, Vec>,
  piece: Piece,
  pieces: readonly Piece[],
  size: BoardSize,
  env: ReturnType<typeof useSkirmish.getState>['env'],
  x: number,
  y: number,
): boolean {
  if (!inBounds(x, y, size)) return false;
  const occ = pieceAt(pieces, x, y);
  if (terrainBlocks(env, piece, x, y) || (occ && !isEnemy(piece, occ))) {
    out.set(`${x},${y}`, { x, y });
    return false;
  }
  return !occ;
}

function blockedCandidateSquares(piece: Piece, pieces: readonly Piece[], size: BoardSize, env: ReturnType<typeof useSkirmish.getState>['env']): Vec[] {
  const blocked = new Map<string, Vec>();
  if (piece.type === 'rock' || piece.type === 'random-rock') return [];
  const ray = (dirs: ReadonlyArray<readonly [number, number]>) => {
    for (const [dx, dy] of dirs) {
      for (let step = 1; ; step += 1) {
        if (!addBlockedStep(blocked, piece, pieces, size, env, piece.x + dx * step, piece.y + dy * step)) break;
      }
    }
  };
  const step = (deltas: ReadonlyArray<readonly [number, number]>) => {
    for (const [dx, dy] of deltas) addBlockedStep(blocked, piece, pieces, size, env, piece.x + dx, piece.y + dy);
  };
  if (piece.type === 'pawn') {
    const dir = piece.side === 'player' ? -1 : 1;
    addBlockedStep(blocked, piece, pieces, size, env, piece.x, piece.y + dir);
    for (const dx of [-1, 1]) addBlockedStep(blocked, piece, pieces, size, env, piece.x + dx, piece.y + dir);
  } else if (piece.type === 'knight') {
    step([[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]);
  } else if (piece.type === 'king') {
    step([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
  } else {
    const diag: ReadonlyArray<readonly [number, number]> = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const ortho: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    ray(piece.type === 'bishop' ? diag : piece.type === 'rook' ? ortho : [...ortho, ...diag]);
  }
  return [...blocked.values()];
}

// Every image URL the board will draw, split into the STABLE tile set (terrain/seed —
// unchanged by play) and the live unit set (changes on capture). The reveal arms on the
// tile signature so it fires once per board, not once per move; the full list is what we
// preload so units don't popcorn in on the first paint either. The -top/-side derivation
// mirrors BoardLabBoard exactly (one tile = a SIDE layer under a TOP layer, ADR-0039).
function collectBoardArt(
  board: SocketBoardResult<TileAsset>,
  livePieces: readonly Piece[],
): { urls: string[]; signature: string } {
  const tiles = new Set<string>();
  for (const cell of board.cells) {
    if (cell.asset) {
      const top = tileFrameSrc(cell.asset);
      tiles.add(top.replace(/\.png$/, '-top.png'));
      const side = cell.sideAsset ? tileFrameSrc(cell.sideAsset) : top;
      tiles.add(side.replace(/\.png$/, '-side.png'));
    }
    if (cell.feature) tiles.add(featureFrameSrc(cell.feature.kind, cell.feature.material, cell.feature.mask));
    const cover = cell.groundCover;
    if (cover) {
      const set = groundCoverSet(cell.terrain);
      if (set) for (const tuft of cover.tufts) tiles.add(`${set.basePath}/v${tuft.variant}.png`);
    }
  }
  const units = new Set<string>();
  for (const piece of livePieces) {
    const src = pieceImageSrc(piece);
    if (src) units.add(src);
  }
  return {
    urls: [...new Set([...tiles, ...units])],
    signature: [...tiles].sort().join('|'),
  };
}

// Deploy choreography: when the board first reveals, the armies arrive in a staggered
// wave rather than all popping in at once (see ADR — board-start unit arrival). Order is
// communication: the PLAYER force lands first (back row → forward), then the ENEMY answers
// from its edge, each wave ending on its royal piece (king/queen) as a focal accent — so the
// motion alone teaches mine-vs-theirs and turn-taking before turn 1. Neutral rocks are
// scenery, not deploying units, so they get no drop (null delay → they just appear with the
// board). Timing is bounded (~1.2s total) and presentation-only — board state and input are
// live immediately, so the sequence never gates play.
const ARRIVAL_BASE_MS = 400; // first unit lands AFTER the board reveal (veil/board fade) has finished
const ARRIVAL_WAVE_GAP_MS = 240; // the enemy wave answers this long after the player wave starts
const ARRIVAL_STEP_MS = 50; // per-unit stagger within a wave
// The spawn→drop keyframe (unit-arrival) is ~620ms; the land impact is at ~85% of it —
// that fraction is where the per-unit sound cue + landing effect will hook in (see style.css).
export const ARRIVAL_TOTAL_MS = 1700; // upper bound: hold `is-arriving` at least this long

const isRoyal = (type: Piece['type']): boolean => type === 'king' || type === 'queen';

function computeArrivalDelays(pieces: readonly Piece[]): Map<string, number> {
  const delays = new Map<string, number>();
  (['player', 'enemy'] as const).forEach((side, wave) => {
    const group = pieces.filter((p) => p.side === side && p.type !== 'rock' && p.type !== 'random-rock');
    // Order within the wave: by rows out from the home edge (startY), royals last.
    group.sort((a, b) => {
      if (isRoyal(a.type) !== isRoyal(b.type)) return isRoyal(a.type) ? 1 : -1;
      const da = Math.abs(a.y - (a.startY ?? a.y));
      const db = Math.abs(b.y - (b.startY ?? b.y));
      return da !== db ? da - db : a.x - b.x;
    });
    const waveBase = ARRIVAL_BASE_MS + wave * ARRIVAL_WAVE_GAP_MS;
    group.forEach((p, i) => delays.set(p.id, waveBase + i * ARRIVAL_STEP_MS));
  });
  return delays;
}

function UnitPiece({
  piece,
  selected = false,
  focused = false,
  arriving = false,
  arrivalDelay = 0,
}: {
  piece: Piece;
  selected?: boolean;
  focused?: boolean;
  /** Play the one-shot deploy drop (board start), staggered by `arrivalDelay`. */
  arriving?: boolean;
  arrivalDelay?: number;
}) {
  const { left, top, zIndex } = boardLabCellPosition(piece);
  const [displayPosition, setDisplayPosition] = useState({ left, top });
  const [isMoving, setIsMoving] = useState(false);
  const previousGridRef = useRef({ x: piece.x, y: piece.y });
  const src = pieceImageSrc(piece);
  const maxHp = pieceMaxHp(piece);
  const hp = Math.max(0, pieceHp(piece));

  useEffect(() => {
    const previous = previousGridRef.current;
    previousGridRef.current = { x: piece.x, y: piece.y };
    if (previous.x === piece.x && previous.y === piece.y) {
      setDisplayPosition({ left, top });
      return undefined;
    }

    setIsMoving(true);
    const frame = window.requestAnimationFrame(() => setDisplayPosition({ left, top }));
    // Hold `is-moving` long enough to cover the full hop (lift → arc → settle),
    // including the weightier enemy timing (--move-duration in style.css).
    const done = window.setTimeout(() => setIsMoving(false), 520);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(done);
    };
  }, [left, piece.x, piece.y, top]);

  return (
    <div
      className={[
        'board-unit-seat',
        'skirmish-board-unit',
        `is-${piece.side}`,
        `is-${piece.type}`,
        isMoving ? 'is-moving' : '',
        arriving ? 'is-arriving' : '',
        selected ? 'is-selected' : '',
        focused ? 'is-focused' : '',
      ].filter(Boolean).join(' ')}
      style={{
        left: displayPosition.left,
        top: displayPosition.top,
        zIndex: zIndex + 20000,
        ...(arriving ? { ['--arrival-delay' as string]: `${arrivalDelay}ms` } : {}),
      } as CSSProperties}
      aria-label={`${piece.side} ${piece.type}`}
    >
      {src ? <img src={src} alt="" draggable={false} /> : <span>{PIECE_MARK[piece.type] ?? '?'}</span>}
      {maxHp > 1 && piece.side !== 'neutral' ? (
        <i className="skirmish-board-hp" aria-hidden="true">
          <b style={{ width: `${(hp / maxHp) * 100}%` }} />
        </i>
      ) : null}
    </div>
  );
}

export function SkirmishBoard() {
  // Board-view state lives in the shared view store so the HUD's "View" tab owns
  // the controls and the playfield stays clean of floating buttons.
  const showMoves = useSkirmishView((s) => s.showMoves);
  const showEnemyAttacks = useSkirmishView((s) => s.showEnemyAttacks);
  const showBlocked = useSkirmishView((s) => s.showBlocked);
  const showEnemyMoves = useSkirmishView((s) => s.showEnemyMoves);
  const showPlayerAttacks = useSkirmishView((s) => s.showPlayerAttacks);
  const showPlayerMoves = useSkirmishView((s) => s.showPlayerMoves);
  const boardZoom = useSkirmishView((s) => s.zoom);
  const boardPan = useSkirmishView((s) => s.pan);
  const setZoom = useSkirmishView((s) => s.setZoom);
  const setBoardPan = useSkirmishView((s) => s.setPan);
  const game = useSkirmish((s) => s.game);
  const env = useSkirmish((s) => s.env);
  const selectedId = useSkirmish((s) => s.selectedId);
  const focusedId = useSkirmish((s) => s.focusedId);
  const seed = useSkirmish((s) => s.seed);
  const select = useSkirmish((s) => s.select);
  const focus = useSkirmish((s) => s.focus);
  const tryMoveTo = useSkirmish((s) => s.tryMoveTo);
  const selectedMoves = useMemo(() => {
    if (game.turn !== 'player' || game.winner) return [];
    const piece = game.pieces.find((candidate) => candidate.id === selectedId && candidate.alive && candidate.side === 'player');
    return piece ? legalMoves(piece, game.pieces, game.size, env) : [];
  }, [env, game.pieces, game.size, game.turn, game.winner, selectedId]);
  const board = useMemo(() => buildSkirmishBoard(game, seed), [game, seed]);
  const livePieces = useMemo(
    // Prop colliders (`prop-…`) block movement but render as the tall PropSprite, not a unit
    // seat — exclude them so they don't paint an empty/phantom seat over their footprint cells.
    () => game.pieces.filter((piece) => piece.alive && !isPropCollider(piece)).sort((a, b) => a.x + a.y - (b.x + b.y)),
    [game.pieces],
  );
  // Hold the board hidden until its whole art set has decoded, then fade it in as one
  // unit — no per-tile popcorn (see render/boardArtReady). The signature is the tile set
  // (stable across moves), so this arms once per board/seed, not on every move.
  const boardArt = useMemo(() => collectBoardArt(board, livePieces), [board, livePieces]);
  const boardReady = useBoardArtReveal(boardArt.urls, boardArt.signature);
  // Deploy arrival: once the board reveals, play the staggered drop ONCE per board. Keyed off
  // the tile signature so a new skirmish/replay re-arms it, but moves (signature stable) don't.
  const arrivalDelays = useMemo(() => computeArrivalDelays(livePieces), [livePieces]);
  // `arriving` is derived DURING render (not pushed from an effect) so `is-arriving` lands in
  // the SAME commit the board first reveals. If it lagged a commit, there'd be one painted
  // frame where units sit at their seats (the old "just appear" look) before the drop's
  // fill-mode hides them — reading as units appearing, vanishing, then dropping in. A timer
  // flips arrivalDone when the whole wave is done so the class comes off for normal play.
  const [arrivalDone, setArrivalDone] = useState(false);
  useEffect(() => { setArrivalDone(false); }, [boardArt.signature]);
  useEffect(() => {
    if (!boardReady || arrivalDone) return undefined;
    const done = window.setTimeout(() => setArrivalDone(true), ARRIVAL_TOTAL_MS);
    return () => window.clearTimeout(done);
  }, [boardReady, arrivalDone]);
  const arriving = boardReady && !arrivalDone;
  const focusPiece = useMemo(
    () => livePieces.find((piece) => piece.id === focusedId) ?? livePieces.find((piece) => piece.id === selectedId) ?? null,
    [focusedId, livePieces, selectedId],
  );
  const focusedMoves: Move[] = useMemo(
    () => (focusPiece ? legalMoves(focusPiece, game.pieces, game.size, env) : []),
    [env, focusPiece, game.pieces, game.size],
  );
  const overlayMoves = focusPiece ? focusedMoves : selectedMoves;
  const moveSet = useMemo(() => new Set((showMoves ? overlayMoves : []).map((move) => `${move.x},${move.y}`)), [overlayMoves, showMoves]);
  const threatSet = useMemo(() => {
    if (!showEnemyAttacks) return new Set<string>();
    const tiles = focusPiece?.side === 'enemy' ? attackedSquares(focusPiece, game.pieces, game.size) : enemyThreats(game.pieces, game.size);
    return new Set(tiles.map((tile) => `${tile.x},${tile.y}`));
  }, [focusPiece, game.pieces, game.size, showEnemyAttacks]);
  const blockedSet = useMemo(() => {
    if (!showBlocked || !focusPiece) return new Set<string>();
    const legal = new Set(overlayMoves.map((move) => `${move.x},${move.y}`));
    return new Set(blockedCandidateSquares(focusPiece, game.pieces, game.size, env).filter((tile) => !legal.has(`${tile.x},${tile.y}`)).map((tile) => `${tile.x},${tile.y}`));
  }, [env, focusPiece, game.pieces, game.size, overlayMoves, showBlocked]);
  // Army-wide display layers driven by the in-match shortcut grid: each is the union
  // over one whole side of that kind of square, independent of the focused piece.
  const armyLayer = (enabled: boolean, tilesFor: (p: Piece) => Vec[], side: 'player' | 'enemy') => {
    if (!enabled) return new Set<string>();
    const out = new Set<string>();
    for (const p of livingPieces(game.pieces, side)) for (const t of tilesFor(p)) out.add(`${t.x},${t.y}`);
    return out;
  };
  const enemyMoveSet = useMemo(
    () => armyLayer(showEnemyMoves, (p) => legalMoves(p, game.pieces, game.size, env), 'enemy'),
    [env, game.pieces, game.size, showEnemyMoves],
  );
  const playerAttackSet = useMemo(
    () => armyLayer(showPlayerAttacks, (p) => attackedSquares(p, game.pieces, game.size), 'player'),
    [game.pieces, game.size, showPlayerAttacks],
  );
  const playerMoveSet = useMemo(
    () => armyLayer(showPlayerMoves, (p) => legalMoves(p, game.pieces, game.size, env), 'player'),
    [env, game.pieces, game.size, showPlayerMoves],
  );

  const handleTile = (x: number, y: number) => {
    const here = game.pieces.find((piece) => piece.alive && piece.x === x && piece.y === y);
    if (selectedMoves.some((move) => move.x === x && move.y === y)) {
      tryMoveTo(x, y);
    } else if (here && here.side === 'player') {
      select(here.id);
    } else if (here && here.side === 'enemy') {
      focus(here.id);
    } else {
      tryMoveTo(x, y);
    }
  };

  return (
    <div data-testid="skirmish-board" className={`skirmish-board-lab ${boardReady ? '' : 'is-board-loading'}`.trim()}>
      <ViewPane
        kind="board"
        ariaLabel="Skirmish board viewport"
        zoom={boardZoom}
        pan={boardPan}
        minZoom={0.55}
        maxZoom={1.45}
        onZoomChange={setZoom}
        onPanChange={setBoardPan}
      >
        <BoardLabBoard
          board={board}
          assetFrameSrc={tileFrameSrc}
          boardZoom={boardZoom}
          boardPan={boardPan}
          className="skirmish-board-surface"
          ariaLabel="Skirmish board"
          renderCellOverlay={({ cell }) => {
            if (!cell.asset && !cell.missing) return null;
            const key = `${cell.x},${cell.y}`;
            const state = [
              playerMoveSet.has(key) ? 'is-player-move' : '',
              enemyMoveSet.has(key) ? 'is-enemy-move' : '',
              playerAttackSet.has(key) ? 'is-player-attack' : '',
              moveSet.has(key) ? 'is-move' : '',
              threatSet.has(key) ? 'is-threat' : '',
              blockedSet.has(key) ? 'is-blocked-candidate' : '',
              game.pieces.some((piece) => piece.id === selectedId && piece.alive && piece.x === cell.x && piece.y === cell.y) ? 'is-selected' : '',
              focusPiece && focusPiece.x === cell.x && focusPiece.y === cell.y ? 'is-focused-piece' : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                type="button"
                className={`skirmish-board-cell-hit ${state}`}
                aria-label={`Tile ${cell.x},${cell.y}`}
                onPointerDown={(event) => {
                  // Right-click-and-hold always pans the board — navigation matters more than
                  // any per-cell action, so never swallow it even when the press lands on a unit.
                  // Left-click stays on the cell: stop it bubbling so ViewPane doesn't start a pan.
                  if (event.button === 2) return;
                  event.stopPropagation();
                }}
                onClick={() => handleTile(cell.x, cell.y)}
              />
            );
          }}
        >
          <GroundCoverLayer cells={board.cells} />
          {(game.props ?? []).map((prop) => (
            <PropSprite key={`prop-${prop.propId}-${prop.x}-${prop.y}`} prop={prop} />
          ))}
          {livePieces.map((piece) => (
            <UnitPiece
              key={piece.id}
              piece={piece}
              selected={piece.id === selectedId}
              focused={piece.id === focusPiece?.id}
              arriving={arriving && arrivalDelays.has(piece.id)}
              arrivalDelay={arrivalDelays.get(piece.id) ?? 0}
            />
          ))}
        </BoardLabBoard>
      </ViewPane>
    </div>
  );
}
