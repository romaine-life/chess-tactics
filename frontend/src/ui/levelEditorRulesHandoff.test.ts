import { describe, expect, it } from 'vitest';
import { editorBoardToLevel } from '../core/levelBoard';
import { consumeRulesHandoff, stageRulesHandoff } from './levelEditorRulesHandoff';
import type { AuthoredRulesField } from './levelEditorRulesSeed';

const board = {
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
};
const level = (parTurns?: number) => editorBoardToLevel(board as never, {
  id: 'l7',
  name: 'Handoff level',
  objective: 'capture-all',
  parTurns,
});
const authored = (...fields: AuthoredRulesField[]) => new Set<AuthoredRulesField>(fields);

describe('levelEditorRulesHandoff', () => {
  it('carries the authored fields to the instance mounting on the same level', () => {
    stageRulesHandoff('l7', level(30), authored('par', 'clock'));
    const handoff = consumeRulesHandoff('l7');
    expect(handoff?.levelId).toBe('l7');
    expect(handoff?.level.parTurns).toBe(30);
    expect(handoff?.authored).toEqual(['par', 'clock']);
  });

  it('is one shot — the replacement adopts it, nothing after that does', () => {
    stageRulesHandoff('l7', level(30), authored('par'));
    expect(consumeRulesHandoff('l7')).not.toBeNull();
    expect(consumeRulesHandoff('l7')).toBeNull();
  });

  it('never crosses to another level, and clears the slot on the way past', () => {
    stageRulesHandoff('l7', level(30), authored('par'));
    expect(consumeRulesHandoff('l9')).toBeNull();
    // The mismatched mount consumed nothing, but the stale slot must not survive it either:
    // a remount that did not happen cannot leak an edit into some later unrelated open.
    expect(consumeRulesHandoff('l7')).toBeNull();
  });

  it('carries nothing when the owner authored nothing, so an ordinary open stays clean', () => {
    stageRulesHandoff('l7', level(30), authored());
    expect(consumeRulesHandoff('l7')).toBeNull();
  });

  it('drops templateChoice, which is page-local and cannot be read back out of a Level', () => {
    stageRulesHandoff('l7', level(), authored('templateChoice'));
    expect(consumeRulesHandoff('l7')).toBeNull();

    stageRulesHandoff('l7', level(30), authored('templateChoice', 'par'));
    expect(consumeRulesHandoff('l7')?.authored).toEqual(['par']);
  });

  it('adopts nothing on a route with no level id', () => {
    stageRulesHandoff('l7', level(30), authored('par'));
    expect(consumeRulesHandoff(undefined)).toBeNull();
  });
});
