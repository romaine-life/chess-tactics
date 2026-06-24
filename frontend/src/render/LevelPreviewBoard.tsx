import { useMemo, type ReactElement } from 'react';
import { tileAssets, tileFamilies, tileFrameSrc, type TileAsset } from '../art/tileset';
import { PIECE_MARK, PLAYABLE_PIECE_TYPES, pieceSpritePath, type PlayablePieceType, type UnitPalette } from '../core/pieces';
import { solveSocketBoard, type SocketBoardResult } from '../core/tileBoardGenerator';
import type { TileFamilyId } from '../core/tileSockets';
import type { Level, LevelUnit, TerrainType } from '../core/level';
import { BoardLabBoard, boardLabCellPosition } from './BoardLabBoard';

const TERRAIN_TO_FAMILY: Record<TerrainType, TileFamilyId> = {
  grass: 'grass',
  road: 'stone',
  stone: 'stone',
  bridge: 'stone',
  cliff: 'stone',
  dirt: 'dirt',
  pebble: 'pebble',
  sand: 'sand',
  rock: 'stone',
  water: 'water',
};

const SIDE_PALETTE: Record<LevelUnit['side'], UnitPalette> = {
  player: 'navy-blue',
  enemy: 'crimson',
  neutral: 'navy-blue',
};

function stableSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function isPlayablePieceType(type: LevelUnit['type']): type is PlayablePieceType {
  return (PLAYABLE_PIECE_TYPES as readonly LevelUnit['type'][]).includes(type);
}

function terrainMapForLevel(level: Level): TileFamilyId[] {
  const byKey = new Map(level.layers.terrain.map((cell) => [`${cell.x},${cell.y}`, TERRAIN_TO_FAMILY[cell.terrain]]));
  const map: TileFamilyId[] = [];
  for (let y = 0; y < level.board.rows; y += 1) {
    for (let x = 0; x < level.board.cols; x += 1) {
      map.push(byKey.get(`${x},${y}`) ?? 'grass');
    }
  }
  return map;
}

function solveLevelBoard(level: Level): SocketBoardResult<TileAsset> {
  return solveSocketBoard({
    assets: tileAssets,
    terrainMap: terrainMapForLevel(level),
    seed: stableSeed(level.id),
    columns: level.board.cols,
    rows: level.board.rows,
    familyAssets: tileFamilies,
  });
}

function PreviewUnitPiece({ unit, compact = false }: { unit: LevelUnit; compact?: boolean }): ReactElement {
  const { left, top, zIndex } = boardLabCellPosition(unit);
  const src = unit.side !== 'neutral' && isPlayablePieceType(unit.type) ? pieceSpritePath(unit.type, SIDE_PALETTE[unit.side]) : null;

  return (
    <div
      className={`level-preview-unit is-${unit.side} is-${unit.type} ${compact ? 'is-compact' : ''}`.trim()}
      style={{ left, top, zIndex: zIndex + 40 }}
      aria-label={`${unit.side} ${unit.type}`}
    >
      {src ? <img src={src} alt="" draggable={false} /> : <span>{PIECE_MARK[unit.type] ?? '?'}</span>}
    </div>
  );
}

export function LevelPreviewBoard({
  level,
  compact = false,
  ariaLabel,
}: {
  level: Level | null;
  compact?: boolean;
  ariaLabel?: string;
}): ReactElement {
  const board = useMemo(() => (level ? solveLevelBoard(level) : null), [level]);
  const liveUnits = useMemo(() => (level ? level.layers.units.slice().sort((a, b) => a.x + a.y - (b.x + b.y)) : []), [level]);

  if (!level || !board) {
    return (
      <div className={`level-preview-empty ${compact ? 'is-compact' : ''}`.trim()} aria-label={ariaLabel ?? 'No level preview'}>
        <span>Select a level.</span>
      </div>
    );
  }

  return (
    <div className={`level-preview-board ${compact ? 'is-compact' : ''}`.trim()}>
      <BoardLabBoard
        board={board}
        assetFrameSrc={tileFrameSrc}
        boardZoom={compact ? 0.22 : 0.5}
        boardPan={{ x: 0, y: compact ? -7 : -18 }}
        className="level-preview-board-surface"
        ariaLabel={ariaLabel ?? `${level.name} board preview`}
      >
        {liveUnits.map((unit, index) => <PreviewUnitPiece key={`${unit.x}-${unit.y}-${unit.type}-${unit.side}-${index}`} unit={unit} compact={compact} />)}
      </BoardLabBoard>
    </div>
  );
}
