import { applyLiveMediaCatalog, resetDrawableCatalog, resetLiveMediaCatalog, subterrainMaterialSrc } from '@chess-tactics/board-render';
import { afterEach, describe, expect, it } from 'vitest';
import { tileFamilies } from '../art/tileset';
import { baseSocketsForFamily } from '../core/tileSockets';
import type { SocketBoardCell } from '../core/tileBoardGenerator';
import { boardLabTerrainCanvasCells, immutableBoardLabTerrainSrc, resolveBoardLabTerrainSrc } from './BoardLabBoard';
import { testGroundCoverCatalog } from '../test/liveMediaCatalog';
import { applyTestDrawableCatalog } from '../test/drawableCatalog';

function hydrateSlot(slot: string, sha256 = 'a'.repeat(64)): void {
  const catalog = testGroundCoverCatalog([{
      slot,
      domain: 'terrain',
      role: slot.includes('-side.') ? 'side' : 'animation',
      availabilityPolicy: 'critical',
      activeVersionId: '00000000-0000-4000-8000-000000000001',
      rowRevision: 4,
      metadata: {},
      versionStatus: 'accepted',
      productionEligible: true,
      versionMetadata: {},
      provenance: {},
      nativeEvidence: {},
      media: {
        url: `/assets/${slot}`,
        immutableUrl: `/api/media/${sha256}`,
        sha256,
        mediaType: 'image/png',
        width: 96,
        height: 180,
        byteLength: 512,
      },
    }]);
  catalog.revision = 9;
  catalog.updatedAt = '2026-07-11T00:00:00.000Z';
  applyLiveMediaCatalog(catalog);
}

afterEach(() => { resetLiveMediaCatalog(); resetDrawableCatalog(); });

describe('BoardLabBoard terrain review source', () => {
  it('keeps animated Water tops isolated from a side candidate', () => {
    const asset = tileFamilies.water[0];
    const cell: SocketBoardCell<typeof asset> = {
      x: 0,
      y: 0,
      asset,
      terrain: 'water',
      sockets: baseSocketsForFamily('water'),
    };
    const sideOnly = (stableSrc: string) => stableSrc.endsWith('-side.png') ? '/api/admin/media/side' : undefined;
    hydrateSlot('tiles/surface/water-0-top-anim.png');

    expect(resolveBoardLabTerrainSrc(asset.src, 'top', { cell, asset }, sideOnly))
      .toBe(asset.src);
  });

  it('accepts only the immutable URL already projected with the drawable row', () => {
    expect(immutableBoardLabTerrainSrc(`/api/media/${'b'.repeat(64)}`)).toBe(`/api/media/${'b'.repeat(64)}`);
    expect(() => immutableBoardLabTerrainSrc('/assets/tiles/surface/water-0-side.png')).toThrow(/not immutable/);
  });

  it('keeps unpainted faces empty and explicit subterrain clipped by exposure', () => {
    applyTestDrawableCatalog();
    const base = tileFamilies.water[0];
    hydrateSlot('tiles/surface/dirt-0-side.png');
    const cells: SocketBoardCell<typeof base>[] = [
      {
        x: 0,
        y: 0,
        asset: base,
        terrain: 'water',
        sockets: baseSocketsForFamily('water'),
      },
      {
        x: 1,
        y: 0,
        asset: base,
        terrain: 'water',
        sockets: baseSocketsForFamily('water'),
      },
    ];

    const [first] = boardLabTerrainCanvasCells(cells, (asset) => asset.src, (stableSrc) => stableSrc, {
      '0,0:south': 'earth',
      '0,0:east': 'earth',
    });
    expect(first.sideFaces).toEqual({
      south: { exposed: true, material: subterrainMaterialSrc('earth') },
      east: { exposed: false, material: subterrainMaterialSrc('earth') },
    });
  });
});
