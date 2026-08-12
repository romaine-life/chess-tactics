// Forge card art under the ADR-0579 contract: one illustration per CARD, briefed from a
// king-rooted event.
//
//   node scripts/forge-run-card-art-v3.mjs [--out <dir>] [--only <id,id>] [--limit N]
//                                          [--world <king-card-id>] [--concurrency 4]
//
// What changed from the v2 forge, and why each of these is load-bearing:
//
//   * THE MOMENT LEADS. v2 buried `sceneDirection` in the middle and opened the scene block with
//     `arrangement`, a geometry clause. The generator drew the geometry and skipped the event.
//     Here the first thing the prompt says about the picture is the instant it holds.
//   * NO ARRANGEMENT CLAUSE. Deleted from the schema (ADR-0579). The card face already prints the
//     footprint on its own board; asking the illustration for it is how you get a cartoon.
//   * THE CAST IS CESSOLIS. A pawn is one of eight named trades with its tools, not "a soldier";
//     the bishop is a judge, the rook is a man with a seal. Trades cycle across the deck so no two
//     cards field the same men.
//   * NO RESIDUE FALLBACK. v2 inherited the background-anchor doctrine, whose rule is that the
//     event is deliberately off-stage; 46 of 94 briefs came back saying "covered". The exclusions
//     here name that failure mode directly so it is not the safe default.
//
// Generation only. Installation is a separate step and touches no live slot.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { runCodex, imageGenVerdict, threadIdOf, sessionImage } from './codex-imagegen.mjs';

const require = createRequire(import.meta.url);
// Required lazily so --dry works in a worktree whose frontend install is partial: previewing a
// brief should never need an image codec.
const loadSharp = () => require('sharp');

const WIDTH = 400;
const HEIGHT = 280;
const TRANSFORM = 'lanczos3-cover-fit-400x280';

