import { useEffect, useRef } from 'react';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { useSkirmish } from '../game/store';
import { enemyThreats, pieceHp, pieceMaxHp } from '../core/rules';
import type { TerrainCell, TerrainType } from '../core/types';
import { DEFAULT_ISO, depthKey, screenToTile, tileToScreen, type IsoConfig } from './iso';
import { loadSpriteAtlas, type SpriteAtlas } from './sprites';

const MARGIN = 44;
// Depth of the decorative cliff skirt below the board's camera-facing edges,
// which makes the battlefield read as a floating island rather than a flat slab.
const SKIRT = 26;
const SIDE_COLOR: Record<string, number> = { player: 0x3b76d6, enemy: 0xc0473a, neutral: 0x6b6f76 };
const MARK: Record<string, string> = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', rock: '▲', 'random-rock': '?' };
// Graphics fallback colours per terrain (used only when the sprite atlas fails
// to load); tuned for the moonlit-grassland palette in the art direction.
const TERRAIN_COLOR: Record<TerrainType, number> = {
  grass: 0x356a42, water: 0x2f5d86, stone: 0x6b6f76, road: 0xa9905f, bridge: 0x7a5a36, cliff: 0x3a3f46, rock: 0x595e66,
};
// Cliff-face shades for the island skirt (left face darker than right).
const SKIRT_RIGHT = 0x2a3b34;
const SKIRT_LEFT = 0x1d2a25;

const UNIT_SPRITE_TYPES = ['pawn', 'knight', 'bishop', 'rook', 'queen'] as const;
type UnitSpriteType = typeof UNIT_SPRITE_TYPES[number];
type UnitSpriteSet = Record<string, Texture>;

async function loadUnitSpriteSet(): Promise<UnitSpriteSet> {
  const entries: Array<[string, Texture]> = [];
  try {
    await Promise.all(UNIT_SPRITE_TYPES.flatMap((type) => [
      Assets.load(`/assets/units/${type}/blue/south.png`).then((texture) => {
        const tex = texture as Texture;
        tex.source.scaleMode = 'nearest';
        entries.push([`player.${type}`, tex]);
      }),
      Assets.load(`/assets/units/${type}/red/south.png`).then((texture) => {
        const tex = texture as Texture;
        tex.source.scaleMode = 'nearest';
        entries.push([`enemy.${type}`, tex]);
      }),
    ]));
  } catch {
    return Object.fromEntries(entries);
  }
  return Object.fromEntries(entries);
}

function grassGrid(cols: number, rows: number): TerrainCell[] {
  const cells: TerrainCell[] = [];
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) cells.push({ x, y, terrain: 'grass', elevation: 0 });
  return cells;
}

