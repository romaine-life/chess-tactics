import { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Rectangle, Text } from 'pixi.js';
import { useEditor } from '../editor/store';
import { DEFAULT_ISO, depthKey, screenToTile, tileToScreen, type IsoConfig } from './iso';

const MARGIN = 44;
const TERRAIN: Record<string, number> = {
  grass: 0x356a42, water: 0x2f5d86, stone: 0x6b6f76, road: 0xa9905f, bridge: 0x7a5a36, cliff: 0x3a3f46, rock: 0x595e66,
};
const SIDE_COLOR: Record<string, number> = { player: 0x3b76d6, enemy: 0xc0473a, neutral: 0x6b6f76 };
const MARK: Record<string, string> = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', rock: '▲', 'random-rock': '?' };

// Editor board: a pure projection of the editor's Level. Click/drag paints via
// the editor store (which handles undo); hover previews the target cell.
export function EditorBoard() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const board0 = useEditor.getState().level.board;
    const cols = board0.cols;
    const rows = board0.rows;
    const hw = DEFAULT_ISO.tileW / 2;
    const hh = DEFAULT_ISO.tileH / 2;
    const maxLift = 4 * DEFAULT_ISO.elevationStep;
    const cfg: IsoConfig = { ...DEFAULT_ISO, originX: MARGIN + (rows - 1) * hw, originY: MARGIN + 18 + maxLift };
    const width = (cols + rows) * hw + MARGIN * 2;
    const height = (cols + rows) * hh + MARGIN * 2 + 24 + maxLift;

    const app = new Application();
    let cancelled = false;
    let unsub = () => {};
    let painting = false;
    let lastKey = '';

    const diamond = (g: Graphics, cx: number, cy: number) => g.poly([cx, cy - hh, cx + hw, cy, cx, cy + hh, cx - hw, cy]);

    const draw = () => {
      const { level, hover } = useEditor.getState();
      app.stage.removeChildren();
      const cells = level.layers.terrain.slice().sort((a, b) => a.x + a.y - (b.x + b.y));
      const g = new Graphics();
      for (const c of cells) {
        const s = tileToScreen(c.x, c.y, c.elevation, cfg);
        if (c.elevation > 0) {
          const lift = c.elevation * DEFAULT_ISO.elevationStep;
          g.poly([s.x - hw, s.y, s.x, s.y + hh, s.x, s.y + hh + lift, s.x - hw, s.y + lift]).fill({ color: 0x20303a });
          g.poly([s.x + hw, s.y, s.x, s.y + hh, s.x, s.y + hh + lift, s.x + hw, s.y + lift]).fill({ color: 0x16242e });
        }
        diamond(g, s.x, s.y).fill({ color: TERRAIN[c.terrain] ?? 0x356a42 }).stroke({ color: 0x111a1f, width: 1 });
      }
      app.stage.addChild(g);

      if (hover) {
        const c = cells.find((t) => t.x === hover.x && t.y === hover.y);
        const s = tileToScreen(hover.x, hover.y, c ? c.elevation : 0, cfg);
        const hl = new Graphics();
        diamond(hl, s.x, s.y).stroke({ color: 0xffffff, width: 2 });
        app.stage.addChild(hl);
      }

      const units = level.layers.units.slice().sort((a, b) => depthKey(a.x, a.y, 0) - depthKey(b.x, b.y, 0));
      for (const u of units) {
        const c = cells.find((t) => t.x === u.x && t.y === u.y);
        const s = tileToScreen(u.x, u.y, c ? c.elevation : 0, cfg);
        const cont = new Container();
        cont.x = s.x;
        cont.y = s.y;
        const base = new Graphics();
        base.ellipse(0, 3, 14, 6).fill({ color: 0x0a131b, alpha: 0.5 });
        base.circle(0, -9, 13).fill({ color: SIDE_COLOR[u.side] ?? 0x888888 }).stroke({ color: 0xf3efe4, width: 2 });
        cont.addChild(base);
        const label = new Text({ text: MARK[u.type] ?? '?', style: { fill: 0xffffff, fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold' } });
        label.anchor.set(0.5);
        label.y = -9;
        cont.addChild(label);
        app.stage.addChild(cont);
      }
    };

    const toTile = (gx: number, gy: number) => {
      const t = screenToTile(gx, gy, cfg);
      const inside = t.x >= 0 && t.y >= 0 && t.x < cols && t.y < rows;
      useEditor.getState().setHover(inside ? t : null);
      return { t, inside };
    };

    void (async () => {
      await app.init({ width, height, background: '#0d1720', antialias: false });
      if (cancelled) { app.destroy(true); return; }
      host.appendChild(app.canvas);
      app.stage.eventMode = 'static';
      app.stage.hitArea = new Rectangle(0, 0, width, height);
      app.stage.on('pointerdown', (e) => {
        const { t, inside } = toTile(e.global.x, e.global.y);
        painting = true;
        lastKey = `${t.x},${t.y}`;
        if (inside) useEditor.getState().paint(t.x, t.y);
      });
      app.stage.on('pointermove', (e) => {
        const { t, inside } = toTile(e.global.x, e.global.y);
        if (!painting || !inside) return;
        const key = `${t.x},${t.y}`;
        if (key === lastKey) return;
        lastKey = key;
        useEditor.getState().paint(t.x, t.y);
      });
      const stop = () => { painting = false; };
      app.stage.on('pointerup', stop);
      app.stage.on('pointerupoutside', stop);
      draw();
      unsub = useEditor.subscribe(draw);
    })();

    return () => { cancelled = true; unsub(); try { app.destroy(true); } catch { /* not yet initialised */ } };
  }, []);

  return <div ref={hostRef} data-testid="editor-board" />;
}