const WORLDS = fileURLToPath(new URL('../../docs/art/run-card-worlds-v3.json', import.meta.url));
const SLATE = fileURLToPath(new URL('../../docs/art/run-king-slate-v3.json', import.meta.url));

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const OUT = flag('out', fileURLToPath(new URL('../tmp-card-art-v3', import.meta.url)));
const ONLY = (flag('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const WORLD = flag('world');
const LIMIT = Number(flag('limit', '0'));
const CONCURRENCY = Number(flag('concurrency', '4'));

mkdirSync(OUT, { recursive: true });

const worlds = JSON.parse(readFileSync(WORLDS, 'utf8'));
const slate = JSON.parse(readFileSync(SLATE, 'utf8'));
const worldById = new Map(slate.slots.map((s) => [s.cardId, s]));

/**
 * Jacobus de Cessolis, Liber de moribus (c. 1300), Caxton 1474: the eight pawns are eight TRADES,
 * each with its own attributes. This is the correction to "pawn = soldier" — a levy is drawn from
 * the trades, so a three-pawn card is three different men doing three different things for a
 * living, which is where the variety in this set actually comes from.
 */
// The trade is read off DRESS AND BUILD, not off a held prop. A man hauling a cart cannot also be
// clutching his scales, and a brief that demands both gets a cluttered picture of people posing
// with their attributes. His hands belong to the moment; his trade shows in everything else.
const TRADES = [
  { name: 'a field labourer', tell: 'weather-cracked hands, a rod through his belt, clothes that were issued rather than chosen' },
  { name: 'a smith', tell: 'a scorched leather apron worn under everything else, forearms marked by the forge' },
  { name: 'a clerk', tell: 'a townsman’s good coat gone shabby, shears on a cord, one hand permanently ink-stained' },
  { name: 'a merchant', tell: 'better cloth than anyone beside him, an empty purse-cord still at the neck' },
  { name: 'a physician', tell: 'a long plain gown, a satchel strapped close, spectacles or a squint from close work' },
  { name: 'a taverner', tell: 'heavy through the shoulders, sleeves pushed back, an apron tied short' },
  { name: 'a gate guard', tell: 'a padded jack and a ring of keys at the hip, the only one of them who has stood a watch' },
  { name: 'a messenger and dice-player', tell: 'light and quick, a courier’s satchel across the body, no armour at all' },
];

/** The officers, as Cessolis has them — two of which are the opposite of the obvious reading. */
const OFFICER = {
  knight: 'a sworn chevalier, mounted, in the armour of his own period, the horse under real control',
  bishop: 'an ASSESSOR OF THE LAW — a judge in a judge’s own dress, carrying a roll. He is NOT a priest and wears no mitre',
  rook: 'the king’s LEGATE — a man riding on borrowed authority with a sealed commission in a satchel. He is NOT a tower and NOT a building',
  queen: 'the queen herself, present in order to intercede rather than to command',
};

const PIECE_OF = { p: 'pawn', k: 'knight', b: 'bishop', r: 'rook', q: 'queen' };

/** Which men this card fields, in the seating the card prints. */
function castProse(card, index) {
  const seats = [...String(card.seats)].filter((ch) => ch !== '.');
  let pawn = 0;
  const parts = seats.map((ch) => {
    const piece = PIECE_OF[ch];
    if (piece !== 'pawn') return OFFICER[piece];
    const trade = TRADES[(index + pawn++) % TRADES.length];
    return `${trade.name} in the levy — ${trade.tell}`;
  });
  return parts;
}

function prompt(card, index) {
  const cast = castProse(card, index);
  const count = cast.length;
  const world = worldById.get(card.king.cardId);
  return `IMAGE-GENERATION task: create ONE PNG by GENERATING it with the built-in image_gen tool (the imagegen skill). Do NOT hand-draw it with code (PIL/Pillow, cairo, matplotlib, SVG, HTML/CSS, canvas), do NOT write a script, and do NOT crop or extract from any file — programmatic output is automatically rejected and you will be asked again.

Make a PIXEL-ART SCENE for an indie tactics game card. Landscape, roughly 1.43:1.

MEDIUM — the hard requirement, and the first thing to get right. This is PIXEL ART: visible square pixels, a deliberately limited palette, hard aliased edges, flat blocked colour with hand-placed dithering where it needs shading. It must look drawn pixel by pixel at a small size and then shown large, the way a 16-bit era game scene does. It is NOT a painting and NOT concept art: no soft airbrush gradients, no blended brushwork, no canvas or oil texture, no photorealistic rendering, no smooth anti-aliased outlines, no painterly lighting bloom. If the result would read as a digital painting of pixel art rather than as pixel art, it is wrong.

THE PICTURE IS THIS MOMENT, and nothing else: ${card.act.moment}

It is a single instant of something happening — the instant most suggestive of what came just before and what follows. Not the aftermath, not a group portrait, not people standing near an object. If the figures could be removed from the action and the picture would look the same, it is wrong.

What is going on: ${card.act.line}. ${card.act.detail}

Draw EXACTLY ${count} ${count === 1 ? 'figure' : 'figures'} — no crowd, no extra soldiers behind them, nobody in the middle distance. These are the real people a chess set stands for, drawn as themselves, never as chess pieces or game tokens. They are, in order: ${cast.map((c, i) => `(${i + 1}) ${c}`).join('; ')}.

No one of them is drawn larger or more heroically than the others.

Setting: ${world.where}. ${world.name} — ${world.act}

Grounded historical material, restrained natural colour, hand-made indie game art with character. The named setting fixes the period, the dress, the architecture and the weather.

None of these people is a king. No crown, coronet, royal mantle or regalia WORN BY any figure in this picture. (Regalia as an object — in a chest, on a cushion, being carried — is fine when the moment above names it.)

Do not fall back on aftermath imagery: no covered wagons, no covered bundles, no flowers on a ruin, no wet empty road with a figure beside it, unless the moment above actually puts one there. No text, numbers, icons, card border, chessboard, chess pieces, readable heraldry or banner lettering, magical effect, glowing rune, gore, modern signage, or heroic poster energy.

Pixel art, not a painting. Fill the frame edge to edge. Save it as ./card.png in the current working directory, then stop.`;
}

/**
 * King cards. Two things separate a King brief from a formation brief, and both are corrections
 * to what the v2 set did:
 *
 *   * HIERATIC SCALE IS GONE. 14 of the 15 v2 briefs said "nearest the viewer and much the largest
 *     in frame", which a modern generator renders as a big-head hero — while the same brief banned
 *     heroic poster energy. He is identified by regalia, by where he stands in the action, and by
 *     what he is doing with his hands.
 *   * THE ACT IS THE PICTURE, not scenery. Every King is named for an administrative act and in
 *     every v2 brief that act sat in the background as a prop: a roll "too far off to read", a
 *     tally stick "waiting under an awning". He is in the middle of doing it.
 *
 * The eye exception is KEPT: the monarch meets the viewer's eye while everyone around him keeps
 * the usual reticence. It is a deliberate departure from docs/lore-anti-story.md and it is not
 * what made these cartoony.
 */
function kingPrompt(slot, index) {
  const seats = [...slot.castShape.cells].filter((c) => c !== '.');
  let pawn = 0;
  const cast = seats.map((ch) => {
    if (ch === 'K') return `THE KING HIMSELF — ${slot.monarch}, in the dress, armour and regalia of his own reign`;
    const piece = PIECE_OF[ch];
    if (piece !== 'pawn') return OFFICER[piece];
    const trade = TRADES[(index + pawn++) % TRADES.length];
    return `${trade.name} of his household — ${trade.tell}`;
  });
  return `IMAGE-GENERATION task: create ONE PNG by GENERATING it with the built-in image_gen tool (the imagegen skill). Do NOT hand-draw it with code (PIL/Pillow, cairo, matplotlib, SVG, HTML/CSS, canvas), do NOT write a script, and do NOT crop or extract from any file — programmatic output is automatically rejected and you will be asked again.

Make a PIXEL-ART SCENE for an indie tactics game card. Landscape, roughly 1.43:1.

MEDIUM — the hard requirement, and the first thing to get right. This is PIXEL ART: visible square pixels, a deliberately limited palette, hard aliased edges, flat blocked colour with hand-placed dithering where it needs shading. It must look drawn pixel by pixel at a small size and then shown large, the way a 16-bit era game scene does. It is NOT a painting and NOT concept art: no soft airbrush gradients, no blended brushwork, no canvas or oil texture, no photorealistic rendering, no smooth anti-aliased outlines, no painterly lighting bloom.

THE PICTURE IS THIS MOMENT, and nothing else: ${slot.moment}

It is a single instant of the king DOING this thing — hands in it, mid-action. The act is not scenery: do not put the document, the chest, the roll or the tool in the background as a prop while he stands beside it.

What is going on: ${slot.name}. ${slot.act}

Draw EXACTLY ${cast.length} ${cast.length === 1 ? 'figure' : 'figures'} — no crowd, nobody in the middle distance. They are, in order: ${cast.map((c, i) => `(${i + 1}) ${c}`).join('; ')}.

SCALE: he is drawn at the SAME SIZE as the men around him, in correct perspective for where he stands. He is not nearest the viewer, not largest in frame, and not centred by default. You know him by his regalia and by what his hands are doing, never by being bigger. No heroic poster composition, no low hero angle, no figure looming.

FACES: the king's face is shown, lit, and his eyes are clear and readable and looking straight out of the picture at the viewer. Everyone else keeps their eyes broken by helm, hood, brow, weather, angle or distance — no readable gaze on anyone but him.

Setting: ${slot.where}. ${slot.monarchNote}

Grounded historical material, restrained natural colour, hand-made indie game art with character. The named reign fixes the period, the dress, the architecture and the weather.

No text, numbers, icons, card border, chessboard, chess pieces, readable heraldry or banner lettering, magical effect, glowing rune, gore, modern signage, or heroic poster energy.

Pixel art, not a painting. Fill the frame edge to edge. Save it as ./card.png in the current working directory, then stop.`;
}

// --- selection ---------------------------------------------------------------------------------
const KINGS = args.includes('--kings');
let cards = KINGS
  ? slate.slots.map((slot, index) => ({
    cardId: `k-${slot.cardId}`,
    slot: slot.slot,
    king: { cardId: slot.cardId, name: slot.name, world: slot.where },
    index,
    isKing: true,
    source: slot,
  }))
  : worlds.cards.map((card, index) => ({ ...card, index }));
if (ONLY.length) cards = cards.filter((c) => ONLY.includes(c.cardId));
if (WORLD) cards = cards.filter((c) => c.king.cardId === WORLD);
if (LIMIT > 0) cards = cards.slice(0, LIMIT);

async function forge(card) {
  const started = Date.now();
  const text = card.isKing ? kingPrompt(card.source, card.index) : prompt(card, card.index);
  const work = mkdtempSync(join(tmpdir(), `cardv3-${card.cardId.slice(0, 20)}-`));
  const { out } = await runCodex(work, text);
  // Gate on the ROLLOUT event, never on stdout: a model that hand-draws with code will happily
  // claim it generated an image.
  const verdict = imageGenVerdict(out);
  if (!verdict.ok) throw new Error(`method gate: ${verdict.reason}`);
  const threadId = threadIdOf(out);
  const native = threadId ? sessionImage(threadId) : null;
  if (!native) throw new Error('no generated image in the session directory');

  const sharp = loadSharp();
  const file = join(OUT, `${card.cardId}.png`);
  await sharp(native).resize(WIDTH, HEIGHT, { fit: 'cover', kernel: 'lanczos3' }).png().toFile(file);
  const meta = await sharp(native).metadata();
  const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

  return {
    cardId: card.cardId,
    slot: card.slot,
    king: card.king.cardId,
    file,
    seconds: (Date.now() - started) / 1000,
    threadId,
    prompt: text,
    promptSha256: createHash('sha256').update(text, 'utf8').digest('hex'),
    // ADR-0581: a downscale of a generated source is native. This is the evidence the install step
    // hands the acceptance policy — no exception, no owner-approved status.
    nativeEvidence: {
      schema: 'supersampled-native-v1',
      sourceKind: 'generation',
      native1x: true,
      spatialResampling: false,
      sourceWidth: meta.width,
      sourceHeight: meta.height,
      sourceSha256: sha(native),
      outputWidth: WIDTH,
      outputHeight: HEIGHT,
      outputSha256: sha(file),
      transform: TRANSFORM,
    },
  };
}

async function pool(items, concurrency) {
  const results = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const card = items[index];
      let last = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const outcome = await forge(card);
          results.push({ ok: true, attempt, ...outcome });
          process.stdout.write(`ok   ${card.cardId.padEnd(20)} ${outcome.seconds.toFixed(0)}s${attempt > 1 ? ' (retry)' : ''}  (${results.length}/${items.length})\n`);
          last = null;
          break;
        } catch (error) {
          last = String(error.message ?? error);
          if (attempt < 2) process.stdout.write(`retry ${card.cardId.padEnd(19)} ${last.slice(0, 90)}\n`);
        }
      }
      if (last) {
        results.push({ ok: false, cardId: card.cardId, king: card.king.cardId, error: last });
        process.stdout.write(`FAIL ${card.cardId.padEnd(20)} ${last.slice(0, 110)}\n`);
      }
    }
  }));
  return results;
}

