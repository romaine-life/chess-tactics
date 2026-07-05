import {
  CAMPAIGN_FORMAT_VERSION,
  LEVEL_FORMAT_VERSION,
  type Campaign,
  type Level,
  type ObjectiveType,
} from '../core/level';
import type { PieceType, Side, TerrainCell, TerrainType, UnitFacing } from '../core/types';

interface DemoLevelSpec {
  id: string;
  name: string;
  objective: ObjectiveType;
  difficulty: string;
  terrain: 'river' | 'fort' | 'highland' | 'road' | 'islands' | 'ruins';
  completed?: boolean;
  notes: string;
}

const COLS = 12;
const ROWS = 8;

function terrainFor(pattern: DemoLevelSpec['terrain']): TerrainCell[] {
  const cells: TerrainCell[] = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      let terrain: TerrainType = 'grass';
      let elevation = 0;
      if (pattern === 'river' && (x === 5 || x === 6)) terrain = y === 3 || y === 4 ? 'bridge' : 'water';
      if (pattern === 'fort' && (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1)) terrain = 'stone';
      if (pattern === 'fort' && x > 7 && y < 4) elevation = 1;
      if (pattern === 'highland' && x + y > 12) elevation = 1;
      if (pattern === 'highland' && (x === 2 || y === 5)) terrain = 'rock';
      if (pattern === 'road' && (x === y + 2 || x === y + 3 || y === 4)) terrain = 'road';
      if (pattern === 'islands' && ((x < 3 && y < 3) || (x > 8 && y > 4))) terrain = 'water';
      if (pattern === 'islands' && x === 6 && y > 1 && y < 6) terrain = 'bridge';
      if (pattern === 'ruins' && (x + y) % 7 === 0) terrain = 'stone';
      if (pattern === 'ruins' && (x === 4 || x === 8) && y > 1 && y < 7) terrain = 'road';
      cells.push({ x, y, terrain, elevation });
    }
  }
  return cells;
}

function unit(x: number, y: number, type: PieceType, side: Side, facing?: UnitFacing) {
  return facing ? { x, y, type, side, facing } : { x, y, type, side };
}

function emptyTerrain(cols: number, rows: number): TerrainCell[] {
  const cells: TerrainCell[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) cells.push({ x, y, terrain: 'grass', elevation: 0 });
  }
  return cells;
}

function createPawnCompassTerrain(): TerrainCell[] {
  const cells = emptyTerrain(12, 12);
  const at = (x: number, y: number): TerrainCell | undefined => cells.find((cell) => cell.x === x && cell.y === y);
  const set = (x: number, y: number, terrain: TerrainType): void => {
    const cell = at(x, y);
    if (cell) cell.terrain = terrain;
  };
  const roadCells: Array<[number, number]> = [
    [1, 9], [1, 8], [1, 7],
    [3, 8], [4, 7], [5, 6],
    [1, 5], [2, 5], [3, 5],
    [3, 2], [4, 3], [5, 4],
    [6, 2], [6, 3], [6, 4],
    [9, 2], [8, 3], [7, 4],
    [10, 5], [9, 5], [8, 5],
    [9, 8], [8, 7], [7, 6],
  ];
  roadCells.forEach(([x, y]) => set(x, y, 'road'));
  [[10, 10], [11, 10], [10, 11]].forEach(([x, y]) => set(x, y, 'rock'));
  return cells;
}

function createPawnCompassLevel(): Level {
  return {
    formatVersion: LEVEL_FORMAT_VERSION,
    id: 'demo-valoria-pawn-compass',
    name: 'Pawn Compass',
    notes: 'Eight pawns face eight directions; each has an open one-step and double-step lane. The enemy king is boxed in so you can test without an enemy reply changing the board.',
    board: { cols: 12, rows: 12, heightLevels: 1 },
    objective: 'capture-all',
    difficulty: 'normal',
    economy: { startingFunds: 1200, incomePerTurn: 150 },
    theme: 'grassland',
    layers: {
      terrain: createPawnCompassTerrain(),
      decals: [],
      zones: [],
      units: [
        unit(1, 9, 'pawn', 'player', 'north'),
        unit(3, 8, 'pawn', 'player', 'north-east'),
        unit(1, 5, 'pawn', 'player', 'east'),
        unit(3, 2, 'pawn', 'player', 'south-east'),
        unit(6, 2, 'pawn', 'player', 'south'),
        unit(9, 2, 'pawn', 'player', 'south-west'),
        unit(10, 5, 'pawn', 'player', 'west'),
        unit(9, 8, 'pawn', 'player', 'north-west'),
        unit(11, 11, 'king', 'enemy', 'north'),
      ],
    },
  };
}

