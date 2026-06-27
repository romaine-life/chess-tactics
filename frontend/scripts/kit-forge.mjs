// Kit forge — the orchestrated, audited generation pipeline. ONE asset per codex
// invocation, then audit before accepting. See docs/kit-forge.md for the full
// story and the rule below.
//
// THE RULE (learned the hard way — a whole "30/30 forged" kit shipped broken):
// codex cannot be trusted to have GENERATED the image. Its imagegen skill tells
// it to hand-draw "code-native" icons, so for a 64px hard-alpha request it writes
// a PIL/SVG script and the pixel gate can't tell. So we VERIFY THE METHOD first
// (an `image_generation_call` event must be present) and only then the pixels.
// GOTCHA: that event is NOT in `exec --json` stdout (an abridged thread/turn stream) —
// it lives in the session ROLLOUT log; the shared codex-imagegen helper reads it and ships
// the asset from the session's own generated_images/<thread_id>/ dir (race-free).
// Provenance records the verified method — it is NOT "safe" just because it passed the
// gate; the gate certifies clean transparency, not a good drawing. The human eyeball is
// still the required backstop before onboarding.
//
//   node frontend/scripts/kit-forge.mjs <name...> | --group <id> | --all  [--n 8] [--tries 3]
//
// Each asset is forged in its OWN throwaway temp dir with --skip-git-repo-check,
// so N codex sessions run concurrently with zero git checkpoint/restore — that
// checkpointing (in the worktree) is what clobbered the parallel batch earlier.
import { mkdtempSync, rmSync, existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyGlyph } from './verify-kit-asset.mjs';
import { runCodex, imageGenVerdict, sessionImage, removeChromaKey } from './codex-imagegen.mjs';

const FRONTEND = fileURLToPath(new URL('..', import.meta.url));
const REPO = resolve(FRONTEND, '..');
const KIT = join(FRONTEND, 'public/assets/ui/kit');
const PROV = join(FRONTEND, 'src/ui/design/kitProvenance.json');
const TODAY = new Date().toISOString().slice(0, 10);

const GEN = 'docs/art/ui-screen-concepts/generated';
const SCN = 'docs/art/ui-screen-concepts';
const ref = {
  general: `${GEN}/settings-general-concept-v1.png`, audio: `${GEN}/settings-audio-concept-v1.png`,
  gameplay: `${GEN}/settings-gameplay-concept-v1.png`, creator: `${GEN}/settings-creator-tools-concept-v1.png`,
  skirmish: `${SCN}/04-skirmish.png`, campaign: `${SCN}/02-campaign-editor.png`,
};