// --dry prints the assembled briefs and generates nothing. The prompt IS the deliverable here, so
// it has to be readable before a batch is spent against it.
if (args.includes('--dry')) {
  for (const card of cards) {
    const text = card.isKing ? kingPrompt(card.source, card.index) : prompt(card, card.index);
    process.stdout.write(`\n${'='.repeat(96)}\n${card.cardId}  ->  ${card.king.name}\n${'='.repeat(96)}\n${text}\n`);
  }
  process.exit(0);
}

process.stdout.write(`forging ${cards.length} card illustrations (x${CONCURRENCY}) -> ${OUT}\n`);
const results = await pool(cards, CONCURRENCY);
// The report MERGES. A forge is usually a slice — one world, one card, the Kings — and the report
// is what the install step reads for each card's thread id, prompt and source raster. Overwriting
// it drops the provenance of every card this run did not touch, and that provenance cannot be
// recovered from the PNG afterwards: it has to be re-generated.
const REPORT = join(OUT, 'forge-report.json');
const previous = existsSync(REPORT) ? JSON.parse(readFileSync(REPORT, 'utf8')).results ?? [] : [];
const merged = new Map(previous.map((entry) => [entry.cardId, entry]));
for (const entry of results) merged.set(entry.cardId, entry);
const allResults = [...merged.values()].sort((a, b) => String(a.cardId).localeCompare(String(b.cardId)));
writeFileSync(REPORT, `${JSON.stringify({
  contract: 'docs/art/card-art-brief-contract.md',
  decision: 'ADR-0579',
  nativeEvidenceDecision: 'ADR-0581',
  width: WIDTH,
  height: HEIGHT,
  transform: TRANSFORM,
  results: allResults,
}, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  forged: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  out: OUT,
}, null, 2)}\n`);
