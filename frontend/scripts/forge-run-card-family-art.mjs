// Forge one illustration per card-art family (ADR-0516) across BOTH generators at once.
//
//   node scripts/forge-run-card-family-art.mjs --out <dir> [--only <artId,...>] [--limit N]
//                                              [--codex-concurrency 4] [--pixellab-concurrency 4]
//
// Codex and PixelLab run as two independent pools in parallel. Codex is ~112s per image and
// PixelLab ~50s, so an even split with Codex at higher concurrency lands both pools together
// rather than making the slower one the whole wall clock.
//
// Codex output is method-gated on its ROLLOUT log (`image_generation_call` /
// `image_generation_end`) — stdout is abridged and never carries the event, so grepping it
// makes every genuine generation look code-drawn. See scripts/codex-imagegen.mjs.
//
// Writes PNGs plus an index.json into --out. Installation to live media is a separate step.
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  runCodex, imageGenVerdict, sessionImage, threadIdOf,
} from './codex-imagegen.mjs';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const DEFAULT_MANIFEST = fileURLToPath(new URL('../../docs/art/run-card-family-prompts-v2.json', import.meta.url));
const WIDTH = 400;
const HEIGHT = 280;

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const OUT = flag('out', join(tmpdir(), 'run-card-family-art'));
const ONLY = flag('only', '') ? new Set(flag('only', '').split(',')) : null;
const LIMIT = Number(flag('limit', '0')) || 0;
const CODEX_CONCURRENCY = Number(flag('codex-concurrency', '4'));
const PIXELLAB_CONCURRENCY = Number(flag('pixellab-concurrency', '4'));
// Starter kings key art per CARD rather than per (footprint, roster) family, so they carry
// their own manifest in the same shape; --manifest points the same two pools at it.
const MANIFEST = flag('manifest', DEFAULT_MANIFEST);

mkdirSync(OUT, { recursive: true });

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const shared = manifest.sharedDirection;

let families = manifest.families;
if (ONLY) families = families.filter((f) => ONLY.has(f.artId));
if (LIMIT) families = families.slice(0, LIMIT);

// --- PixelLab over the MCP HTTP transport --------------------------------------------------
// The token lives in the operator's own MCP client config; it is read at run time and never
// written to disk, logged, or committed.
function pixelLabServer() {
  const cfgPath = join(homedir(), '.claude.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  for (const project of Object.values(cfg.projects ?? {})) {
    const server = project?.mcpServers?.pixellab;
    if (server?.url && server?.headers) return server;
  }
  throw new Error('no pixellab MCP server configured');
}

let rpcId = 0;
async function pixelLabCall(server, name, argumentsValue) {
  const response = await fetch(server.url, {
    method: 'POST',
    headers: { ...server.headers, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: (rpcId += 1), method: 'tools/call', params: { name, arguments: argumentsValue },
    }),
  });
  const text = await response.text();
  // The transport answers as SSE; the JSON-RPC envelope is the last `data:` line.
  const line = text.split('\n').filter((l) => l.startsWith('data:')).pop();
  if (!line) throw new Error(`pixellab ${name}: no data frame (${response.status}) ${text.slice(0, 200)}`);
  const payload = JSON.parse(line.slice(5).trim());
  if (payload.error) throw new Error(`pixellab ${name}: ${JSON.stringify(payload.error).slice(0, 300)}`);
  return payload.result;
}

const textOf = (result) => (result?.content ?? [])
  .filter((part) => part.type === 'text')
  .map((part) => part.text)
  .join('\n');

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// --- Prompts --------------------------------------------------------------------------------
// Two shapes on purpose. Codex gets little guidance: it reads a short brief better than a
// specification, and over-directing it is what produced 47 careful pictures of the wrong
// subject. PixelLab keeps the tighter style parameters, because its look is the one that
// matches the installed catalog.

// A king card names the monarch whose reign produced the act it is titled after. That name is
// context for the generator and for us, never a caption: it buys period-exact dress, regalia and
// setting that "a medieval king" does not. Cards without a monarch keep the original unit framing.
function framingFor(family) {
  return family.monarch
    ? `The king in this picture is ${family.monarch}. ${family.monarchNote ?? ''} Draw that man, in the dress and regalia of his own reign, and put no name, date, caption or lettering anywhere in the image.`
    : 'They are a unit in the field, in the middle of a war, and they read as individuals.';
}

function codexPrompt(family) {
  return `IMAGE-GENERATION task: create ONE PNG by GENERATING it with the built-in image_gen tool (the imagegen skill). Do NOT hand-draw it with code (PIL/Pillow, cairo, matplotlib, SVG, HTML/CSS, canvas), do NOT write a script, and do NOT crop or extract from any file — programmatic output is automatically rejected and you will be asked again.

Card art for an indie tactics game. Landscape, roughly 1.43:1.

${shared.medium ?? 'Indie game pixel art.'}

${shared.subject}

The figures are — ${family.roles}.

${framingFor(family)} Draw EXACTLY ${family.pieces.length} ${family.pieces.length === 1 ? 'figure' : 'figures'} — no crowd, no extra soldiers behind them. ${family.arrangement}

${family.sceneDirection}

Setting: ${family.historicalAnchor}.

${shared.world}

${shared.exclusions}

Fill the frame edge to edge. Save it as ./card.png in the current working directory, then stop.`;
}

