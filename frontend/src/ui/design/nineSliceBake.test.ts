// Bake regression guard: every committed kit PNG must equal a fresh bake from its
// committed config, so a hand-edited or drifted artifact (or a bake change that
// wasn't re-run) fails CI. The bake core (bakeAsset) is shared with the writer
// (buildAsset) and the dev-Save endpoint, so this also pins editor↔bake parity.
import { describe, it, expect } from 'vitest';
// @ts-ignore — nine-slice-kit is an untyped .mjs build script (cf. main.tsx/bgm.js)
import { bakeAsset, bakeLine, REGISTRY, LINE_DIR, loadConfig, normalizeConfig, assetsInTheme, diffCommitted } from '../../../scripts/nine-slice-kit.mjs';

describe('theme family (ADR-0054: members share ONE shape, cannot drift)', () => {
  it('gold family members bake a byte-identical base frame', () => {
    const members = assetsInTheme('gold');
    expect(members.length, 'expected the gold family to have members').toBeGreaterThan(1);
    // Same atoms + same shared shape + no palette swap on variant[0] ⇒ the base frame
    // is identical across members (content/fill bake into no pixels). This is the
    // strongest anti-drift guard: if a member's shape ever diverged, this fails.
    const base = (id: string) => bakeAsset(id, loadConfig(id)).variants[0].png;
    const ref = base(members[0]);
    for (const id of members.slice(1)) {
      const png = base(id);
      expect(png.width === ref.width && png.height === ref.height, `${id} base frame size differs from ${members[0]}`).toBe(true);
      let diff = 0;
      for (let i = 0; i < ref.data.length; i++) if (ref.data[i] !== png.data[i]) diff++;
      expect(diff, `${id} base frame differs from ${members[0]} by ${diff} channel-values — the family drifted`).toBe(0);
    }
  });
});

describe('config shapes (ADR-0054: per-element absolutes; legacy global+residual folds in)', () => {
  it('legacy shape folds to the same canonical config', () => {
    const legacy = normalizeConfig({
      asset: 'mode-button',
      keyline: { dx: 1, dy: 0 },
      frameCorners: { tl: { dx: -1, dy: -1 }, tr: { dx: 0, dy: -1 }, bl: { dx: -1, dy: 0 }, br: { dx: 0, dy: 0 } },
      edge: { dx: 2, dy: 3 },
      edgeSides: { top: { dy: -1 }, bottom: {}, left: { dx: -2 }, right: {} },
      bracket: { dx: -6, dy: -6 },
      bracketCorners: { tl: { dx: 1, dy: 0 }, tr: { dx: 0, dy: 0 }, bl: { dx: 0, dy: 0 }, br: { dx: 0, dy: 0 } },
      frameScale: 1.5, bracketScale: 1.25, content: 5, fill: 2,
    });
    const canonical = normalizeConfig({
      asset: 'mode-button',
      coolCorners: { tl: { dx: 0, dy: -1 }, tr: { dx: 1, dy: -1 }, bl: { dx: 0, dy: 0 }, br: { dx: 1, dy: 0 } },
      pipes: { top: 2, bottom: 3, left: 0, right: 2 },
      brackets: { tl: { dx: -5, dy: -6 }, tr: { dx: -6, dy: -6 }, bl: { dx: -6, dy: -6 }, br: { dx: -6, dy: -6 } },
      frameScale: 1.5, bracketScale: 1.25, content: 5, fill: 2,
    });
    expect(legacy).toEqual(canonical);
  });
});

