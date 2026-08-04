import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildDeploymentLabFlowRun,
  buildDeploymentLabSnapshot,
  deploymentLabFlowIssue,
  deploymentLabRowCoordinates,
  generateDeploymentLabCrew,
  generateNextDeploymentLabCrew,
  readDeploymentLabRoute,
  writeDeploymentLabRouteParams,
  type DeploymentLabConfig,
} from './DeploymentLab';
import {
  advanceDeployAll,
  chooseDeploymentMode,
  currentDeploymentUnit,
  deploymentInteractionStage,
  deploymentOptions,
  disciplinePlacementCells,
  placeAdlectedDeploymentUnit,
} from '../run/deployment';
import { PLAYABLE_PIECE_TYPES } from '../core/pieces';

function config(patch: Partial<DeploymentLabConfig> = {}): DeploymentLabConfig {
  return { ...readDeploymentLabRoute(''), ...patch };
}

describe('Deployment Lab', () => {
  it('runs the six-piece Eutactic map through the canonical placer across five rows', () => {
    const snapshot = buildDeploymentLabSnapshot(config({
      units: PLAYABLE_PIECE_TYPES.map((type) => ({ type, abilities: ['eutactic'] })),
    }));
    const traceByType = new Map(snapshot.layout.trace.map((trace) => [trace.type, trace]));

    expect(deploymentLabRowCoordinates(config())).toEqual([3, 4, 5, 6, 7]);
    expect(traceByType.get('pawn')).toMatchObject({ eutacticTargetRow: 3, selectedRow: 3 });
    expect(traceByType.get('knight')).toMatchObject({ eutacticTargetRow: 4, selectedRow: 4 });
    expect(traceByType.get('bishop')).toMatchObject({ eutacticTargetRow: 4, selectedRow: 4 });
    expect(traceByType.get('rook')).toMatchObject({ eutacticTargetRow: 7, selectedRow: 7 });
    expect(traceByType.get('queen')).toMatchObject({ eutacticTargetRow: 7, selectedRow: 7 });
    expect(traceByType.get('king')).toMatchObject({
      automaticOrder: 1,
      eutacticTargetRow: 7,
      selectedRow: 7,
    });
  });

  it('deals a deterministic random crew and single abilities from the seed', () => {
    const first = generateDeploymentLabCrew(4217);
    const repeat = generateDeploymentLabCrew(4217);
    const next = generateDeploymentLabCrew(4218);

    expect(repeat).toEqual(first);
    expect(next).not.toEqual(first);
    expect(next.map((unit) => unit.type)).not.toEqual(first.map((unit) => unit.type));
    expect(next.map((unit) => unit.abilities)).not.toEqual(first.map((unit) => unit.abilities));
    expect(first.length).toBeGreaterThanOrEqual(6);
    expect(first.length).toBeLessThanOrEqual(10);
    expect(first.filter((unit) => unit.type === 'king')).toHaveLength(1);
    expect(first.slice(0, 3).map((unit) => unit.type)).toEqual(['king', 'pawn', 'pawn']);
    const abilityOrder = ['adlected', 'eutactic', 'agminate'] as const;
    for (const unit of first) {
      expect(unit.abilities).toEqual(
        abilityOrder.filter((ability) => unit.abilities.includes(ability)),
      );
      expect(unit.abilities.length).toBeLessThanOrEqual(1);
    }
    expect(first.slice(3).every((unit) => unit.cardIndex !== undefined)).toBe(true);
  });

  it('makes Generate choose a fresh seed instead of requiring one to be set first', () => {
    const generated = generateNextDeploymentLabCrew(4217, () => 4218 / 100_000);
    const collision = generateNextDeploymentLabCrew(4218, () => 4218 / 100_000);

    expect(generated).toEqual({ seed: 4218, units: generateDeploymentLabCrew(4218) });
    expect(collision.seed).toBe(4219);
    expect(collision.units).toEqual(generateDeploymentLabCrew(4219));
  });

  it('shows best-fit fallback when obstacles consume the target row', () => {
    const snapshot = buildDeploymentLabSnapshot(config({
      files: 4,
      deploymentRows: 3,
      units: [{ type: 'pawn', abilities: ['eutactic'] }],
      obstacles: ['0,3', '1,3', '2,3', '3,3'],
    }));

    expect(snapshot.layout.trace[0]).toMatchObject({
      type: 'pawn',
      eutacticTargetRow: 3,
      eutacticBestRows: [4],
      selectedRow: 4,
      candidateCount: 4,
      chosen: { y: 4 },
    });
  });

  it('keeps optional King geometry distinct from the Eutactic preference', () => {
    const snapshot = buildDeploymentLabSnapshot(config({
      deploymentRows: 4,
      kingRegion: 'back',
      units: [{ type: 'king', abilities: ['eutactic'] }],
    }));

    expect(snapshot.level.layers.zones.find((zone) => zone.type === 'player-spawn')?.excludedPieceTypes)
      .toContain('king');
    expect(snapshot.layout.trace[0]).toMatchObject({
      eligibleCellCount: 8,
      eutacticTargetRowIndex: 0,
      eutacticTargetRow: 6,
      selectedRow: 6,
    });
  });

  it('round-trips an exact multi-row roster and manual case through the Studio URL', () => {
    const original = config({
      files: 10,
      deploymentRows: 6,
      rowGap: 1,
      seed: 99,
      kingRegion: 'back',
      units: [
        { type: 'pawn', abilities: ['adlected'], cardIndex: 0 },
        { type: 'queen', abilities: ['agminate'], cardIndex: 1 },
      ],
      obstacles: ['2,5', '1,3'],
      manualPlacements: { 0: '4,3' },
    });
    const params = writeDeploymentLabRouteParams(
      new URLSearchParams('mode=viewer&cat=deployment&vk=deployment'),
      original,
    );
    const restored = readDeploymentLabRoute(`?${params.toString()}`);

    expect(restored).toEqual({
      ...original,
      obstacles: ['1,3', '2,5'],
    });
    expect(params.get('mode')).toBe('viewer');
    expect(params.get('du')).toBe('p.d.0,q.a.1');
    expect(params.has('dl')).toBe(false);
    expect(params.has('dmr')).toBe(false);
    expect(params.has('dsc')).toBe(false);
  });

  it('builds a valid player-flow Run and commits its real choices into Battle', () => {
    const flowConfig = config();
    const initial = buildDeploymentLabFlowRun(flowConfig);
    const level = initial.war.battles[0].level;
    expect(initial.phase).toBe('deployment');
    expect(initial.army).toContainEqual(expect.objectContaining({ id: 'run-king', type: 'king' }));
    expect(initial.deployment?.manualPlacements).toEqual({});
    expect(initial.cards.slice(0, 2).map((card) => card.coreId)).toEqual(['his-grace', 'front-lines']);
    expect(initial.deployment?.dealtCardIds).toHaveLength(3);
    expect(level.layers.units).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'king', side: 'enemy' }),
      expect.objectContaining({ type: 'pawn', side: 'enemy' }),
    ]));

    let battle = chooseDeploymentMode(initial, level, 'deploy-all');
    while (battle.phase === 'deployment') {
      const active = currentDeploymentUnit(battle);
      expect(active).not.toBeNull();
      if (deploymentInteractionStage(battle) === 'adlected') {
        const legal = disciplinePlacementCells(battle, deploymentOptions(battle, level), active!.id)[0];
        battle = placeAdlectedDeploymentUnit(battle, level, legal);
      } else {
        battle = advanceDeployAll(battle, level);
      }
    }
    expect(battle.phase).toBe('battle');
    expect(battle.battleRuntime?.initiallyDeployedUnitIds).toContain('run-king');
  });

  it('explains why an invalid roster cannot launch the real player flow', () => {
    expect(deploymentLabFlowIssue(config({ units: [] }))).toMatch(/at least one unit/i);
    expect(deploymentLabFlowIssue(config({ units: [{ type: 'queen', abilities: [] }] }))).toMatch(/King/i);
    expect(deploymentLabFlowIssue(config())).toBeNull();
  });

  it('is registered as both a Catalog category and Viewer kind', () => {
    const studio = readFileSync(new URL('./TilePreview.tsx', import.meta.url), 'utf8');
    expect(studio).toContain("id: 'deployment', label: 'Deployment Lab'");
    expect(studio).toContain("openViewer('deployment')");
    expect(studio).toContain("viewerKind === 'deployment'");
    expect(studio).toContain('<DeploymentLabViewer />');
  });
});
