// Generates one coherent horizontal + vertical rail family against a fixed
// native-pixel lane template, then admits the whole family at 1:1 or rejects it.
// Generated pixels come only from the image model; local code creates guides,
// removes the chroma key, validates geometry, and extracts fixed lane crops.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { imageGenVerdict, removeChromaKey, runCodex, sessionImage } from './codex-imagegen.mjs';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const repo = resolve(frontend, '..');
const spec = JSON.parse(readFileSync(resolve(frontend, 'config/native-rail-generation.json'), 'utf8'));
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));

const role = args.role;
const provider = args.provider ?? 'codexDenseFamily';
const attemptId = args.id;
const maxTries = Number(args.tries ?? 3);
if (!role || !attemptId || !Number.isInteger(maxTries) || maxTries < 1) {
  throw new Error('usage: node scripts/forge-native-rail-family.mjs --role=outer|inner --id=<versioned-id> [--provider=codexDenseFamily] [--tries=3]');
}

const roleSpec = spec.roles[role];
const template = roleSpec?.templates?.[provider];
if (!roleSpec || !template?.patterns || !template.styleReference) {
  throw new Error(`${role}/${provider} must be a cohesive family template with patterns and a styleReference`);
}

const revision = template.revision ? `-v${template.revision}` : '';
const templatePath = resolve(repo, `docs/art/chrome-native-rails/v1/templates/${role}-${provider}-rail-template${revision}.png`);
const stylePath = resolve(frontend, template.styleReference);
const attemptsDir = resolve(repo, 'docs/art/chrome-native-rails/v1/attempts');
mkdirSync(attemptsDir, { recursive: true });

function prompt(priorFailure = '') {
  return `IMAGE-GENERATION task: edit the FIRST attached image with the built-in image generation tool. The first image is a geometry template; the second image is style reference only.

Create ONE coherent ${role.toUpperCase()} chrome rail family in this exact ${template.width}x${template.height} canvas. The installed rail thickness is exactly ${roleSpec.thickness}px at 100% source scale.

GEOMETRY CONTRACT:
- Keep every pixel outside the dark guide lanes perfectly flat #ff00ff.
- Replace every dark guide lane with rail artwork, but paint absolutely nothing outside those lanes.
- The left field contains horizontal rails. The right field contains vertical rails. They are one family from this one generation.
- Every rail must occupy its complete lane thickness and continue uninterrupted to both lane ends.
- No end caps, corner atoms, junction plates, sockets, labels, text, panel fills, buttons, or second parallel frame edge.

FAMILY CONTRACT:
- Match the SECOND image's dark navy/gunmetal palette, aged-metal texture, restrained gold accents, bevel weight, and pixel density.
- Horizontal and vertical members must unmistakably be the same manufactured object: same material, palette, repeated module vocabulary, line weight, and level of detail.
- Adapt lighting for orientation without changing the design family. Do not merely rotate one rendered bitmap.
- Crisp hard pixels. No blur, smoothing, glow, or antialiased vector look.

This is a fixed native-pixel manufacturing sheet. Do not resize the template or enlarge the rails. Do not draw or repair the output with code. Generate the edited image and stop.${priorFailure ? `\n\nTHE PREVIOUS ATTEMPT WAS REJECTED BY THE FIXED-LANE GATE:\n${priorFailure}\nCorrect the generation itself; do not propose post-processing.` : ''}`;
}

const importer = resolve(frontend, 'scripts/import-native-rail-attempt.mjs');
let priorFailure = '';
for (let attempt = 1; attempt <= maxTries; attempt += 1) {
  const work = mkdtempSync(join(tmpdir(), `native-rail-${role}-`));
  console.log(`[${attemptId}] generation ${attempt}/${maxTries}`);
  const result = await runCodex(work, prompt(priorFailure), [templatePath, stylePath]);
  writeFileSync(resolve(attemptsDir, `${attemptId}-try${attempt}.jsonl`), result.out);
  const verdict = imageGenVerdict(result.out);
  if (!verdict.ok) {
    priorFailure = `Method gate: ${verdict.reason}`;
    console.error(priorFailure);
    continue;
  }

  const generated = sessionImage(verdict.tid);
  if (!generated) {
    priorFailure = `No image was found for verified generation thread ${verdict.tid}`;
    console.error(priorFailure);
    continue;
  }

  const sourceAttempt = resolve(attemptsDir, `${attemptId}-try${attempt}-source.png`);
  const alphaAttempt = resolve(attemptsDir, `${attemptId}-try${attempt}-alpha.png`);
  copyFileSync(generated, sourceAttempt);
  const chroma = removeChromaKey(sourceAttempt, alphaAttempt);
  if (!chroma.ok) {
    priorFailure = `Chroma-key gate: ${chroma.reason}`;
    console.error(priorFailure);
    continue;
  }

  const sourceArg = `../docs/art/chrome-native-rails/v1/attempts/${basename(alphaAttempt)}`;
  const admitted = spawnSync(process.execPath, [importer,
    `--role=${role}`,
    `--provider=${provider}`,
    `--id=${attemptId}`,
    `--source=${sourceArg}`,
  ], { cwd: frontend, encoding: 'utf8' });

  if (admitted.status !== 0) {
    priorFailure = (admitted.stderr || admitted.stdout || `importer exit ${admitted.status}`).trim();
    console.error(priorFailure);
    continue;
  }

  const sourceFinal = resolve(attemptsDir, `${attemptId}-source.png`);
  const alphaFinal = resolve(attemptsDir, `${attemptId}-alpha.png`);
  copyFileSync(sourceAttempt, sourceFinal);
  copyFileSync(alphaAttempt, alphaFinal);
  const finalSourceArg = `../docs/art/chrome-native-rails/v1/attempts/${basename(alphaFinal)}`;
  const finalAdmission = spawnSync(process.execPath, [importer,
    `--role=${role}`,
    `--provider=${provider}`,
    `--id=${attemptId}`,
    `--source=${finalSourceArg}`,
  ], { cwd: frontend, encoding: 'utf8' });
  if (finalAdmission.status !== 0) throw new Error(finalAdmission.stderr || finalAdmission.stdout);
  console.log(finalAdmission.stdout.trim());
  console.log(`${attemptId}: coherent family generated and admitted from one image-generation call`);
  process.exit(0);
}

throw new Error(`${attemptId}: no coherent native-size family passed after ${maxTries} generated attempts\n${priorFailure}`);
