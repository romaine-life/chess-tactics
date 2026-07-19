import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { WALL_FRAME_GEOMETRY, type BoardDrawOp } from '@chess-tactics/board-render';
import { tileAssets, tileFamilies, type TileAsset } from '../art/tileset';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { BoardLabBoard, boardLabCellPosition } from '../render/BoardLabBoard';
import { BoardCanvasLayer, boundsForOps } from '../render/BoardCanvasLayer';
import { wallOverlayZIndex } from '../render/sceneDepth';
import { defaultWallMaterial, wallMaterials } from '../core/featureAutotile';
import { defaultTerrainFamily } from '../core/tileSockets';

const RUN_LABEL = '2026-07-14 full-height generated ';

interface AdminMediaVersion {
  label: string;
  status: string;
  media?: { url?: string; width?: number; height?: number };
}

interface AdminMediaCatalog {
  versions?: AdminMediaVersion[];
}

function candidateUrl(versions: readonly AdminMediaVersion[], material: string, mask: 1 | 8 | 9): string | undefined {
  return versions.find((version) =>
    version.status === 'candidate'
    && version.label === `${RUN_LABEL}wall-${material}-${mask}`
    && version.media?.width === WALL_FRAME_GEOMETRY.width
    && version.media?.height === WALL_FRAME_GEOMETRY.height)?.media?.url;
}

export function WallCandidateReview(): ReactElement {
  const [versions, setVersions] = useState<AdminMediaVersion[]>([]);
  const [error, setError] = useState('');
  const board = useMemo(() => solveSocketBoard({
    assets: tileAssets,
    terrainMap: Array.from({ length: 36 }, () => defaultTerrainFamily().id),
    seed: 14,
    columns: 6,
    rows: 6,
    familyAssets: tileFamilies,
  }), []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/admin/media-assets', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`candidate catalog returned ${response.status}`);
        return response.json() as Promise<AdminMediaCatalog>;
      })
      .then((catalog) => { if (!cancelled) setVersions(catalog.versions ?? []); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'candidate catalog failed'); });
    return () => { cancelled = true; };
  }, []);

  const ops = useMemo<BoardDrawOp[]>(() => {
    const next: BoardDrawOp[] = [];
    const push = (material: string, mask: 1 | 8 | 9, x: number, y: number): void => {
      const src = candidateUrl(versions, material, mask);
      if (!src) return;
      const seat = boardLabCellPosition({ x, y });
      next.push({
        layer: 'scene',
        src,
        dx: seat.left - WALL_FRAME_GEOMETRY.anchorX,
        dy: seat.top - WALL_FRAME_GEOMETRY.anchorY,
        dw: WALL_FRAME_GEOMETRY.width,
        dh: WALL_FRAME_GEOMETRY.height,
        z: wallOverlayZIndex({ x, y }),
      });
    };
    const installedDefault = defaultWallMaterial();
    push(installedDefault, 9, 0, 0);
    wallMaterials().filter((material) => material !== installedDefault).forEach((material, index) => {
      push(material, 1, index + 1, 0);
      push(material, 8, 0, index + 1);
    });
    return next;
  }, [versions]);

  const bounds = useMemo(() => boundsForOps(ops, { minX: -64, minY: -192, width: 128, height: 336 }), [ops]);
  const ready = ops.length === 1 + (wallMaterials().length - 1) * 2;

  return (
    <main style={{ minHeight: 'calc(100vh - 84px)', padding: '18px 24px', background: 'rgba(4, 12, 18, 0.94)', color: '#d8e8e6' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>Full-height wall candidates</h1>
      <p style={{ margin: '0 0 12px', color: '#8eb7b3' }}>
        {error || (ready ? 'Isolated candidate review · canonical 1× · nothing accepted or promoted' : 'Loading candidate frames…')}
      </p>
      <section aria-label="Full-height wall candidate board" style={{ height: '720px', overflow: 'hidden', border: '1px solid #31545a', background: '#07131a' }}>
        <BoardLabBoard
          board={board}
          assetFrameSrc={(asset) => asset.src}
          boardZoom={1}
          boardPan={{ x: 140, y: 220 }}
          ariaLabel="Full-height wall candidate board"
          showGrid
          sceneLayer={<BoardCanvasLayer ops={ops} bounds={bounds} />}
        />
      </section>
    </main>
  );
}
