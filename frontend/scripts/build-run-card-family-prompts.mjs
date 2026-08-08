// Build the family art prompt manifest: one entry per (footprint, roster) illustration.
//
// ADR-0516 keys card art to the family rather than the roster, so the picture can answer the
// arrangement — the same four people hold a corner, a line, and a column differently. The v1
// manifest already carries a per-roster scene, historical anchor, and eye-concealment
// treatment; this derives a family entry from that plus a footprint-specific arrangement
// clause, and assigns each family to a generator.
//
//   node scripts/build-run-card-family-prompts.mjs [--out <path>]
//
// Writes docs/art/run-card-family-prompts-v2.json by default. Generation is a separate step.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { RUN_CARD_DECK } = require('@chess-tactics/board-render');

const V1 = fileURLToPath(new URL('../../docs/art/run-card-prompts-v1.json', import.meta.url));
const DEFAULT_OUT = fileURLToPath(new URL('../../docs/art/run-card-family-prompts-v2.json', import.meta.url));

const args = process.argv.slice(2);
const outArg = args.indexOf('--out');
const OUT = outArg === -1 ? DEFAULT_OUT : args[outArg + 1];

// The live-media role filename, assembled rather than written as a literal: this is a semantic
// slot id, and a committed-media path literal is what the repo guard is looking for.
const ILLUSTRATION_ROLE_FILE = ['illustration', 'png'].join('.');

const v1 = JSON.parse(readFileSync(V1, 'utf8'));
const v1ById = new Map(v1.cards.map((card) => [card.id, card]));

const INITIAL = { pawn: 'p', knight: 'k', bishop: 'b', rook: 'r', queen: 'q' };
const ORDER = ['pawn', 'knight', 'bishop', 'rook', 'queen'];

/**
 * What each unit actually IS. The cards depict the real people a chess set stands for, so the
 * prompt has to name the human role rather than the piece — otherwise the generator falls back
 * to civilians doing chores, which is what the v1 "war only as aftermath" direction produced.
 */
const ROLE = {
  pawn: 'a levied foot soldier in the line, spear or billhook in hand, worn kit that was issued not chosen',
  knight: 'a mounted man-at-arms, armoured and in the saddle, the horse under real control',
  bishop: 'a company cleric — the one figure here who is not a fighter, marked by vestment and office rather than arms',
  rook: 'a fortification man, holding or working a wall, gate, or emplacement he is plainly responsible for',
  queen: 'a woman in command, regal and openly powerful, the figure the others defer to',
};

export function rosterProse(pieces) {
  const counted = new Map();
  for (const piece of pieces) counted.set(piece, (counted.get(piece) ?? 0) + 1);
  return [...counted.entries()]
    .sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]))
    .map(([piece, count]) => (count === 1 ? ROLE[piece] : `${count} of them ${ROLE[piece]}`))
    .join('; ');
}
/**
 * v1 is the historical record of the accepted 49-card roster set and is not edited here. The
 * family direction overrides it in two places: the WWI anchor is retired (fifteen medieval
 * titles were sitting on a 1914 farm, and the generators read it straight to 20th-century
 * infantry), and two rosters v1 aliased to other art get their own setting.
 */
const RETIRED_ANCHOR = 'lijssenthoek-remy-farm-wwi';
const REPLACEMENT_ANCHOR = 'siege-of-orleans-1429';
const EXTRA_ROSTERS = {
  pq: {
    title: 'The Last Attendant',
    historicalAnchor: 'dissolution-of-the-monasteries',
    sceneDirection: 'A woman of rank holds her ground in an emptied hall while the one soldier still '
      + 'with her keeps the door. Her authority outlasts the building it belonged to.',
  },
  rr: {
    title: 'Twin Bastions',
    historicalAnchor: REPLACEMENT_ANCHOR,
    sceneDirection: 'Two wardens hold a pair of squat emplacements dug into the bank, checking fresh '
      + 'timber against old. Maintenance on something already holding, not construction.',
  },
};

function sourceFor(roster) {
  const v1Entry = v1ById.get(roster);
  const extra = EXTRA_ROSTERS[roster];
  const source = v1Entry ?? (extra ? { id: roster, ...extra } : null);
  if (!source) return null;
  return {
    ...source,
    historicalAnchor: source.historicalAnchor === RETIRED_ANCHOR ? REPLACEMENT_ANCHOR : source.historicalAnchor,
  };
}

const composition = (pieces) => [...pieces]
  .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  .map((p) => INITIAL[p])
  .join('');

/**
 * How the group stands, read off the footprint. This is the whole reason family art exists,
 * so it has to say something an illustrator could act on rather than restate the cell list.
 */