// One spec per asset: the single subject codex must paint, its style ref + size.
const SPECS = [
  // settings icons (64x64)
  ['settings', 'gear', ref.general, 'a gray settings gear'],
  ['settings', 'speaker', ref.audio, 'a blue speaker emitting sound waves'],
  ['settings', 'knight', ref.gameplay, 'a cream-and-gray chess knight piece'],
  ['settings', 'wrench', ref.general, 'a gray wrench'],
  ['settings', 'monitor', ref.general, 'a blue display screen / monitor'],
  ['settings', 'save', ref.general, 'a blue floppy disk'],
  ['settings', 'reset', ref.general, 'a red circular refresh / reset arrow (red is the correct color for this one)'],
  ['settings', 'info', ref.general, 'a blue lowercase letter i inside a circle'],
  ['settings', 'music', ref.audio, 'a blue music note'],
  ['settings', 'effects', ref.audio, 'a blue equalizer of vertical waveform bars'],
  ['settings', 'interface-sounds', ref.audio, 'a blue UI-sound mark: a small speaker or panel with sound bars'],
  ['settings', 'brand-shield', ref.general, 'a heraldic crest badge: a bright blue chess rook (castle tower) centered on a dark navy field, enclosed by an ornate beveled gold border — the brand emblem from the header'],
  ['settings', 'design-index', ref.creator, 'a blue creator-tools design / grid mark'],
  ['settings', 'tileset-studio', ref.creator, 'a green grass terrain tile'],
  ['settings', 'unit-studio', ref.creator, 'a gray chess knight / unit bust'],
  ['settings', 'tileset-review', ref.creator, 'a green clipboard with a checklist'],
  // game icons (64x64)
  ['game', 'move', ref.skirmish, 'boots or directional movement arrows'],
  ['game', 'attack', ref.skirmish, 'a sword'],
  ['game', 'capture', ref.skirmish, 'two crossed swords'],
  ['game', 'defend', ref.skirmish, 'a shield'],
  ['game', 'wait', ref.skirmish, 'an hourglass'],
  ['game', 'objective', ref.skirmish, 'a flag'],
  ['game', 'end-turn', ref.skirmish, 'a circular arrow'],
  ['game', 'power', ref.skirmish, 'a lightning bolt'],
  // faction shields (64x80)
  ['shields', 'crown', ref.campaign, 'a crown emblem on a heraldic shield (dark field, gold border)'],
  ['shields', 'rook', ref.campaign, 'a castle tower (rook) emblem on a heraldic shield (dark field, gold border)'],
  ['shields', 'crescent', ref.campaign, 'a crescent moon emblem on a heraldic shield (dark field, gold border)'],
  ['shields', 'snow', ref.campaign, 'a snowflake emblem on a heraldic shield (dark field, gold border)'],
  ['shields', 'flame', ref.campaign, 'a flame emblem on a heraldic shield (dark field, gold border)'],
  ['shields', 'lion', ref.campaign, 'a lion emblem on a heraldic shield (dark field, gold border)'],
].map(([group, name, r, desc]) => {
  const dir = group === 'settings' ? 'icons' : `icons/${group}`;
  const [w, h] = group === 'shields' ? [64, 80] : [64, 64];
  return { group, name, desc, w, h, outDir: join(KIT, dir), refAbs: resolve(REPO, r) };
});

function prompt(spec, prior) {
  return `IMAGE-GENERATION task: create ONE PNG by GENERATING it with the built-in image_gen tool (the imagegen skill). Do NOT hand-draw it with code (PIL/Pillow, cairo, matplotlib, SVG, HTML/CSS, canvas), do NOT write a script, and do NOT crop or extract from any file — programmatic output is automatically rejected and you will be asked again.
Using the attached concept art as the exact style/palette reference, generate a single clean standalone icon of: ${spec.desc}. Size ${spec.w}x${spec.h}, the icon centered and compact with a clear margin of background all around it — the icon must NOT touch the canvas edges.
BACKGROUND: place the icon on a FLAT, SOLID, PURE-GREEN #00ff00 chroma-key background that fills the entire canvas edge to edge. This green is keyed out to transparency afterward, so the icon itself must contain NO green at all, and there must be no frame, panel, gradient, or drop shadow on the background.
FIDELITY: low-fi, pixellated, indie game art — a limited per-element palette (a few hundred colors), chunky stepped detail, like clean upscaled pixel art. NOT a smooth, high-fidelity, painterly render.${prior ? `\nIMPORTANT: your previous attempt FAILED with: ${prior}. Fix exactly that this time.` : ''}
Save it as ./${spec.name}.png in the current working directory, then stop.`;
}

