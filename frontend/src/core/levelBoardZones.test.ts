import { describe, it, expect } from 'vitest';
import { editorBoardToLevel, levelToEditorBoard } from './levelBoard';
import type { EditorBoard } from '../ui/boardCode';
import { decodeBoard } from '../ui/boardCode';
import { createBlankLevel } from './level';
import type { Roster } from './level';

const board = (over: Partial<EditorBoard> = {}): EditorBoard => ({
  cols: 6, rows: 6, cells: {}, units: {}, doodads: {}, props: {}, cover: {}, features: {}, featureCuts: {}, featureExits: {}, zones: {}, ...over,
});

describe('levelBoard — zone projection into layers.zones', () => {
  it('projects the per-cell zones channel into one Zone per type with stable `z-<type>` ids', () => {
    const level = editorBoardToLevel(
      board({ zones: { '0,0': 'player-spawn', '1,0': 'player-spawn', '5,5': 'enemy-spawn', '2,3': 'objective' } }),
      { id: 'l1', name: 'Z' },
    );
    const byType = Object.fromEntries(level.layers.zones.map((z) => [z.type, z]));
    expect(byType['player-spawn'].id).toBe('z-player-spawn');
    // Two player-spawn cells pool into ONE zone entry (playability pools per-type anyway).
    expect(byType['player-spawn'].tiles).toEqual([[0, 0], [1, 0]]);
    expect(byType['enemy-spawn'].tiles).toEqual([[5, 5]]);
    expect(byType.objective.tiles).toEqual([[2, 3]]);
  });

  it('preserves authored zone entries without merging same-type or empty zones', () => {
    const level = editorBoardToLevel(
      board({
        zoneEntries: [
          { id: 'zone-1', name: 'North landing', color: 'blue', type: 'region', tiles: ['0,0'] },
          { id: 'zone-2', name: 'South landing', color: 'red', type: 'region', tiles: ['1,0'] },
          { id: 'zone-3', name: 'Empty label', color: 'gold', type: 'region', tiles: [] },
        ],
      }),
      { id: 'promo', name: 'Promotion Zones' },
    );
    expect(level.layers.zones).toEqual([
      { id: 'zone-1', name: 'North landing', color: 'blue', type: 'region', tiles: [[0, 0]] },
      { id: 'zone-2', name: 'South landing', color: 'red', type: 'region', tiles: [[1, 0]] },
      { id: 'zone-3', name: 'Empty label', color: 'gold', type: 'region', tiles: [] },
    ]);
    const reopened = levelToEditorBoard(level);
    expect(reopened.zoneEntries).toEqual([
      { id: 'zone-1', name: 'North landing', color: 'blue', type: 'region', tiles: ['0,0'] },
      { id: 'zone-2', name: 'South landing', color: 'red', type: 'region', tiles: ['1,0'] },
      { id: 'zone-3', name: 'Empty label', color: 'gold', type: 'region', tiles: [] },
    ]);
  });

  it('emits stable ids so re-serializing the same board never churns them', () => {
    const b = board({ zones: { '3,3': 'objective' } });
    const a = editorBoardToLevel(b, { id: 'l', name: 'A' });
    const c = editorBoardToLevel(b, { id: 'l', name: 'A' });
    expect(a.layers.zones).toEqual(c.layers.zones);
  });

  it('a zone-free board yields layers.zones []', () => {
    const level = editorBoardToLevel(board(), { id: 'l2', name: 'None' });
    expect(level.layers.zones).toEqual([]);
  });

  it('boardCode carries zones losslessly so a reopen restores the channel', () => {
    const level = editorBoardToLevel(board({ zones: { '4,4': 'player-spawn' } }), { id: 'l3', name: 'RT' });
    const fromCode = decodeBoard(level.boardCode!)!;
    expect(fromCode.zones).toEqual({ '4,4': 'player-spawn' });
    const reopened = levelToEditorBoard(level);
    expect(reopened.zones).toEqual({ '4,4': 'player-spawn' });
  });

  it('projects the type bars and the dedicated zones into layers.zones and back', () => {
    const level = editorBoardToLevel(board({
      zoneEntries: [
        { id: 'z-player', name: 'Player Deployment', type: 'player-spawn', excludedPieceTypes: ['pawn'], tiles: ['0,0', '1,0'] },
        { id: 'z-pawn', name: 'Pawn Deployment', type: 'player-pawn-spawn', tiles: ['1,0', '2,0'] },
      ],
    }), { id: 'l-pawn', name: 'Pawn zones' });
    expect(level.layers.zones).toEqual([
      { id: 'z-player', name: 'Player Deployment', type: 'player-spawn', excludedPieceTypes: ['pawn'], tiles: [[0, 0], [1, 0]] },
      { id: 'z-pawn', name: 'Pawn Deployment', type: 'player-pawn-spawn', tiles: [[1, 0], [2, 0]] },
    ]);
    expect(levelToEditorBoard(level).zoneEntries).toEqual([
      { id: 'z-player', name: 'Player Deployment', type: 'player-spawn', excludedPieceTypes: ['pawn'], tiles: ['0,0', '1,0'] },
      { id: 'z-pawn', name: 'Pawn Deployment', type: 'player-pawn-spawn', tiles: ['1,0', '2,0'] },
    ]);
  });

  it('keeps a switched-off dedicated zone out of the Level while retaining its squares', () => {
    // The King is not barred from the shared pool, so its zone is switched off (ADR-0365): the
    // Level must not carry it, and the editor must not lose the squares already painted into it.
    const authored = board({
      zoneEntries: [
        { id: 'z-player', name: 'Player Deployment', type: 'player-spawn', excludedPieceTypes: ['pawn'], tiles: ['0,0', '1,0'] },
        { id: 'z-pawn', name: 'Pawn Deployment', type: 'player-pawn-spawn', tiles: ['2,0'] },
        { id: 'z-king', name: 'King Deployment', type: 'player-king-spawn', tiles: ['3,0', '4,0'] },
      ],
    });
    const level = editorBoardToLevel(authored, { id: 'l-off', name: 'Switched off' });
    expect(level.layers.zones.map((zone) => zone.id)).toEqual(['z-player', 'z-pawn']);
    // Reopening restores the retained King geometry, so switching it back on returns those squares.
    const king = levelToEditorBoard(level).zoneEntries?.find((entry) => entry.type === 'player-king-spawn');
    expect(king?.tiles).toEqual(['3,0', '4,0']);
  });

  it('a saved Level can never hold two Player Deployment zones', () => {
    const level = editorBoardToLevel(board({
      zoneEntries: [
        { id: 'z-a', name: 'Player Deployment', type: 'player-spawn', tiles: ['0,0'] },
        { id: 'z-b', name: 'Player Deployment 2', type: 'player-spawn', tiles: ['1,0'] },
      ],
    }), { id: 'l-dupe', name: 'Duplicates' });
    expect(level.layers.zones).toEqual([
      { id: 'z-a', name: 'Player Deployment', type: 'player-spawn', tiles: [[0, 0], [1, 0]] },
    ]);
  });

  it('legacy fallback (no boardCode, has layers.zones) rebuilds the zones channel', () => {
    const level = createBlankLevel('legacy', 'L', 8, 8);
    level.layers.zones = [
      { id: 'z-player-spawn', type: 'player-spawn', tiles: [[0, 0], [1, 0]] },
      { id: 'z-objective', type: 'objective', tiles: [[7, 7]] },
    ];
    delete level.boardCode; // force the layers-derived path
    const derived = levelToEditorBoard(level);
    expect(derived.zones).toEqual({ '0,0': 'player-spawn', '1,0': 'player-spawn', '7,7': 'objective' });
  });
});