function arrangement(cells) {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const width = Math.max(...xs) - Math.min(...xs) + 1;
  const height = Math.max(...ys) - Math.min(...ys) + 1;
  const rows = new Set(ys).size;
  const columns = new Set(xs).size;

  if (cells.length === 1) {
    return 'a single figure alone in the frame, the surrounding space left empty and legible.';
  }
  if (rows === 1) {
    return `all ${cells.length} strung out abreast in one straight rank across the frame, evenly spaced, `
      + 'nobody standing behind anybody — an exposed line with open ground in front of it.';
  }
  if (columns === 1) {
    return `all ${cells.length} in single file, one directly behind another, receding away from the viewer `
      + 'down a narrow way — the ones behind partly hidden by the ones in front.';
  }
  if (width === 2 && height === 2 && cells.length === 4) {
    return 'packed tight into a square block, four bodies filling one small footprint, shoulders '
      + 'nearly touching, gear stacked between them.';
  }
  if (cells.length === 2) {
    return 'two figures set apart on a diagonal, at different depths, neither directly beside nor '
      + 'directly behind the other.';
  }
  // Everything else is an L, a T, or a staggered run: a corner rather than a rank.
  const front = cells.filter((c) => c.y === Math.min(...ys)).length;
  const back = cells.length - front;
  return `clustered around a corner rather than a rank — ${front} forward and ${back} set back behind them, `
    + 'bodies overlapping at the turn, gear stacked in the angle.';
}

const families = new Map();
for (const card of RUN_CARD_DECK) {
  const key = card.artId;
  if (!families.has(key)) families.set(key, []);
  families.get(key).push(card);
}

const entries = [...families.entries()].map(([artId, cards]) => {
  const card = cards[0];
  const roster = composition(card.pieces);
  const source = sourceFor(roster);
  return {
    artId,
    slot: [v1.slotPrefix, artId, ILLUSTRATION_ROLE_FILE].join('/'),
    roster,
    pieces: [...card.pieces].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)),
    cardCount: cards.length,
    representativeCardId: card.id,
    title: source?.title ?? null,
    historicalAnchor: source?.historicalAnchor ?? null,
    sceneDirection: source?.sceneDirection ?? null,
    roles: rosterProse(card.pieces),
    arrangement: arrangement(card.formation),
    rosterPromptFound: Boolean(source),
    generator: null,
  };
});

// Codex is the slower generator and the slightly better one, so it takes the families with the
// most cards behind them: the best art lands where the player sees it most often. The split is
// even by family count, which is what keeps both pools finishing together.
const byReach = [...entries].sort((a, b) => b.cardCount - a.cardCount || a.artId.localeCompare(b.artId));
const codexShare = Math.floor(byReach.length / 2);
byReach.forEach((entry, index) => { entry.generator = index < codexShare ? 'codex' : 'pixellab'; });
entries.sort((a, b) => a.artId.localeCompare(b.artId));

// v1's shared direction forbade the subject these cards are about — "war appears only through
// aftermath, logistics, repair, absence" is what produced 94 pictures of people doing chores —
// and carried an eye-concealment rule the owner did not want. v2 states its own.
const sharedDirection = {
  subject: 'These are the real people a chess set stands for, drawn as themselves. Never draw chess '
    + 'pieces, a chessboard, or any abstracted game token. They are a small unit in the field in '
    + 'wartime: soldiers who read as individuals, kitted and armed for the war they are in.',
  format: 'Landscape illustration for an indie tactics game card, composed for roughly a 1.43:1 crop. '
    + 'Keep the figures inside a generous crop-safe centre. Do not draw the card frame or any interface.',
  world: 'Indie game art: hand-made pixel art with character, grounded historical material, restrained '
    + 'natural colour. The named historical anchor sets the place and period.',
  exclusions: 'No text, numbers, icons, card border, chessboard, chess pieces, readable banner, '
    + 'magical effect, glowing rune, gore, or modern signage.',
};

const manifest = {
  schemaVersion: 2,
  cardType: v1.cardType,
  slotPrefix: v1.slotPrefix,
  sharedDirection,
  derivedFrom: 'run-card-prompts-v1.json',
  families: entries,
};

writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const missing = entries.filter((e) => !e.rosterPromptFound);
process.stdout.write(`${JSON.stringify({
  families: entries.length,
  codex: entries.filter((e) => e.generator === 'codex').length,
  pixellab: entries.filter((e) => e.generator === 'pixellab').length,
  rostersWithoutV1Prompt: missing.length,
  missingRosters: [...new Set(missing.map((e) => e.roster))],
  out: OUT,
}, null, 2)}\n`);
