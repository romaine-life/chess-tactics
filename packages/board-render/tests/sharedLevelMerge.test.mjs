import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import boardRender from '../dist/index.cjs';
import { installTestDrawableCatalog, resetTestDrawableCatalog } from './drawableCatalog.mjs';

const { editorBoardToLevel, levelToEditorBoard, mergeSharedLevel } = boardRender;

before(installTestDrawableCatalog);
after(resetTestDrawableCatalog);

const board = (overrides = {}) => ({
  cols: 2,
  rows: 1,
  cells: { '0,0': 'grass-surf-0', '1,0': 'grass-surf-0' },
  units: {},
  doodads: {},
  props: {},
  cover: {},
  features: {},
  fences: {},
  fencePosts: {},
  walls: {},
  wallArt: {},
  featureCuts: {},
  featureExits: {},
  ...overrides,
});
const level = (value, name = 'Shared level') => editorBoardToLevel(value, {
  id: 'shared-1',
  name,
  objective: 'capture-all',
});

test('merges edits made to different board cells in different tabs', () => {
  const base = level(board());
  const local = level(board({ cells: { '0,0': 'stone-surf-0', '1,0': 'grass-surf-0' } }));
  const remote = level(board({ cells: { '0,0': 'grass-surf-0', '1,0': 'sand-surf-5' } }));

  const merged = mergeSharedLevel(base, local, remote);
  assert.deepEqual(levelToEditorBoard(merged).cells, {
    '0,0': 'stone-surf-0',
    '1,0': 'sand-surf-5',
  });
  assert.deepEqual(merged.layers.terrain.map(({ x, y, terrain }) => ({ x, y, terrain })), [
    { x: 0, y: 0, terrain: 'stone' },
    { x: 1, y: 0, terrain: 'sand' },
  ]);
});

test('keeps remote metadata while the later local arrival changes another field', () => {
  const base = level(board(), 'Shared level');
  const local = { ...base, objective: 'survive', surviveTurns: 8 };
  const remote = { ...base, name: 'Renamed elsewhere' };

  const merged = mergeSharedLevel(base, local, remote);
  assert.equal(merged.name, 'Renamed elsewhere');
  assert.equal(merged.objective, 'survive');
  assert.equal(merged.surviveTurns, 8);
});

test('orders simultaneous edits to the same value by server arrival', () => {
  const base = level(board(), 'Shared level');
  const local = { ...base, name: 'Local arrived last' };
  const remote = { ...base, name: 'Remote arrived first' };

  assert.equal(mergeSharedLevel(base, local, remote).name, 'Local arrived last');
});