// Every set fields a King on BOTH sides, so any level built from these can only be
// 'rival-kings' among the King modes — 'capture-king' (King Assault) requires exactly
// one side to hold a King (validatePlayability P2), which these sets can't satisfy.
function unitsFor(index: number) {
  const playerBack = ROWS - 2;
  const enemyFront = 1;
  const sets = [
    [unit(1, playerBack, 'king', 'player'), unit(2, playerBack - 1, 'rook', 'player'), unit(4, playerBack, 'knight', 'player'), unit(10, enemyFront, 'king', 'enemy'), unit(9, enemyFront + 1, 'rook', 'enemy'), unit(7, enemyFront, 'bishop', 'enemy')],
    [unit(2, playerBack, 'king', 'player'), unit(3, playerBack - 1, 'bishop', 'player'), unit(5, playerBack, 'pawn', 'player'), unit(9, enemyFront, 'king', 'enemy'), unit(8, enemyFront + 1, 'queen', 'enemy'), unit(10, enemyFront + 2, 'pawn', 'enemy')],
    [unit(1, playerBack - 1, 'king', 'player'), unit(3, playerBack, 'queen', 'player'), unit(5, playerBack - 2, 'knight', 'player'), unit(10, enemyFront + 1, 'king', 'enemy'), unit(8, enemyFront, 'rook', 'enemy'), unit(7, enemyFront + 2, 'knight', 'enemy')],
  ];
  return sets[index % sets.length];
}

function createDemoLevel(spec: DemoLevelSpec, index: number): Level {
  return {
    formatVersion: LEVEL_FORMAT_VERSION,
    id: spec.id,
    name: spec.name,
    notes: spec.notes,
    board: { cols: COLS, rows: ROWS, heightLevels: 2 },
    objective: spec.objective,
    difficulty: spec.difficulty,
    economy: {
      startingFunds: 1000 + (index % 4) * 200,
      incomePerTurn: 120 + (index % 3) * 40,
    },
    theme: spec.terrain === 'river' || spec.terrain === 'islands' ? 'riverlands' : 'grassland',
    layers: {
      terrain: terrainFor(spec.terrain),
      decals: [],
      zones: [],
      units: unitsFor(index),
    },
  };
}

