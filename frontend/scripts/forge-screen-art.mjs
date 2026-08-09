// Forge full-screen workspace BACKDROP candidates (codex imagegen) for the Studio's
// Screen Art review surface.
//
// A backdrop is not a texture and not an asset: it is a scenic panel that a whole
// workspace sits on top of, so it is generated from a SET BRIEF (hidden scenario +
// per-panel shot direction, docs/background-set-briefs.md) rather than a material
// description. Every panel in a set inherits one preamble and then diverges in
// camera, hour, enclosure, and palette -- prompting six variations off one broad
// prompt is the documented failure mode that produced reshaped copies of one scene.
//
// Codex emits 3:2 or square, never 16:9. The uploaded REVIEW plate is normalized to
// 640x360 so the studio compares every candidate at one framing; the NATIVE bytes are
// kept beside it under frontend/tmp/screen-art/ because acceptance attests native 1x
// and a downscaled file cannot honestly make that claim.
//
//   node frontend/scripts/forge-screen-art.mjs <set> [--scene <id>] [--tries 2] -- <upload options>
import { mkdirSync, mkdtempSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODEX, runCodex, imageGenVerdict, sessionImage } from './codex-imagegen.mjs';
import { optionValue, splitGeneratorArgs, uploadGeneratedCandidate } from './upload-generated-candidate.mjs';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const NATIVE_DIR = join(SCRIPTS, '..', 'tmp', 'screen-art');

const SETS = {
  // The Run's opening screen: Commendatio, the act of entering a lord's service. The player is
  // asked whose household they join, so the room is a court that has been made ready to receive
  // someone — and the seat of the man they would serve is the thing the picture withholds.
  commendatio: {
    scenario: 'a hall has been prepared for someone to be received into service. The household has set the room, laid out the record, and stepped back. The lord is not shown, the oath is not being sworn, and whoever is about to enter has not entered yet',
    contradiction: 'ceremonial and transactional; prepared and unoccupied; grand and thinly staffed',
    forbidden: 'no crowning, no kneeling figure mid-oath, no hands clasped between hands, no crowd or court audience, no throned figure, no readable heraldry, crest, banner lettering or blazon that names a house, no weapons drawn, and nothing that says which lord this is',
    scenes: {
      'commendatio-hall': {
        label: 'Commendatio — The Hall Made Ready',
        shot: 'Eye-level, standing at the foot of a long stone hall looking up its length toward a raised dais at the far end. On the dais a single high-backed carved chair stands EMPTY, angled slightly, with a folded cloth over one arm. The floor between is bare swept flagstone. Along the side walls hang heavy plain textiles with no device on them. A single clerk in a dark gown stands well off to one side at a small writing table with an open ledger, seen in profile with head down and face not readable. Nobody else is in the room. Tall lancet windows throw long light across the empty floor.',
        palette: 'cold north daylight through tall glass; grey limestone, deep red and umber hangings, dark oak, one warm candle on the clerk\'s table',
      },
      'commendatio-dais': {
        label: 'Commendatio — The Dais, Close',
        shot: 'Low three-quarter view close to a stone dais of three worn steps, looking up. The carved chair on it is EMPTY and seen from the side. On the top step sit the things a reception needs and nothing more: a shallow bowl, a folded stole, an unrolled blank sheet weighted at its corners with two smooth stones. The stone of the steps is dished from centuries of feet. Behind, a plain hanging and the corner of a high window. No people at all.',
        palette: 'warm low afternoon light raking across worn stone; honey limestone, faded crimson cloth, black shadow under the chair, cool blue in the window',
      },
      'commendatio-antechamber': {
        label: 'Commendatio — The Waiting Room',
        shot: 'Interior of a small vaulted antechamber beside the great hall, seen from a corner. A plain bench runs along one wall with three cloaks and a travelling bag left on it, as if their owners have just been called through. A heavy door stands ajar at the far side, spilling brighter light from the hall beyond into this dimmer room. On a stool by the door, a doorkeeper sits with a staff across their knees, head turned away toward the light so their face is not readable. Boot-mud dries on the flagstones.',
        palette: 'dim stone-blue shadow in the near room against a warm bright wedge of light through the open door; grey vault, brown leather and wool, one iron lamp',
      },
      'commendatio-yard': {
        label: 'Commendatio — The Court Below',
        shot: 'High three-quarter view down into a small enclosed castle courtyard at first light, from an upper gallery. The yard is swept clean and empty except for three saddled horses standing tied at a rail with nobody attending them, and a trestle set up by the door to the keep with a closed box on it. A wide stone stair climbs from the yard to a doorway standing open. Frost still lies in the shadowed half of the yard. One figure in a hooded cloak crosses the yard toward the stair, small and seen from above and behind.',
        palette: 'pale blue-gold first light, frost-white in the shade; grey granite, dark timber galleries, chestnut horses, one lit window high in the keep',
      },
    },
  },
  // docs/background-set-briefs.md -> "Set 06 Candidate: Spolia".
  spolia: {
    scenario: 'goods have changed hands without anyone handing them over. A household, a chapel or a farm has stopped, and what it owned is being counted, tagged, wrapped and moved by people who did not own it and are not explained',
    contradiction: 'careful and dispossessed; orderly and bereaved; valuable and unclaimed',
    forbidden: 'no body, no grave being dug, no funeral, no mourners, no looting or violence, no soldiers, no fire, no readable writing on any tag or page, no heraldry or crest that names an owner, and nothing that explains who died or why the place stopped',
    scenes: {
      'spolia-ruin': {
        label: 'Spolia — The Stripped Nave',
        shot: 'Eye-level, standing inside a small ROOFLESS ruined stone church. The roof is entirely gone: open overcast sky above the bare wall-tops, weather coming straight down into the room. Grass and thin saplings grow out of the cracked flagstone floor. One arched wall niche has been pried empty, its stone edge freshly chipped and paler than the weathered wall around it. In the middle of the floor a plank has been laid across two fallen blocks and four or five wrapped cloth bundles and one small open chest are set out on it in a neat row, each with a scrap of pale paper tied on with string. Nobody is in the room.',
        palette: 'cold overcast daylight; pale grey stone, wet-green moss and grass, chalk-white sky, one muted warm note in the cloth bundles',
      },
      'spolia-inventory': {
        label: 'Spolia — The Long Table',
        shot: 'Low three-quarter view down the length of a long plank table inside a lamp-lit farmhouse hall at night. The whole table is covered with one household\'s possessions laid out in careful rows: pewter cups, a folded stack of linen, a candlestick, a small bell, cooking iron, a wooden box with the lid back — every item with a paper tag tied to it. Chairs are pushed back from the table and empty. A coat is folded over one chair back. The hearth at the far wall is cold and swept. At the very far end of the table, small and dim, one hooded figure stands with their back to us, leaning over an open ledger. Their face is not visible at all.',
        palette: 'warm amber lamplight falling on the tabletop, deep brown shadow in the roof beams and corners, cold blue night in the one window',
      },
      'spolia-crossing': {
        label: 'Spolia — The Loading Yard',
        shot: 'Exterior at dusk in steady rain, mid-distance. A stone gate-porch of a chapel or manor house, seen from across a wet cobbled yard. Under the dry strip of the eave: stacked crates, tied bundles, a rolled rug on its end, and a handcart half-loaded and tipped on its shafts. The stone niches on the porch wall above are all empty. A patient work horse stands in the rain in harness, head low. One figure in a soaked heavy cloak, seen from behind, is roping the load down. Puddles hold the last light.',
        palette: 'blue-grey rain, slate wet cobbles, dark saturated stone, one small warm lantern glow inside the porch',
      },
      'spolia-field': {
        label: 'Spolia — The Barn That Fell',
        shot: 'Wide high-ish exterior in bright overcast summer daylight. A stone barn has collapsed at one end in the middle of a green field; its roof timbers are down and the good stone has already been stacked separately in a tidy pile. On the grass in front of it a large canvas sheet is spread out and objects have been laid on it in an even grid — pots, hand tools, a bell, a bundle of linen, a chest with the lid back. A work horse grazes nearby, untethered. One figure kneels at the edge of the canvas with their back half-turned and a wide straw hat hiding their face completely, sorting. The field goes on to a hedgerow and low hills.',
        palette: 'bright but sunless summer daylight; many greens, pale limestone, weathered grey timber, off-white canvas; beautiful and ordinary',
      },
    },
  },
};

