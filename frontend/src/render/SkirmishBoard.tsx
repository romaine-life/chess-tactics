import { useEffect, useMemo, useRef, useState } from 'react';
import { tileFrameSrc, tileAssets, tileFamilies, type TileAsset } from '../art/tileset';
import { solveSocketBoard, type SocketBoardResult } from '../core/tileBoardGenerator';
import type { BoardSize, Move, Piece, TerrainType, Vec } from '../core/types';
import { attackedSquares, enemyThreats, inBounds, isEnemy, legalMoves, pieceAt, pieceHp, pieceMaxHp } from '../core/rules';
import { canTraverse, elevationAt } from '../core/terrain';
import { PIECE_LABEL, PIECE_MARK, PLAYABLE_PIECE_TYPES, defaultFacingForSide, pieceSpritePath, type PlayablePieceType, type UnitPalette } from '../core/pieces';
import type { TileFamilyId } from '../core/tileSockets';
import { useSkirmish } from '../game/store';
import { BoardLabBoard, boardLabCellPosition } from './BoardLabBoard';
import { ViewPane } from '../ui/shared/ViewPane';

const TERRAIN_TO_FAMILY: Record<TerrainType, TileFamilyId> = {
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

function pieceImageSrc(piece: Piece): string | null {
  if (piece.type === 'rock' || piece.type === 'random-rock') return rockSpritePath(piece);
  if (piece.side === 'neutral' || !isPlayablePieceType(piece.type)) return null;
  return pieceSpritePath(piece.type, SIDE_PALETTE[piece.side], piece.facing ?? defaultFacingForSide(piece.side));
}

function pieceName(piece: Piece): string {
  return `${piece.side === 'player' ? 'Blue' : piece.side === 'enemy' ? 'Red' : 'Neutral'} ${PIECE_LABEL[piece.type]}`;
}

function terrainMapForGame(game: ReturnType<typeof useSkirmish.getState>['game']): TileFamilyId[] {
  const byKey = new Map((game.terrain ?? []).map((cell) => [`${cell.x},${cell.y}`, TERRAIN_TO_FAMILY[cell.terrain]]));
  const map: TileFamilyId[] = [];
  for (let y = 0; y < game.size.rows; y += 1) {
    for (let x = 0; x < game.size.cols; x += 1) {
      map.push(byKey.get(`${x},${y}`) ?? 'grass');
    }
  }
  return map;
}

function solveSkirmishBoard(
  game: ReturnType<typeof useSkirmish.getState>['game'],
  seed: number,
): SocketBoardResult<TileAsset> {
  return solveSocketBoard({
    assets: tileAssets,
    terrainMap: terrainMapForGame(game),
    seed,
    columns: game.size.cols,
    rows: game.size.rows,
    familyAssets: tileFamilies,
  });
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

function UnitPiece({ piece, selected = false, focused = false }: { piece: Piece; selected?: boolean; focused?: boolean }) {
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
        selected ? 'is-selected' : '',
        focused ? 'is-focused' : '',
      ].filter(Boolean).join(' ')}
      style={{ left: displayPosition.left, top: displayPosition.top, zIndex: zIndex + 20000 }}
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
  const [boardZoom, setBoardZoom] = useState(0.9);
  const [boardPan, setBoardPan] = useState({ x: 0, y: -12 });
  const [showMoves, setShowMoves] = useState(true);
  const [showEnemyAttacks, setShowEnemyAttacks] = useState(true);
  const [showBlocked, setShowBlocked] = useState(true);
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
  const board = useMemo(() => solveSkirmishBoard(game, seed), [game, seed]);
  const livePieces = useMemo(
    () => game.pieces.filter((piece) => piece.alive).sort((a, b) => a.x + a.y - (b.x + b.y)),
    [game.pieces],
  );
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

  const setZoom = (zoom: number) => setBoardZoom(Math.min(1.45, Math.max(0.55, Number(zoom.toFixed(2)))));

  return (
    <div data-testid="skirmish-board" className="skirmish-board-lab">
      <div className="skirmish-board-tools" aria-label="Board view controls">
        <button type="button" onClick={() => setZoom(boardZoom - 0.1)} aria-label="Zoom out">-</button>
        <span>{Math.round(boardZoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(boardZoom + 0.1)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => { setBoardZoom(0.9); setBoardPan({ x: 0, y: -12 }); }}>Reset</button>
        <button type="button" className={showMoves ? 'active' : ''} onClick={() => setShowMoves((value) => !value)} aria-pressed={showMoves}>Moves</button>
        <button type="button" className={showEnemyAttacks ? 'active' : ''} onClick={() => setShowEnemyAttacks((value) => !value)} aria-pressed={showEnemyAttacks}>Attacks</button>
        <button type="button" className={showBlocked ? 'active' : ''} onClick={() => setShowBlocked((value) => !value)} aria-pressed={showBlocked}>Blocks</button>
        <select value={focusPiece?.id ?? ''} onChange={(event) => focus(event.target.value || null)} aria-label="Focused overlay piece">
          <option value="">Selected piece</option>
          {livePieces.filter((piece) => piece.side !== 'neutral').map((piece) => (
            <option key={piece.id} value={piece.id}>{pieceName(piece)}</option>
          ))}
        </select>
      </div>
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
            const key = `${cell.x},${cell.y}`;
            const state = [
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
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => handleTile(cell.x, cell.y)}
              />
            );
          }}
        >
          {livePieces.map((piece) => (
            <UnitPiece
              key={piece.id}
              piece={piece}
              selected={piece.id === selectedId}
              focused={piece.id === focusPiece?.id}
            />
          ))}
        </BoardLabBoard>
      </ViewPane>
    </div>
  );
}
