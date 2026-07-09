import fs from 'fs';
import { lz77 } from './lz77.mjs';
import { extractMaps } from './extract.mjs';
import { categoryOf } from './legend.mjs';

const romPath = process.argv[2];
const outPath = process.argv[3];
const rom = fs.readFileSync(romPath);
const HCMAP = JSON.parse(fs.readFileSync(new URL('./hcmap.json', import.meta.url), 'utf8')); // offset -> {hc,name,chapter,confident}
const GBA = 0x08000000, toOff = (p) => (p >= GBA && p < 0x0a000000) ? (p - GBA) : null;

// --- parse the map/mission table (two identical consecutive terrain ptrs, then unit ptrs) ---
const maps = extractMaps(rom);
const byOff = new Map(maps.map((m) => [m.off, m]));
const entries = [];
for (let i = 0x640000; i < 0x660000 - 16; i += 4) {
  const pa = rom.readUInt32LE(i), pb = rom.readUInt32LE(i + 4);
  if (pa !== pb) continue;
  const off = toOff(pa); if (off == null || !byOff.has(off)) continue;
  entries.push({ terrain: off, u2: toOff(rom.readUInt32LE(i + 12)) }); // u2 = HARD predeploy
}

// --- mappings ---
const CAT_TERRAIN = { grass: 'grass', water: 'water', mountain: 'stone', road: 'road', forest: 'grass' };
const TYPE_PIECE = { 1: 'pawn', 2: 'pawn', 7: 'pawn', 3: 'bishop', 5: 'rook', 6: 'bishop', 8: 'bishop', 11: 'knight', 14: 'knight', 15: 'knight' }; // air/sea omitted -> dropped
const FACTION = ['golden', 'navy-blue', 'crimson', 'emerald', 'golden'];
const PIECE_UNIT = { pawn: 'pawn', rook: 'rook', knight: 'knight', bishop: 'bishop', queen: 'queen', king: 'king' };
const sideOf = (owner) => owner === 0 ? 'neutral' : owner === 1 ? 'player' : 'enemy';
const b64 = (o) => Buffer.from(JSON.stringify(o), 'latin1').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// Official ids must be off- prefixed, lowercase, DIGIT-FREE slugs (backend validateWorkspace).
const slug = (s) => (s || '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-+|-+$/g, '');

// classify one terrain id -> { terr, cover?, road?, building? }
function classify(id) {
  if (id >= 300) {
    if (id === 360) return { terr: 'water' };
    if (id >= 448 && id <= 499) { const idx = (id - 448) % 5, owner = Math.floor((id - 448) / 5); return { terr: 'grass', building: { idx, owner } }; }
    return { terr: 'stone' }; // pipeline / seam / special
  }
  const cat = categoryOf(id);
  if (cat === 'water') return { terr: 'water' };
  if (cat === 'mountain') return { terr: 'stone' };
  if (cat === 'road') return { terr: 'road', road: true };
  if (cat === 'forest') return { terr: 'grass', cover: true };
  return { terr: 'grass' };
}

function buildLevel(entry) {
  const m = byOff.get(entry.terrain);
  const W = m.w, H = m.h;
  const terrain = [], propsMap = new Map(), unitsMap = new Map();
  const t = {}, v = {}, rd = {}, u = {}, p = {};
  let water = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const key = `${x},${y}`, c = classify(m.grid[y * W + x]);
    terrain.push({ x, y, terrain: c.terr, elevation: 0, ...(c.cover ? { cover: { density: 'filled' } } : {}) });
    if (c.terr === 'water') water++;
    if (c.terr === 'water') t[key] = 'water-surf-0';
    else if (c.terr === 'stone') t[key] = 'stone-surf-0';
    if (c.cover) v[key] = 'filled';
    if (c.road) rd[key] = 'cobble';
    if (c.building) {
      const { idx: bi, owner } = c.building, side = sideOf(owner), fac = FACTION[Math.min(owner, 4)];
      if (bi === 0) { unitsMap.set(key, { x, y, type: 'king', side }); u[key] = [PIECE_UNIT.king, 'south', fac]; }
      else if (bi === 1) { unitsMap.set(key, { x, y, type: 'rook', side }); u[key] = [PIECE_UNIT.rook, 'south', fac]; }
      else { propsMap.set(key, { x, y, propId: 'cottage-small' }); p[key] = 'cottage-small'; }
    }
  }
  // mobile units (u2 = hard predeploy), army-segmented by 0xfe (owner)
  if (entry.u2 != null) {
    let q = entry.u2, army = 1;
    for (let n = 0; n < 400; n++) {
      const b0 = rom[q]; if (b0 === 0xff) break;
      if (b0 === 0xfe) { army = rom[q + 1]; q += 12; continue; }
      const x = rom[q], y = rom[q + 1], piece = TYPE_PIECE[rom[q + 2]];
      if (piece && x < W && y < H) {
        const key = `${x},${y}`, side = sideOf(army);
        unitsMap.set(key, { x, y, type: piece, side });
        u[key] = [PIECE_UNIT[piece], 'south', FACTION[Math.min(army, 4)]];
      }
      q += 12;
    }
  }
  const waterFrac = water / (W * H);
  const wire = { c: W, r: H, f: 'grass-surf-0', pf: 'navy-blue' };
  for (const [k, o] of [['t', t], ['v', v], ['rd', rd], ['u', u], ['p', p]]) if (Object.keys(o).length) wire[k] = o;
  const hc = HCMAP['0x' + entry.terrain.toString(16)] || {};
  const n = hc.hc, nn = n ? String(n).padStart(2, '0') : null;
  const id = nn ? `off-l-aw-${slug(hc.name)}` : `off-l-aw-unmatched-${slug(entry.terrain.toString(16)) || 'x'}`;
  const name = nn ? `HC${nn} · ${hc.name}` : `AW2 — Unmatched (0x${entry.terrain.toString(16)})`;
  const notes = nn
    ? `Advance Wars 2 · Hard Campaign · Mission ${nn} "${hc.name}" · ${hc.chapter} chapter${hc.confident ? '' : ' · ⚠ auto-matched, unverified'} · ROM 0x${entry.terrain.toString(16)}`
    : `Advance Wars 2 · unmatched ROM map 0x${entry.terrain.toString(16)}`;
  const level = {
    formatVersion: 1, id, name, notes,
    board: { cols: W, rows: H, heightLevels: 1 }, objective: 'capture-all', difficulty: 'hard',
    economy: { startingFunds: 1000, incomePerTurn: 100 }, theme: 'grassland', placement: 'fixed', boardCode: b64(wire),
    layers: { terrain, decals: [], zones: [], units: [...unitsMap.values()], props: [...propsMap.values()], fences: [] },
  };
  return { level, hc: n || 999, waterFrac, W, H, units: unitsMap.size, props: propsMap.size };
}