async function forgeOne(spec, maxTries) {
  let prior = '';
  for (let attempt = 1; attempt <= maxTries; attempt += 1) {
    const work = mkdtempSync(join(tmpdir(), `forge-${spec.name}-`));
    try {
      const { out: codexJsonl } = await runCodex(work, prompt(spec, prior), spec.refAbs);
      // Persist codex's stdout stream for auditing. NOTE: the method PROOF is the
      // image_generation_call event in the ROLLOUT, not this abridged stdout (see
      // codex-imagegen.mjs) — imageGenVerdict() reads the rollout for us.
      const evidDir = join(FRONTEND, 'tmp-forge-evidence');
      mkdirSync(evidDir, { recursive: true });
      const evidPath = join(evidDir, `${spec.name}-try${attempt}.jsonl`);
      writeFileSync(evidPath, codexJsonl);
      // GATE 1 (method, definitive): image_generation_call present in the session rollout.
      const verdict = imageGenVerdict(codexJsonl);
      console.log(`        try ${attempt} METHOD: ${verdict.ok ? 'image_generation_call ✓ (GENERATED)' : `CODE-DRAWN ✗ — ${verdict.reason}`}`);
      console.log(`        evidence: ${evidPath}`);
      if (!verdict.ok) {
        prior = 'the rollout shows NO image_generation_call — you produced the PNG WITHOUT the built-in image_gen tool (you drew it programmatically in PIL/Pillow/cairo/SVG/canvas). That is auto-rejected. You MUST create the image with the built-in image_gen tool.';
        continue;
      }
      // The session's OWN model output (race-free), not codex's racy workspace copy. This is
      // the flat green-background render; gpt-image-2 can't paint native transparency.
      const shipped = sessionImage(verdict.tid);
      if (!shipped) { prior = 'the image generated but was not found in the default output folder; generate again and leave it there.'; continue; }
      // ADR-0013: key the flat chroma background out to alpha locally → the real deliverable.
      const keyed = join(work, `${spec.name}-keyed.png`);
      const key = removeChromaKey(shipped, keyed);
      if (!key.ok || !existsSync(keyed)) {
        console.log(`        chroma-key FAILED — ${key.reason || 'no output'}`);
        prior = `the chroma-key removal of your image failed (${key.reason || 'no output'}). Regenerate the icon on a clean FLAT SOLID green background with the icon not touching any edge.`;
        continue;
      }
      try {
        // GATE 2 (pixels): magenta / edge bleed on the keyed result.
        verifyGlyph(keyed, { label: spec.name });
        copyFileSync(keyed, join(spec.outDir, `${spec.name}.png`));
        return { name: spec.name, group: spec.group, pass: true, tries: attempt };
      } catch (e) {
        prior = String(e.message).split('\n').slice(1).join(' ').replace(/\s+/g, ' ').trim();
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  return { name: spec.name, group: spec.group, pass: false, tries: maxTries, reason: prior };
}

async function pool(specs, n, maxTries) {
  const results = []; let i = 0;
  const worker = async () => {
    while (i < specs.length) {
      const s = specs[i]; i += 1;
      console.log(`[${i}/${specs.length}] forging ${s.name} …`);
      const r = await forgeOne(s, maxTries);
      console.log(`        ${r.pass ? 'PASS' : 'FAIL'} ${s.name} (try ${r.tries})${r.reason ? ` — ${r.reason}` : ''}`);
      results.push(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, specs.length) }, worker));
  return results;
}

function recordProvenance(results) {
  let prov = { process: 'kit-forge single-shot + gate', lastRun: TODAY, assets: {} };
  try { prov = { ...prov, ...JSON.parse(readFileSync(PROV, 'utf8')) }; } catch { /* first run */ }
  prov.lastRun = TODAY;
  for (const r of results) {
    if (r.pass) prov.assets[r.name] = { group: r.group, forged: TODAY, tries: r.tries, method: 'image-generator (verified)', gate: 'pass' };
  }
  mkdirSync(join(FRONTEND, 'src/ui/design'), { recursive: true });
  writeFileSync(PROV, `${JSON.stringify(prov, null, 2)}\n`);
}

// ---- CLI ----
const argv = process.argv.slice(2);
const flag = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const n = Math.max(1, parseInt(flag('--n', '8'), 10));
const maxTries = Math.max(1, parseInt(flag('--tries', '3'), 10));
const groupSel = flag('--group', null);
const names = argv.filter((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--n' && argv[argv.indexOf(a) - 1] !== '--tries' && argv[argv.indexOf(a) - 1] !== '--group');

let queue;
if (argv.includes('--all')) queue = SPECS;
else if (groupSel) queue = SPECS.filter((s) => s.group === groupSel);
else if (names.length) queue = SPECS.filter((s) => names.includes(s.name));
else { console.error('select assets: <name...> | --group <settings|game|shields> | --all'); process.exit(2); }

console.log(`forge: ${queue.length} asset(s), concurrency ${n}, up to ${maxTries} tries each\n`);
const results = await pool(queue, n, maxTries);
recordProvenance(results);
const ok = results.filter((r) => r.pass).length;
console.log(`\n==== ${ok}/${results.length} forged + gated. provenance -> ${PROV} ====`);
if (ok < results.length) { console.log('FAILED:', results.filter((r) => !r.pass).map((r) => r.name).join(', ')); process.exit(1); }