// Imperative PixiJS board (canvas lives outside React's render path). Subscribes
// to the skirmish store and redraws on change; clicks map screen->tile and
// dispatch select / move intents back to the store.
export function SkirmishBoard() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const { size } = useSkirmish.getState().game;
    const hw = DEFAULT_ISO.tileW / 2;
    const hh = DEFAULT_ISO.tileH / 2;
    const cfg: IsoConfig = { ...DEFAULT_ISO, originX: MARGIN + (size.rows - 1) * hw, originY: MARGIN + 18 };
    const width = (size.cols + size.rows) * hw + MARGIN * 2;
    const height = (size.cols + size.rows) * hh + MARGIN * 2 + 24 + SKIRT;

    const app = new Application();
    let cancelled = false;
    let unsub = () => {};
    let atlas: SpriteAtlas | null = null;
    let unitSprites: UnitSpriteSet = {};

    const diamond = (g: Graphics, cx: number, cy: number) =>
      g.poly([cx, cy - hh, cx + hw, cy, cx, cy + hh, cx - hw, cy]);

    const draw = () => {
      const { game, selectedId, movesForSelected } = useSkirmish.getState();
      const moveSet = new Set(movesForSelected().map((m) => `${m.x},${m.y}`));
      const threatSet = new Set(enemyThreats(game.pieces, game.size).map((s) => `${s.x},${s.y}`));
      app.stage.removeChildren();

      const cols = game.size.cols;
      const rows = game.size.rows;
      // Back-to-front so the island skirt and any future elevation never paint
      // over a tile behind it (painter's algorithm on the iso depth key).
      const cells = (game.terrain ?? grassGrid(cols, rows)).slice().sort((a, b) => (a.x + a.y) - (b.x + b.y));

      // Island skirt: extrude the board's two camera-facing outer edges downward
      // into cliff faces so the battlefield reads as a floating island.
      const skirt = new Graphics();
      for (const c of cells) {
        const s = tileToScreen(c.x, c.y, 0, cfg);
        if (c.x === cols - 1) {
          skirt.poly([s.x + hw, s.y, s.x, s.y + hh, s.x, s.y + hh + SKIRT, s.x + hw, s.y + SKIRT]).fill({ color: SKIRT_RIGHT });
        }
        if (c.y === rows - 1) {
          skirt.poly([s.x - hw, s.y, s.x, s.y + hh, s.x, s.y + hh + SKIRT, s.x - hw, s.y + SKIRT]).fill({ color: SKIRT_LEFT });
        }
      }
      app.stage.addChild(skirt);

      // Tile faces: atlas sprites when available, Graphics diamonds otherwise.
      const fallback = atlas ? null : new Graphics();
      for (const c of cells) {
        const s = tileToScreen(c.x, c.y, 0, cfg);
        const tex = atlas?.tile(c.terrain) ?? null;
        if (tex) {
          const spr = new Sprite(tex);
          spr.anchor.set(0.5, 0.5);
          spr.x = s.x;
          spr.y = s.y;
          // Faint checker only on grass so paths/water keep their own art.
          spr.tint = c.terrain === 'grass' && (c.x + c.y) % 2 ? 0xe4ede4 : 0xffffff;
          app.stage.addChild(spr);
        } else if (fallback) {
          diamond(fallback, s.x, s.y).fill({ color: TERRAIN_COLOR[c.terrain] ?? TERRAIN_COLOR.grass }).stroke({ color: 0x1c3a25, width: 1 });
        }
      }
      if (fallback) app.stage.addChild(fallback);

      const ov = new Graphics();
      for (const key of threatSet) {
        const [x, y] = key.split(',').map(Number);
        const s = tileToScreen(x, y, 0, cfg);
        diamond(ov, s.x, s.y).fill({ color: 0xff7a3c, alpha: 0.3 });
      }
      for (const key of moveSet) {
        const [x, y] = key.split(',').map(Number);
        const s = tileToScreen(x, y, 0, cfg);
        diamond(ov, s.x, s.y).fill({ color: 0x49c6ff, alpha: 0.5 });
      }
      app.stage.addChild(ov);

      const ordered = game.pieces.filter((p) => p.alive).slice().sort((a, b) => depthKey(a.x, a.y, 0) - depthKey(b.x, b.y, 0));
      for (const p of ordered) {
        const s = tileToScreen(p.x, p.y, 0, cfg);
        const c = new Container();
        c.x = s.x;
        c.y = s.y;
        if (p.id === selectedId) {
          const sel = new Graphics();
          diamond(sel, 0, 0).stroke({ color: 0xffffff, width: 2 });
          c.addChild(sel);
        }
        const unitTex = unitSprites[`${p.side}.${p.type}`] ?? null;
        const tex = unitTex ?? atlas?.piece(p.side, p.type) ?? null;
        if (tex) {
          const spr = new Sprite(tex);
          if (unitTex) {
            spr.anchor.set(0.5, 0.9);
            spr.scale.set(0.42);
          } else {
            spr.anchor.set(atlas!.pieceAnchor.x, atlas!.pieceAnchor.y);
          }
          c.addChild(spr);
        } else {
          const base = new Graphics();
          if (p.type === 'rock' || p.type === 'random-rock') {
            base.roundRect(-13, -16, 26, 22, 4).fill({ color: 0x595e66 }).stroke({ color: 0x2b2e33, width: 2 });
          } else {
            base.ellipse(0, 3, 14, 6).fill({ color: 0x0a131b, alpha: 0.5 });
            base.circle(0, -9, 13).fill({ color: SIDE_COLOR[p.side] ?? 0x888888 }).stroke({ color: 0xf3efe4, width: 2 });
          }
          c.addChild(base);
          const label = new Text({ text: MARK[p.type] ?? '?', style: { fill: 0xffffff, fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold' } });
          label.anchor.set(0.5);
          label.y = p.type === 'rock' ? -5 : -9;
          c.addChild(label);
        }
        // HP bar above multi-hit units (hidden in the classic 1-hit model and on
        // neutral obstacles). Cyan for the player, vermilion for the enemy.
        const maxHp = pieceMaxHp(p);
        if (maxHp > 1 && p.side !== 'neutral') {
          const hp = Math.max(0, pieceHp(p));
          const bw = 22; const bh = 3; const bx = -bw / 2; const by = -32;
          const bar = new Graphics();
          bar.rect(bx - 1, by - 1, bw + 2, bh + 2).fill({ color: 0x0a131b, alpha: 0.85 });
          bar.rect(bx, by, bw, bh).fill({ color: 0x39404a });
          bar.rect(bx, by, bw * (hp / maxHp), bh).fill({ color: p.side === 'player' ? 0x49c6ff : 0xff7a3c });
          c.addChild(bar);
        }
        app.stage.addChild(c);
      }
    };

    void (async () => {
      await app.init({ width, height, background: '#0d1720', antialias: false });
      if (cancelled) { app.destroy(true); return; }
      host.appendChild(app.canvas);
      [atlas, unitSprites] = await Promise.all([
        loadSpriteAtlas(), // null on failure -> Graphics fallback
        loadUnitSpriteSet(),
      ]);
      if (cancelled) { app.destroy(true); return; }
      app.stage.eventMode = 'static';
      app.stage.hitArea = new Rectangle(0, 0, width, height);
      app.stage.on('pointertap', (e) => {
        const tile = screenToTile(e.global.x, e.global.y, cfg);
        const { game, select, tryMoveTo } = useSkirmish.getState();
        if (tile.x < 0 || tile.y < 0 || tile.x >= game.size.cols || tile.y >= game.size.rows) return;
        const here = game.pieces.find((p) => p.alive && p.x === tile.x && p.y === tile.y);
        if (here && here.side === 'player') select(here.id);
        else tryMoveTo(tile.x, tile.y);
      });
      draw();
      unsub = useSkirmish.subscribe(draw);
    })();

    return () => {
      cancelled = true;
      unsub();
      try { app.destroy(true); } catch { /* not yet initialised */ }
    };
  }, []);

  return <div ref={hostRef} data-testid="skirmish-board" />;
}