const built = [];
let skipped = 0;
for (const entry of entries) {
  const r = buildLevel(entry);
  if (r.waterFrac > 0.55) { skipped++; continue; } // naval map -> skip
  built.push(r);
}
built.sort((a, b) => a.hc - b.hc); // order by HC mission number (unmatched sort to the end)
const levels = {}, refs = [];
built.forEach((r, i) => {
  levels[r.level.id] = r.level;
  refs.push({ levelId: r.level.id, ordinal: i, objective: 'capture-all' });
  console.log(`#${String(i).padStart(2)} ${r.level.name.padEnd(28)} ${r.W}x${r.H} units=${r.units} props=${r.props}`);
});
console.log(`\n${built.length} maps kept, ${skipped} naval maps skipped`);
const campaign = {
  formatVersion: 1, id: 'off-c-advance-wars-two', name: 'Advance Wars 2 · Hard Campaign', difficulty: 'hard',
  chapters: Math.max(1, Math.ceil(refs.length / 3)), favorite: false, locked: false, levels: refs, origin: 'official', readOnly: false,
};
const ws = { campaigns: [campaign], levels };
fs.writeFileSync(outPath, JSON.stringify(ws));
console.log('wrote', outPath, `(${refs.length} levels, campaign "${campaign.name}")`);
