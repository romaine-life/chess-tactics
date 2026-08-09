// @ts-nocheck — source-level regression guard for the Level Editor's War panel placement.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LEVEL_EDITOR_ROUTE_LAYERS,
  isLevelEditorLayerKey,
  readLevelEditorRouteState,
} from './levelEditorRoute';

const source = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const between = (open: string, close: string): string => {
  const start = source.indexOf(open);
  const end = source.indexOf(close, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe('War layer route', () => {
  it('is an addressable panel of its own', () => {
    expect(LEVEL_EDITOR_ROUTE_LAYERS).toContain('war');
    expect(isLevelEditorLayerKey('war')).toBe(true);
    expect(readLevelEditorRouteState('?layer=war&warId=off-w-war')).toMatchObject({ layer: 'war' });
  });

  it('opens on the pointer, not a brush', () => {
    expect(source).toContain("|| layer === 'war'");
    expect(source).toContain("{ id: 'war', label: 'War' }");
  });
});

describe('War panel contents', () => {
  const warPanel = between("layer === 'war' ?", "layer === 'level-artwork' ?");
  const rulesPanel = between("layer === 'rules' ?", "layer === 'war' ?");

  it('owns the Deployment deal, which Rules no longer carries', () => {
    expect(warPanel).toContain('<h2>Deployment deal</h2>');
    expect(warPanel).toContain("ariaLabel: 'Cards dealt at Deployment'");
    expect(rulesPanel).not.toContain('Deployment deal');
    expect(rulesPanel).not.toContain('Cards dealt');
  });

  it('reports the expected player value beside the force the board puts up', () => {
    expect(warPanel).toContain('<h2>Expected player value</h2>');
    expect(warPanel).toContain('warValueHere.playerValue');
    expect(warPanel).toContain('warValueHere.enemy.value');
    expect(warPanel).toContain('warValueHere.advantage');
    // The whole War's curve, so a deal count can be judged against its neighbours.
    expect(warPanel).toContain('<h2>Across the War</h2>');
    expect(warPanel).toContain('warEconomy.curve.map');
  });

  it('walks the economy from the LIVE candidate so painting a piece moves the numbers', () => {
    expect(source).toContain('position === index ? candidateLevel : warBattleLevels[battle.levelId]');
    expect(source).toContain('expectedWarValue(levels as Level[])');
  });

  it('says plainly that a level outside a War has no deal and no economy', () => {
    expect(warPanel).toContain('This level is not a War Battle.');
    expect(warPanel).toContain('to="/editor/wars"');
  });
});