function prompt(set, scene, prior) {
  return `IMAGE-GENERATION task: create ONE PNG by GENERATING it with the built-in image_gen tool (the imagegen skill). Do NOT hand-draw it with code (PIL/Pillow, cairo, matplotlib, SVG, HTML/CSS, canvas), do NOT write a script, and do NOT crop or extract from any file — programmatic output is automatically rejected and you will be asked again.${prior ? `\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED: ${prior}\n` : ''}

Generate a WIDE 16:9 LANDSCAPE pixel-art SCENIC BACKGROUND for a video game screen.

STYLE — most important: refined, detailed PIXEL ART in the manner of a high-quality modern 16-bit game background (Octopath Traveler, Owlboy, Eastward, Final Fantasy Tactics scenery). Fine but clearly VISIBLE pixels, a limited harmonious palette, tasteful dithering, real atmospheric depth. It MUST read as crafted game background art — NOT a photograph, NOT a smooth digital painting, NOT concept art, NOT a 3D render, NOT an oil-painting texture. Grounded medieval material culture (roughly 1000-1500 AD): stone, timber, plaster, iron, cloth, mud, grass, weather.

THE SCENE: ${scene.shot}

PALETTE AND LIGHT: ${scene.palette}.

WHAT THE IMAGE KNOWS AND WITHHOLDS: ${set.scenario}. The picture must show only the residue of that, never the event. Hold the contradiction: ${set.contradiction}.

HARD EXCLUSIONS — any one of these ruins the image:
- NO readable faces. Any person must have their eyes hidden by distance, a hood, a hat brim, a turned head, or being seen from behind. No pupils, no eye contact, no expression. Do not make the figures inhuman, statue-like or featureless — they are ordinary near-human people whose identity is simply withheld.
- ${set.forbidden}.
- NO chessboard, checkered floor, game pieces, cards, dice or any meta-game prop.
- NO magic: no glowing runes, portals, crystals, auras, spell light or supernatural effects. Light comes only from sun, sky, fire, candle or lamp.
- NO text, letters, numbers, signage, watermark, logo, UI, border, frame or vignette. Tags and pages are blank paper.
- NO modern objects, NO gore, NO grimdark horror, NO cute fairy-tale whimsy, NO heroic poster composition, NO active battle.

COMPOSITION: this is a full-screen backdrop that user-interface panels will be drawn on top of, so keep the middle of the frame comparatively calm and low-contrast and let the detail and incident live around the edges and in the depth. Fill the canvas edge to edge — fully opaque, no letterboxing, no black bars, no margin. It should look like an ordinary, even beautiful medieval scene at first glance, and only become strange on a second look.

Save it as ./backdrop.png in the current working directory, then stop.`;
}