function pixelLabPrompt(family) {
  return [
    `Exactly ${family.pieces.length} ${family.pieces.length === 1 ? 'figure' : 'figures'} and no more, a unit at war in the field: ${family.roles}.`,
    `They read as individual soldiers, armed and kitted for the fighting, not as townsfolk at work.`,
    family.arrangement,
    // The manifest's scene is the richest signal there is, and it used to be dropped here:
    // without it pixflux falls back to what it is best at, a character line-up, and answers a
    // four-figure brief with nine identical soldiers on a flat field (kings batch, 8/8).
    family.sceneDirection,
    `One illustrated moment happening in a real place, never a character line-up, roster row, turnaround or sprite sheet.`,
    `Do not repeat, mirror or duplicate a figure, and put nobody in the background behind them.`,
    `Setting: ${family.historicalAnchor}. Grounded historical material, restrained natural colour.`,
    `A real place around them with ground, structures and depth — never a flat empty backdrop.`,
    `No chess pieces, no chessboard, no text, no icons, no card border, no signature or artist mark.`,
  ].filter(Boolean).join(' ');
}

// --- Generators -------------------------------------------------------------------------------
const palette = () => {
  const p = join(OUT, 'palette.png');
  return existsSync(p) ? readFileSync(p).toString('base64') : null;
};

async function forgePixelLab(server, family) {
  const started = Date.now();
  const create = await pixelLabCall(server, 'create_image_pixflux', {
    description: pixelLabPrompt(family).slice(0, 1900),
    width: WIDTH,
    height: HEIGHT,
    no_background: false,
    detail: 'highly detailed',
    shading: 'detailed shading',
    outline: 'selective outline',
    // A top-down view reads as a map tile, not card art. Scene cards override it to 'side'.
    view: family.pixelLabView ?? 'low top-down',
    text_guidance_scale: 9,
    ...(palette() ? { color_image_base64: palette() } : {}),
  });
  const jobId = /id:\s*([0-9a-f-]{36})/i.exec(textOf(create))?.[1];
  if (!jobId) throw new Error(`no job id: ${textOf(create).slice(0, 200)}`);

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await sleep(5000);
    const status = await pixelLabCall(server, 'get_image', { job_id: jobId });
    const body = textOf(status);
    if (/status:\s*completed/.test(body)) {
      const url = /download:\s*(\S+)/.exec(body)?.[1];
      if (!url) throw new Error('completed without a download url');
      const png = Buffer.from(await (await fetch(url)).arrayBuffer());
      const file = join(OUT, `${family.artId}.png`);
      writeFileSync(file, png);
      return { file, seconds: (Date.now() - started) / 1000, jobId };
    }
    if (/status:\s*(failed|error)/i.test(body)) throw new Error(body.slice(0, 200));
  }
  throw new Error('timed out waiting for pixellab');
}

async function forgeCodex(family) {
  const started = Date.now();
  const work = mkdtempSync(join(tmpdir(), `card-${family.artId}-`));
  const { out } = await runCodex(work, codexPrompt(family));
  const verdict = imageGenVerdict(out);
  if (!verdict.ok) throw new Error(`method gate: ${verdict.reason}`);
  const tid = threadIdOf(out);
  const image = tid ? sessionImage(tid) : null;
  if (!image) throw new Error('no generated image in the session directory');
  const file = join(OUT, `${family.artId}.png`);
  // Codex renders far above the slot size; the card window is 400x280.
  await sharp(image).resize(WIDTH, HEIGHT, { fit: 'cover', kernel: 'lanczos3' }).png().toFile(file);
  return { file, seconds: (Date.now() - started) / 1000, threadId: tid, native: image };
}

// --- Pools ------------------------------------------------------------------------------------
async function pool(items, concurrency, worker, label) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const family = items[index];
      // One retry. The whole batch is one wall-clock wave at full width, so a transient failure
      // otherwise costs a whole second run of the script to recover a single image.
      let last;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const outcome = await worker(family);
          results.push({ artId: family.artId, generator: label, ok: true, attempt, ...outcome });
          process.stdout.write(`ok   ${label.padEnd(8)} ${family.artId.padEnd(18)} ${outcome.seconds.toFixed(0)}s${attempt > 1 ? ` (retry ${attempt})` : ''}  (${results.length}/${items.length})\n`);
          last = null;
          break;
        } catch (error) {
          last = String(error.message ?? error);
          if (attempt < 2) {
            process.stdout.write(`retry ${label.padEnd(7)} ${family.artId.padEnd(18)} ${last.slice(0, 100)}\n`);
          }
        }
      }
      if (last) {
        results.push({ artId: family.artId, generator: label, ok: false, error: last });
        process.stdout.write(`FAIL ${label.padEnd(8)} ${family.artId.padEnd(18)} ${last.slice(0, 120)}\n`);
      }
    }
  });
  await Promise.all(runners);
  return results;
}

const server = pixelLabServer();
const codexFamilies = families.filter((f) => f.generator === 'codex');
const pixelFamilies = families.filter((f) => f.generator === 'pixellab');

process.stdout.write(`forging ${families.length} families: ${codexFamilies.length} codex (x${CODEX_CONCURRENCY}), ${pixelFamilies.length} pixellab (x${PIXELLAB_CONCURRENCY}) -> ${OUT}\n`);
const startedAll = Date.now();

const [codexResults, pixelResults] = await Promise.all([
  pool(codexFamilies, CODEX_CONCURRENCY, forgeCodex, 'codex'),
  pool(pixelFamilies, PIXELLAB_CONCURRENCY, (family) => forgePixelLab(server, family), 'pixellab'),
]);

const all = [...codexResults, ...pixelResults];
const index = {
  generatedAtSeconds: (Date.now() - startedAll) / 1000,
  width: WIDTH,
  height: HEIGHT,
  ok: all.filter((r) => r.ok).length,
  failed: all.filter((r) => !r.ok).length,
  results: all.sort((a, b) => a.artId.localeCompare(b.artId)),
};
writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ ok: index.ok, failed: index.failed, seconds: Math.round(index.generatedAtSeconds), out: OUT }, null, 2)}\n`);
