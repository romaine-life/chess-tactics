import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { useSkirmish } from '../game/store';
import { enemyThreats } from '../core/rules';
import { DEFAULT_ISO, depthKey, screenToTile, tileToScreen, type IsoConfig } from './iso';
import { loadSpriteAtlas, type SpriteAtlas } from './sprites';

const MARGIN = 44;
const SIDE_COLOR: Record<string, number> = { player: 0x3b76d6, enemy: 0xc0473a, neutral: 0x6b6f76 };
const MARK: Record<string, string> = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', rock: '▲', 'random-rock': '?' };

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
    const height = (size.cols + size.rows) * hh + MARGIN * 2 + 24;

    const app = new Application();
    let cancelled = false;
    let unsub = () => {};
    let atlas: SpriteAtlas | null = null;

    const diamond = (g: Graphics, cx: number, cy: number) =>
      g.poly([cx, cy - hh, cx + hw, cy, cx, cy + hh, cx - hw, cy]);

    const draw = () => {
      const { game, selectedId, movesForSelected } = useSkirmish.getState();
      const moveSet = new Set(movesForSelected().map((m) => `${m.x},${m.y}`));
      const threatSet = new Set(enemyThreats(game.pieces, game.size).map((s) => `${s.x},${s.y}`));
      app.stage.removeChildren();

      const grass = atlas?.tile('grass') ?? null;
      if (grass) {
        for (let y = 0; y < game.size.rows; y += 1) {
          for (let x = 0; x < game.size.cols; x += 1) {
            const s = tileToScreen(x, y, 0, cfg);
            const spr = new Sprite(grass);
            spr.anchor.set(0.5, 0.5);
            spr.x = s.x;
            spr.y = s.y;
            spr.tint = (x + y) % 2 ? 0xdfe7df : 0xffffff; // faint checker
            app.stage.addChild(spr);
          }
        }
      } else {
        const tiles = new Graphics();
        for (let y = 0; y < game.size.rows; y += 1) {
          for (let x = 0; x < game.size.cols; x += 1) {
            const s = tileToScreen(x, y, 0, cfg);
            diamond(tiles, s.x, s.y).fill({ color: (x + y) % 2 ? 0x2f5d3a : 0x356a42 }).stroke({ color: 0x1c3a25, width: 1 });
          }
        }
        app.stage.addChild(tiles);
      }

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
        const tex = atlas?.piece(p.side, p.type) ?? null;
        if (tex) {
          const spr = new Sprite(tex);
          spr.anchor.set(atlas!.pieceAnchor.x, atlas!.pieceAnchor.y);
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
        app.stage.addChild(c);
      }
    };

    void (async () => {
      await app.init({ width, height, background: '#0d1720', antialias: false });
      if (cancelled) { app.destroy(true); return; }
      host.appendChild(app.canvas);
      atlas = await loadSpriteAtlas(); // null on failure -> Graphics fallback
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