function normalize(input, output) {
  const script = join(SCRIPTS, 'normalize-screen-plate.py');
  const done = spawnSync('python', [script, input, output], { encoding: 'utf8' });
  if (done.error) return { ok: false, reason: String(done.error.message) };
  if (done.status !== 0) return { ok: false, reason: (done.stderr || done.stdout || `python exit ${done.status}`).trim().split('\n').pop() };
  return { ok: true };
}

async function forgeScene(setName, set, sceneId, scene, maxTries) {
  let prior = '';
  for (let attempt = 1; attempt <= maxTries; attempt += 1) {
    const work = mkdtempSync(join(tmpdir(), `screenart-${sceneId}-`));
    try {
      const { out: jsonl } = await runCodex(work, prompt(set, scene, prior));
      const verdict = imageGenVerdict(jsonl);
      if (!verdict.ok) {
        console.log(`  ${sceneId} try ${attempt}: METHOD x — ${verdict.reason}`);
        prior = 'the rollout shows you did NOT emit an image_generation_call — you hand-drew the PNG in code. You MUST use the built-in image_gen tool to GENERATE it as a real bitmap.';
        continue;
      }
      const native = sessionImage(verdict.tid);
      if (!native) { prior = 'image not found; generate again into the default folder.'; continue; }

      mkdirSync(NATIVE_DIR, { recursive: true });
      const keptNative = join(NATIVE_DIR, `${sceneId}-codex-native.png`);
      copyFileSync(native, keptNative);

      const plate = join(work, 'plate.png');
      const shaped = normalize(native, plate);
      if (!shaped.ok) { console.log(`  ${sceneId}: normalize failed — ${shaped.reason}`); return { sceneId, pass: false }; }

      const provenance = join(work, 'provenance.json');
      writeFileSync(provenance, `${JSON.stringify({
        generator: 'forge-screen-art', set: setName, scene: sceneId, threadId: verdict.tid,
        nativeKeptAt: keptNative, reviewPlate: '640x360 centre-crop + lanczos',
      }, null, 2)}\n`);

      uploadGeneratedCandidate(plate, [
        ...uploadArgs,
        '--label', `Run screen backdrop candidate — ${sceneId} (codex)`,
        '--provenance-json', provenance,
      ], `review/run-screen-art/${sceneId}/codex.png`);
      console.log(`  ${sceneId} try ${attempt}: ok — uploaded, native kept at ${keptNative}`);
      return { sceneId, pass: true };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  return { sceneId, pass: false };
}

const { toolArgs, uploadArgs } = splitGeneratorArgs(process.argv.slice(2));
if (!uploadArgs.length) throw new Error('forge-screen-art requires live-media options after --');
const setName = toolArgs.find((arg) => !arg.startsWith('--') && SETS[arg]) || 'spolia';
const set = SETS[setName];
const only = optionValue(toolArgs, '--scene');
const triesIndex = toolArgs.indexOf('--tries');
const maxTries = Math.max(1, parseInt(triesIndex >= 0 ? toolArgs[triesIndex + 1] : '2', 10));
const scenes = Object.entries(set.scenes).filter(([id]) => !only || id === only);
if (!scenes.length) throw new Error(`no scene '${only}' in set '${setName}'`);

console.log(`forge-screen-art: set ${setName}, ${scenes.length} scene(s)\n  codex: ${CODEX}\n`);
const results = await Promise.all(scenes.map(([id, scene]) => forgeScene(setName, set, id, scene, maxTries)));
const ok = results.filter((r) => r.pass).length;
console.log(`\n==== ${ok}/${results.length} backdrops forged ====`);
for (const r of results.filter((r) => !r.pass)) console.log(`  FAILED: ${r.sceneId}`);