const campaignSpecs: Array<{
  id: string;
  name: string;
  difficulty: string;
  favorite?: boolean;
  locked?: boolean;
  unlockRequirement?: string;
  levels: DemoLevelSpec[];
}> = [
  {
    id: 'demo-crown-valoria',
    name: 'Crown of Valoria',
    difficulty: 'normal',
    favorite: true,
    levels: [
      { id: 'demo-valoria-break-line', name: 'Break the Line', objective: 'rival-kings', difficulty: 'normal', terrain: 'road', completed: true, notes: 'Punch through the central road before the enemy can consolidate.' },
      { id: 'demo-valoria-river-crossing', name: 'River Crossing', objective: 'capture-all', difficulty: 'normal', terrain: 'river', completed: true, notes: 'Cross the river and clear the island. Watch enemy range over the bridges.' },
      { id: 'demo-valoria-hold-bridge', name: 'Hold the Bridge', objective: 'survive', difficulty: 'hard', terrain: 'river', completed: true, notes: 'Survive the assault until reinforcements arrive.' },
      { id: 'demo-valoria-fortress-gate', name: 'Fortress Gate', objective: 'rival-kings', difficulty: 'hard', terrain: 'fort', completed: true, notes: 'Enemy pieces begin from elevated stone ground.' },
      { id: 'demo-valoria-high-ground', name: 'High Ground', objective: 'reach', difficulty: 'normal', terrain: 'highland', notes: 'Take the ridge without losing the king.' },
      { id: 'demo-valoria-pinned', name: 'Pinned', objective: 'capture-all', difficulty: 'normal', terrain: 'ruins', notes: 'A compact tactical puzzle with blocked lines and tempo traps.' },
    ],
  },
  {
    id: 'demo-iron-marshes',
    name: 'Iron Marshes',
    difficulty: 'hard',
    levels: [
      { id: 'demo-marshes-sunken-road', name: 'Sunken Road', objective: 'reach', difficulty: 'normal', terrain: 'road', completed: true, notes: 'Escort the king across a narrow wetland causeway.' },
      { id: 'demo-marshes-blackwater', name: 'Blackwater', objective: 'survive', difficulty: 'hard', terrain: 'islands', completed: true, notes: 'Hold scattered islands while enemy bishops control the crossings.' },
      { id: 'demo-marshes-iron-ford', name: 'Iron Ford', objective: 'capture-all', difficulty: 'hard', terrain: 'river', notes: 'A contested ford with short tactical lanes.' },
      { id: 'demo-marshes-broken-causeway', name: 'Broken Causeway', objective: 'rival-kings', difficulty: 'hard', terrain: 'islands', notes: 'Find a route through the fractured crossing.' },
    ],
  },
  {
    id: 'demo-silver-coast',
    name: 'Silver Coast',
    difficulty: 'easy',
    levels: [
      { id: 'demo-coast-landing', name: 'Landing Party', objective: 'capture-all', difficulty: 'easy', terrain: 'islands', completed: true, notes: 'A gentle introduction to island movement.' },
      { id: 'demo-coast-lighthouse', name: 'Lighthouse', objective: 'reach', difficulty: 'normal', terrain: 'highland', completed: true, notes: 'Reach the lighthouse ridge before the enemy blocks the path.' },
      { id: 'demo-coast-tidewatch', name: 'Tidewatch', objective: 'survive', difficulty: 'normal', terrain: 'river', notes: 'Survive while enemy pieces attack from both banks.' },
    ],
  },
  {
    id: 'demo-frostgate',
    name: 'Frostgate',
    difficulty: 'hard',
    levels: [
      { id: 'demo-frostgate-first-snow', name: 'First Snow', objective: 'rival-kings', difficulty: 'hard', terrain: 'fort', notes: 'A locked northern campaign preview.' },
    ],
  },
  {
    id: 'demo-ember-reach',
    name: 'Ember Reach',
    difficulty: 'hard',
    levels: [
      { id: 'demo-ember-ash-road', name: 'Ash Road', objective: 'capture-all', difficulty: 'hard', terrain: 'road', notes: 'Enemy rooks hold long lines over burned ground.' },
    ],
  },
  { id: 'demo-shadow-realm', name: 'Shadow Realm', difficulty: 'hard', locked: true, unlockRequirement: 'Clear Crown of Valoria', levels: [] },
  { id: 'demo-gilded-spires', name: 'Gilded Spires', difficulty: 'hard', locked: true, unlockRequirement: 'Complete Silver Coast', levels: [] },
  { id: 'demo-broken-crown', name: 'Broken Crown', difficulty: 'hard', locked: true, unlockRequirement: 'Complete Iron Marshes', levels: [] },
];

export function createDemoWorkspace(): { campaigns: Campaign[]; levels: Record<string, Level> } {
  const levels: Record<string, Level> = {};
  const campaigns: Campaign[] = campaignSpecs.map((campaignSpec) => {
    const refs = campaignSpec.levels.map((levelSpec, index) => {
      levels[levelSpec.id] = createDemoLevel(levelSpec, index);
      return {
        levelId: levelSpec.id,
        ordinal: index,
        objective: levelSpec.objective,
        completed: levelSpec.completed,
      };
    });
    if (campaignSpec.id === DEMO_SELECTED_CAMPAIGN_ID) {
      const pawnCompass = createPawnCompassLevel();
      levels[pawnCompass.id] = pawnCompass;
      refs.push({ levelId: pawnCompass.id, ordinal: refs.length, objective: pawnCompass.objective, completed: undefined });
    }
    return {
      formatVersion: CAMPAIGN_FORMAT_VERSION,
      id: campaignSpec.id,
      name: campaignSpec.name,
      difficulty: campaignSpec.difficulty,
      chapters: Math.max(1, Math.ceil(refs.length / 3)),
      favorite: campaignSpec.favorite ?? false,
      locked: campaignSpec.locked ?? false,
      unlockRequirement: campaignSpec.unlockRequirement,
      levels: refs,
    };
  });
  return { campaigns, levels };
}

export const DEMO_SELECTED_CAMPAIGN_ID = 'demo-crown-valoria';
export const DEMO_SELECTED_LEVEL_ID = 'demo-valoria-river-crossing';
