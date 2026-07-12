import { applyLiveMediaCatalog, resetLiveMediaCatalog } from '@chess-tactics/board-render';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tileFamilies } from '../art/tileset';
import { baseSocketsForFamily } from '../core/tileSockets';
import type { SocketBoardCell } from '../core/tileBoardGenerator';
import { boardLabTerrainCanvasCells, immutableBoardLabTerrainSrc, resolveBoardLabTerrainSrc } from './BoardLabBoard';

function hydrateSlot(slot: string, sha256 = 'a'.repeat(64)): void {
  applyLiveMediaCatalog({
    schemaVersion: 1,
    revision: 9,
    updatedAt: '2026-07-11T00:00:00.000Z',
    slots: [{
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
    }],
  });
}

afterEach(() => resetLiveMediaCatalog());

describe('BoardLabBoard terrain review source', () => {
  it('offers the exact side slot to the override after top/side transformation', () => {
    const asset = tileFamilies.water[3];
    const cell: SocketBoardCell<typeof asset> = {
      x: 0,
      y: 0,
      asset,
      sideAssets: { south: asset },
      terrain: 'water',
      sockets: baseSocketsForFamily('water'),
    };
    const override = vi.fn((stableSrc: string) => stableSrc.endsWith('-side.png') ? '/api/admin/media/candidate' : undefined);

    expect(resolveBoardLabTerrainSrc(asset.src, 'side', { cell, asset }, override))
      .toBe('/api/admin/media/candidate');
    expect(override).toHaveBeenCalledWith(
      '/assets/tiles/surface/water-3-side.png',
      expect.objectContaining({ role: 'side', cell, asset }),
    );
  });

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
      .toBe(`/api/media/${'a'.repeat(64)}`);
  });

  it('pins production faces to the immutable URL from the hydrated catalog revision', () => {
    hydrateSlot('tiles/surface/water-0-side.png', 'b'.repeat(64));

    expect(immutableBoardLabTerrainSrc('/assets/tiles/surface/water-0-side.png'))
      .toBe(`/api/media/${'b'.repeat(64)}`);
  });

  it('keeps hidden faces hidden while allowing different materials at a corner', () => {
    const base = tileFamilies.water[0];
    const south = tileFamilies.water[1];
    const east = tileFamilies.water[2];
    const cells: SocketBoardCell<typeof base>[] = [
      {
        x: 0,
        y: 0,
        asset: base,
        sideAssets: { south, east },
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

    const [first] = boardLabTerrainCanvasCells(cells, (asset) => asset.src, (stableSrc) => stableSrc);
    expect(first.sideFaces).toEqual({
      south: { exposed: true, material: '/assets/tiles/surface/water-1-side.png' },
      east: { exposed: false, material: '/assets/tiles/surface/water-2-side.png' },
    });
  });
});
