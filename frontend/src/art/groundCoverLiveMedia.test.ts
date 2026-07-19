import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDrawableCatalog,
  applyGroundCoverCatalog,
  boardDrawOps,
  groundCoverSet,
  resetDrawableCatalog,
} from '@chess-tactics/board-render';
import type { EditorBoard } from '../ui/boardCode';
import { applyTestDrawableCatalog, testDrawableCatalog } from '../test/drawableCatalog';

afterEach(() => resetDrawableCatalog());

describe('ground-cover drawable projection', () => {
  it('hydrates installed sets, geometry, policy, and immutable URLs from drawable rows', () => {
    applyTestDrawableCatalog();

    expect(groundCoverSet('grass')).toMatchObject({ terrain: 'grass', frameCount: 6 });
    expect(groundCoverSet('grass')?.variants).toHaveLength(16);
    expect(groundCoverSet('grass')?.variants[0]).toMatchObject({
      id: 0, frameWidth: 40, frameHeight: 37, baseX: 20, baseY: 28, contentWidth: 18,
    });
    expect(groundCoverSet('grass')?.variants[0].src).toMatch(/^\/api\/media\/[0-9a-f]{64}$/);
    expect(groundCoverSet('water')).toMatchObject({ edgeOnly: true, count: { sparse: 2, filled: 3 } });
    expect(groundCoverSet('sand')).toMatchObject({ count: { sparse: 2, filled: 4 } });
  });

  it('drives the shared draw plan from the drawable snapshot', () => {
    applyTestDrawableCatalog();
    const board: EditorBoard = {
      cols: 1, rows: 1, cells: { '0,0': 'grass-surf-0' }, units: {}, doodads: {}, props: {},
      cover: { '0,0': 'filled' }, features: {}, featureCuts: {}, featureExits: {},
    };
    const sources = new Set(groundCoverSet('grass')!.variants.map((variant) => variant.src));
    const coverOps = boardDrawOps(board).filter((op) => sources.has(op.src));
    expect(coverOps.length).toBeGreaterThan(0);
    expect(coverOps.every((op) => op.sw === 40 && op.sh === 37 && op.dw === 40 && op.dh === 37)).toBe(true);
    expect(coverOps.every((op) => op.animation?.kind === 'ground-cover-sway' && op.animation.frameCount === 6)).toBe(true);
  });

  it('rejects invalid row geometry', () => {
    const catalog = testDrawableCatalog();
    const grass = catalog.assets.find((asset) => asset.id === 'ground-cover-grass')!;
    grass.behavior = { ...grass.behavior, variants: [{ role: 'v0', terrain: 'grass', id: 0, frameWidth: 0, frameHeight: 37, frameCount: 6, baseX: 20, baseY: 28, contentWidth: 18 }] };
    applyDrawableCatalog(catalog);
    expect(() => applyGroundCoverCatalog()).toThrow(/frame geometry/);
  });

  it('accepts a catalog-defined set without requiring a compiled roster', () => {
    const catalog = testDrawableCatalog();
    const grass = catalog.assets.find((asset) => asset.id === 'ground-cover-grass')!;
    catalog.assets = catalog.assets.filter((asset) => asset.kind !== 'ground-cover');
    catalog.assets.push({ ...grass, id: 'ground-cover-mud', label: 'Mud', behavior: { ...grass.behavior, terrain: 'mud', variants: (grass.behavior.variants as Array<Record<string, unknown>>).map((variant) => ({ ...variant, terrain: 'mud' })) } });
    applyDrawableCatalog(catalog);
    applyGroundCoverCatalog();
    expect(groundCoverSet('mud')).toBeDefined();
    expect(groundCoverSet('grass')).toBeUndefined();
  });
});