describe('levelBoard — resize pruning of zone tiles', () => {
  it('drops zone tiles that fall outside the (clamped) board bounds on projection', () => {
    // A board shrunk to 4×4 whose channel still holds a zone at (5,5): the out-of-bounds tile must
    // NOT survive into layers.zones (mirrors how units/props are pruned on resize).
    const level = editorBoardToLevel(
      board({ cols: 4, rows: 4, zones: { '1,1': 'player-spawn', '5,5': 'player-spawn' } }),
      { id: 'l4', name: 'Shrunk' },
    );
    const spawn = level.layers.zones.find((z) => z.type === 'player-spawn')!;
    expect(spawn.tiles).toEqual([[1, 1]]); // (5,5) dropped
  });

  it('drops out-of-bounds zone tiles when rebuilding the channel from layers', () => {
    const level = createBlankLevel('legacy', 'L', 4, 4);
    level.layers.zones = [{ id: 'z-enemy-spawn', type: 'enemy-spawn', tiles: [[2, 2], [9, 9]] }];
    delete level.boardCode;
    const derived = levelToEditorBoard(level);
    expect(derived.zones).toEqual({ '2,2': 'enemy-spawn' }); // (9,9) dropped
  });
});

describe('levelBoard — ADR-0050 mode meta fields', () => {
  it('writes objective/placement/roster/surviveTurns/timeControl from meta onto the Level', () => {
    const roster: { player: Roster; enemy: Roster } = { player: { pawn: 3, knight: 1 }, enemy: { pawn: 2 } };
    const level = editorBoardToLevel(board(), {
      id: 'l5', name: 'M', objective: 'survive', placement: 'random', roster, surviveTurns: 12,
      timeControl: { initialSeconds: 300, incrementSeconds: 2 },
    });
    expect(level.objective).toBe('survive');
    expect(level.placement).toBe('random');
    expect(level.roster).toEqual(roster);
    expect(level.surviveTurns).toBe(12);
    expect(level.timeControl).toEqual({ initialSeconds: 300, incrementSeconds: 2 });
  });

  it('writes authored non-victory events from meta onto the Level', () => {
    const events = [{ name: 'Deploy', trigger: { kind: 'setup' as const }, do: [{ kind: 'spawn' as const, side: 'player' as const, roster: { pawn: 1 }, zoneIds: ['z'] }] }];
    const level = editorBoardToLevel(board(), { id: 'l-events', name: 'Events', events });
    expect(level.events).toEqual(events);
  });

  it('omits the optional mode fields when meta leaves them undefined (back-compat)', () => {
    // A level that never touched the RULES panel serializes WITHOUT placement/roster/surviveTurns/
    // timeControl, so an absent field reads as fixed / no roster / DEFAULT_SURVIVE_TURNS / untimed
    // — same as a legacy body.
    const level = editorBoardToLevel(board(), { id: 'l6', name: 'Plain' });
    expect(level.objective).toBe('capture-all'); // default, always written
    expect('placement' in level).toBe(false);
    expect('roster' in level).toBe(false);
    expect('surviveTurns' in level).toBe(false);
    expect('timeControl' in level).toBe(false);
  });
});
