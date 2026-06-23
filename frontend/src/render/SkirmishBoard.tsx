import { useMemo } from 'react';
import { tileFrameSrc, tileAssets, tileFamilies, type TileAsset } from '../art/tileset';
import { solveSocketBoard, type SocketBoardResult } from '../core/tileBoardGenerator';
import type { Piece, TerrainType } from '../core/types';
import { enemyThreats, legalMoves, pieceHp, pieceMaxHp } from '../core/rules';
import { PIECE_MARK, PLAYABLE_PIECE_TYPES, pieceSpritePath, type PlayablePieceType, type UnitPalette } from '../core/pieces';
import type { TileFamilyId } from '../core/tileSockets';
import { useSkirmish } from '../game/store';
import { BoardLabBoard, boardLabCellPosition } from './BoardLabBoard';

const TERRAIN_TO_FAMILY: Record<TerrainType, TileFamilyId> = {
  grass: 'grass',
  road: 'stone',
  stone: 'stone',
  bridge: 'stone',
  cliff: 'stone',
  rock: 'stone',
  water: 'water',
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

function pieceImageSrc(piece: Piece): string | null {
  if (piece.side === 'neutral' || !isPlayablePieceType(piece.type)) return null;
  return pieceSpritePath(piece.type, SIDE_PALETTE[piece.side]);
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

function UnitPiece({ piece }: { piece: Piece }) {
  const { left, top, zIndex } = boardLabCellPosition(piece);
  const src = pieceImageSrc(piece);
  const maxHp = pieceMaxHp(piece);
  const hp = Math.max(0, pieceHp(piece));

  return (
    <div
      className={`skirmish-board-unit is-${piece.side} is-${piece.type}`}
      style={{ left, top, zIndex: zIndex + 40 }}
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
  const game = useSkirmish((s) => s.game);
  const env = useSkirmish((s) => s.env);
  const selectedId = useSkirmish((s) => s.selectedId);
  const seed = useSkirmish((s) => s.seed);
  const select = useSkirmish((s) => s.select);
  const tryMoveTo = useSkirmish((s) => s.tryMoveTo);
  const moves = useMemo(() => {
    if (game.turn !== 'player' || game.winner) return [];
    const piece = game.pieces.find((candidate) => candidate.id === selectedId && candidate.alive && candidate.side === 'player');
    return piece ? legalMoves(piece, game.pieces, game.size, env) : [];
  }, [env, game.pieces, game.size, game.turn, game.winner, selectedId]);
  const moveSet = useMemo(() => new Set(moves.map((move) => `${move.x},${move.y}`)), [moves]);
  const threatSet = useMemo(() => new Set(enemyThreats(game.pieces, game.size).map((tile) => `${tile.x},${tile.y}`)), [game.pieces, game.size]);
  const board = useMemo(() => solveSkirmishBoard(game, seed), [game, seed]);
  const livePieces = useMemo(
    () => game.pieces.filter((piece) => piece.alive).sort((a, b) => a.x + a.y - (b.x + b.y)),
    [game.pieces],
  );

  const handleTile = (x: number, y: number) => {
    const here = game.pieces.find((piece) => piece.alive && piece.x === x && piece.y === y);
    if (here && here.side === 'player') select(here.id);
    else tryMoveTo(x, y);
  };

  return (
    <div data-testid="skirmish-board" className="skirmish-board-lab">
      <BoardLabBoard
        board={board}
        assetFrameSrc={tileFrameSrc}
        boardZoom={0.78}
        boardPan={{ x: 0, y: -18 }}
        className="skirmish-board-surface"
        ariaLabel="Skirmish board"
        renderCellOverlay={({ cell }) => {
          const key = `${cell.x},${cell.y}`;
          const state = [
            moveSet.has(key) ? 'is-move' : '',
            threatSet.has(key) ? 'is-threat' : '',
            game.pieces.some((piece) => piece.id === selectedId && piece.alive && piece.x === cell.x && piece.y === cell.y) ? 'is-selected' : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              type="button"
              className={`skirmish-board-cell-hit ${state}`}
              aria-label={`Tile ${cell.x},${cell.y}`}
              onClick={() => handleTile(cell.x, cell.y)}
            />
          );
        }}
      >
        {livePieces.map((piece) => <UnitPiece key={piece.id} piece={piece} />)}
      </BoardLabBoard>
    </div>
  );
}