describe('nine-slice bake parity (committed PNG === fresh bake from config)', () => {
  const ids = Object.keys(REGISTRY);

  it('has registered assets to check', () => {
    expect(ids.length).toBeGreaterThan(0);
  });

  // Scaled frames must be four-way mirror-symmetric at zero nudges. Guards the
  // "mirror AFTER scale" invariant in buildFrameParts: floor-sampled scaling does
  // not commute with mirroring, and regressing to scale(flip(art)) silently skews
  // every corner 1px at non-integer scales (the defect that once had to be
  // hand-compensated per corner in mode-button.json).
  const opaqueAt = (png: { data: Uint8Array; width: number }, x: number, y: number) => png.data[(y * png.width + x) * 4 + 3] > 40;
  const B6 = { dx: -6, dy: -6 };
  // Bright steel RAIL pixel: opaque, not warm gold, and brighter than the navy fill
  // (max channel ≥ RAIL_MIN 45, the kit's own rail/fill threshold). Isolates the cool
  // border line from the fill — which is otherwise opaque everywhere and hides thickness.
  const railAt = (png: { data: Uint8Array; width: number }, x: number, y: number) => {
    const i = (y * png.width + x) * 4;
    return png.data[i + 3] > 40 && !(png.data[i] > png.data[i + 2] + 15)
      && Math.max(png.data[i], png.data[i + 1], png.data[i + 2]) >= 45;
  };
  const bakeMB = (frameScale: number) => bakeAsset('mode-button', { asset: 'mode-button', frameScale, bracketScale: 1.25, brackets: { tl: B6, tr: B6, bl: B6, br: B6 } }).variants[0].png;
  // Includes scales PAST the old 1.5 cap (quadrant clipping keeps the frame symmetric
  // and clean up to frame/corner = 3.0, so the rail keeps thickening with no wall).
  for (const frameScale of [1.25, 1.5, 2.25, 3.0]) {
    it(`mode-button at frameScale ${frameScale}: bake is mirror-symmetric`, () => {
      const png = bakeMB(frameScale);
      let h = 0, v = 0;
      for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
        if (opaqueAt(png, x, y) !== opaqueAt(png, png.width - 1 - x, y)) h++;
        if (opaqueAt(png, x, y) !== opaqueAt(png, x, png.height - 1 - y)) v++;
      }
      expect(h, 'horizontal mirror mismatch (px)').toBe(0);
      expect(v, 'vertical mirror mismatch (px)').toBe(0);
    });
  }

  // Past the old cap the rail must genuinely thicken (more cool pixels), not plateau —
  // the whole point of quadrant clipping. Counts cool (non-warm) opaque pixels.
  it('mode-button cool rail thickens monotonically with frameScale past 1.5', () => {
    const railCount = (fs: number) => {
      const png = bakeMB(fs);
      let n = 0;
      for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) if (railAt(png, x, y)) n++;
      return n;
    };
    const c15 = railCount(1.5), c225 = railCount(2.25), c30 = railCount(3.0);
    expect(c225, `2.25 (${c225}) should exceed 1.5 (${c15})`).toBeGreaterThan(c15);
    expect(c30, `3.0 (${c30}) should exceed 2.25 (${c225})`).toBeGreaterThan(c225);
  });

  for (const id of ids) {
    it(`${id}: committed PNG(s) match a fresh bake`, () => {
      let cfg;
      try { cfg = loadConfig(id); } catch { cfg = { asset: id }; }
      const { variants } = bakeAsset(id, cfg);
      for (const v of variants) {
        const d = diffCommitted(v.out, v.png);
        expect(d.sameSize, `${v.out}: size ${JSON.stringify(d.fresh)} vs committed ${JSON.stringify(d.committed)}`).toBe(true);
        expect(d.samePixels, `${v.out}: pixels differ from the committed file — re-bake (apply-nine-slice / dev Save) or restore the artifact`).toBe(true);
      }
      // Transparent-interior "line" twin (ordinarily in explore/frames) must also match a fresh bake.
      const rec = REGISTRY[id];
      if (rec.line) {
        const d = diffCommitted(rec.line, bakeLine(id), LINE_DIR);
        expect(d.sameSize, `${rec.line}: size ${JSON.stringify(d.fresh)} vs committed ${JSON.stringify(d.committed)}`).toBe(true);
        expect(d.samePixels, `${rec.line}: line frame drifted — re-bake (scripts/bake-line-frames.mjs)`).toBe(true);
      }
      // Semantic-accent twins (lineTones): each re-bakes from the same atoms + a palette swap.
      for (const t of (rec.lineTones ?? [])) {
        const d = diffCommitted(t.out, bakeLine(id, t.swap), LINE_DIR);
        expect(d.sameSize, `${t.out}: size ${JSON.stringify(d.fresh)} vs committed ${JSON.stringify(d.committed)}`).toBe(true);
        expect(d.samePixels, `${t.out}: tone line frame drifted — re-bake (scripts/bake-line-frames.mjs)`).toBe(true);
      }
    });
  }
});
