import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultRepoRoot = path.resolve(frontendRoot, '..');

// Runtime, review, candidate, and source-media bytes belong to live object
// storage. Keep this extension list intentionally broader than today's asset
// inventory so a new art/audio/source format cannot silently reopen the Git
// path. Text schemas, prompts, and deterministic geometry remain allowed.
export const MEDIA_EXTENSIONS = new Set([
  '.3ds', '.3fr', '.7z', '.aac', '.afdesign', '.afphoto', '.aif', '.aifc',
  '.aiff', '.ai', '.amr', '.arw', '.ase', '.aseprite', '.au', '.avif', '.bin',
  '.blend', '.bmp', '.bz2', '.caf', '.cdr', '.cr2', '.cr3', '.cur', '.dae', '.dcr',
  '.dds', '.dng', '.eot', '.eps', '.erf', '.exr', '.fbx', '.fig', '.flac',
  '.gif', '.glb', '.gltf', '.gz', '.hdr', '.heic', '.heif', '.ico', '.iiq', '.indd',
  '.j2k', '.jp2', '.jpeg', '.jpg', '.kdc', '.kra', '.ktx', '.ktx2', '.m4a',
  '.m4v', '.mef', '.mid', '.midi', '.mkv', '.mos', '.mov', '.mp2', '.mp3',
  '.mp4', '.mpe', '.mpeg', '.mpg', '.mpga', '.mrw', '.mtl', '.nef', '.nrw',
  '.obj', '.oga', '.ogg', '.ogv', '.opus', '.orf', '.otf', '.pcx', '.pdf',
  '.pef', '.ply', '.png', '.psb', '.psd', '.qoi', '.raf', '.rar', '.raw',
  '.rw2', '.rwl', '.sketch', '.snd', '.sr2', '.srf', '.srw', '.stl', '.svg',
  '.tar', '.tbz', '.tbz2', '.tga', '.tgz', '.tif', '.tiff', '.ttf', '.txz',
  '.usdz', '.wav', '.webm', '.webp', '.wma', '.woff', '.woff2', '.x3f', '.xcf',
  '.xz', '.zip', '.zst',
]);

// Persisted fixture bytes are exceptional: tests should normally generate them
// in a temporary directory. These three roots are the only repository paths
// where a genuinely tiny, explicitly named synthetic payload may be tracked.
export const SYNTHETIC_TEST_MEDIA_ROOTS = [
  'backend/test/fixtures/synthetic-media/',
  'frontend/src/test/fixtures/synthetic-media/',
  'packages/board-render/src/test/fixtures/synthetic-media/',
];
export const SYNTHETIC_TEST_MEDIA_MAX_BYTES = 16 * 1024;

// These one-time migration tools and frozen catalogs were deliberately deleted
// with the completed ADR-0085 cutover. Treat their exact paths as permanently
// retired so a future change cannot recreate the Git-backed authority.
const RETIRED_GIT_MEDIA_PATHS = [
  'frontend/scripts/migrate-live-assets.mjs',
  'frontend/scripts/migrate-live-assets.test.mjs',
  'frontend/config/native-rail-families.json',
  'frontend/src/ui/chromeCandidateManifest.json',
  'frontend/src/ui/nativeRailCandidateManifest.json',
  'frontend/src/core/propSeats.json',
  'packages/board-render/src/core/propSeats.json',
  'frontend/src/ui/design/wallDecorManifest.json',
  'packages/board-render/src/ui/design/wallDecorManifest.json',
  'packages/board-render/src/art/macroTiles.json',
  'frontend/src/core/wallArt.json',
  'packages/board-render/src/core/wallArt.json',
  'frontend/config/chrome-lab-defaults.json',
  'frontend/config/nine-slice-registry.json',
  'frontend/config/nine-slice',
  'frontend/src/generated/nine-slice.css',
  'frontend/scripts/nine-slice-kit.mjs',
  'frontend/scripts/vite-chrome-lab-defaults-plugin.mjs',
  'frontend/scripts/vite-nine-slice-geometry-plugin.mjs',
  'frontend/config/native-rail-generation.json',
  'frontend/config/chrome-family-extraction',
];
const PUBLIC_ROOT_PREFIX = 'frontend/public/';
const PUBLIC_ASSET_PREFIX = 'frontend/public/assets/';
const ALLOWED_PUBLIC_EXECUTABLE_FILES = new Set([
  'frontend/public/ambience/ambience-rain.wasm',
  'frontend/public/ambience/client.js',
  'frontend/public/ambience/manifest.json',
  'frontend/public/ambience/sim.js',
  'frontend/public/ambience/wasm_exec.js',
  'frontend/public/ambience/wasm_runtime.js',
]);
const PUBLIC_LEGAL_TEXT = /^frontend\/public\/legal\/fonts\/(?:README\.md|[^/]+\/[^/]+\.(?:md|txt))$/i;

const SCRIPT_EXTENSIONS = new Set(['.cjs', '.js', '.mjs', '.mts', '.ps1', '.py', '.sh', '.ts']);
const SCRIPT_PATH = /^(?:backend\/scripts\/|docs\/art\/|frontend\/scripts\/|scripts\/|tools\/)|(?:^|\/)vite\.config\.(?:js|mjs|ts)$/;
const EXTERNAL_SOURCE_FETCHER_PATH = /(?:^|\/)(?:fetch|download)[-_].*(?:art|asset|media|model|source)/i;
const COMMITTED_MEDIA_DESTINATION = /(?:frontend\/)?public\/(?:assets|kit-portfolio)(?:\/|\b)|(?:frontend\/)?src\/art\/[^\n]*\.generated\.(?:js|ts)/i;
const MEDIA_ONLY_REPOSITORY_DESTINATION = /docs\/art(?:\/|\b)|frontend\/scripts\/groundcover\/src(?:\/|\b)/i;
const PUBLIC_DESTINATION = /(?:frontend\/)?public(?:\/|\b)/i;
const MEDIA_EXTENSION_LITERAL = new RegExp(
  `\\.(?:${[...MEDIA_EXTENSIONS]
    .map((extension) => extension.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((left, right) => right.length - left.length)
    .join('|')})(?:\\b|["'\`])`,
  'i',
);
const WRITE_INTENT = /\b(?:appendFile|appendFileSync|copyFile|copyFileSync|createWriteStream|imwrite|outputFile|rename|renameSync|writeFile|writeFileSync|writePng)\s*\(|\.(?:save|toFile|write_bytes|write_text)\s*\(|\bopen\s*\([^\n)]*,\s*['"][awx][+b]?['"]|render\.filepath\s*=|\b(?:blender|cp|ffmpeg|magick|mv)\s+[^\n]+|--out(?:put)?\b/i;
const PRODUCER_NAME = /(?:^|\/)(?:assemble|bake|build|compose|export|forge|generate|normalize|pack|project|render|shot|split|vendor)[-_]/i;
const OUTPUT_NAME = /^(?:artifact|dest(?:ination)?|export|gen(?:erated)?|out(?:put)?)(?:_|$)/i;
const STATIC_POINTER_FILES = new Set([
  'frontend/public/asset-catalog.json',
  'frontend/src/asset-catalog.json',
  'frontend/src/ui/design/artworkManifest.json',
  'frontend/src/ui/design/kitManifest.json',
  'frontend/src/ui/design/kitProvenance.json',
  'frontend/src/ui/design/kitUsage.json',
]);
const STATIC_CANDIDATE_DATABASE_FILES = new Set([
  'frontend/config/native-rail-families.json',
  'frontend/src/ui/chromeCandidateManifest.json',
  'frontend/src/ui/nativeRailCandidateManifest.json',
]);
const CANONICAL_CHROME_SOURCE_SLOTS = new Set([
  'ui/chrome/outer/atom.png',
  'ui/chrome/outer/rail.png',
  'ui/chrome/inner/atom.png',
  'ui/chrome/inner/rail.png',
  'ui/chrome/divider/joint.png',
]);
const STATIC_POINTER_AUTHORITY = /["']status["']\s*:\s*["'](?:accepted_for_future_use|promoted|production-accepted)["']|accepted_and_frozen|owner_accepted|["']production_status["']\s*:|registeredForProduction["']?\s*[:=]\s*true|productionAccepted["']?\s*[:=]\s*true|["']accepted(?:Asset|Pointer|Version)Id?["']\s*:\s*["'][^"']+["']|accepted-surfaces\.json|(?:frontend\/public|\.\.\/public)\/asset-catalog\.json/i;
const STATIC_POINTER_CONFIG_AUTHORITY = /\b(?:registeredForProduction|productionAccepted)\s*[:=]\s*true\b|\bproduction_status\s*[:=]\s*["']?(?:accepted|promoted|production)|\baccepted(?:Asset|Pointer|Version)Id?\s*[:=]\s*["']?[A-Za-z0-9]/i;
const STATIC_CANDIDATE_LIFECYCLE = /(?:RIGHT_CANDIDATES|CANDIDATE_ROOT|ARCHIVE_ROOT|category\s*:\s*["'](?:candidate|archived)["'])[\s\S]{0,12000}(?:\/assets\/|\.png|\.webp|\.wav)/i;
const GENERATED_CANDIDATE_CATALOG_NAME = /candidate[^/]*(?:manifest|catalog|database)|(?:manifest|catalog|database)[^/]*candidate/i;
const GENERATED_CANDIDATE_CATALOG_MARKER = /["']generatedBy["']\s*:/i;
const GENERATED_CANDIDATE_CATALOG_ROWS = /["'](?:sources|candidates|families)["']\s*:/i;
const GENERATED_CANDIDATE_CATALOG_POINTER = /\/assets\/[^"'`\s]*candidate|["']?(?:source|candidate)Ids?["']?\s*:/i;
const CHROME_INSTALLED_SELECTOR_PATH = /(?:^|\/)(?=[^/]*chrome)(?=[^/]*(?:accepted|default|family|installed|production|runtime))[^/]*\.(?:c?js|json|mjs|mts|ts|tsx)$/i;
const CHROME_INSTALLED_CONTEXT = /\b(?:acceptedChrome|committedChrome|installedChrome|productionChrome|useInstalledChromeCss)\w*/i;
const CHROME_SOURCE_SELECTOR_LITERAL = /["']?((?:atom|rail)SourceId|(?:outer|inner|divider)(?:Atom|Rail)Source(?:Id|Path|Slot|Url)?)["']?\s*[:=]\s*["'`]([^"'`]+)["'`]/gi;
const CHROME_SOURCE_SELECTOR_KEY = /^(?:(?:atom|rail)SourceId|(?:outer|inner|divider)(?:Atom|Rail)Source(?:Id|Path|Slot|Url)?)$/i;
const GENERATED_CHROME_SOURCE_PATH = /(?:^|\/)assets\/ui\/chrome-candidates(?:\/|$)|(?:^|\/)ui\/chrome-candidates(?:\/|$)/i;
const SCROLLBAR_AUTHORITY_PATH = /(?:^|\/)[^/]*scrollbar[^/]*\.(?:c?js|mjs|mts|ts|tsx)$/i;
const STATIC_SCROLLBAR_ROSTER = /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::[^=\n]+)?=\s*\[[\s\S]{0,12000}\b(?:name|label|approach|material|file|src|url)\s*:/i;
const STATIC_SCROLLBAR_MEDIA_ROW = /\{[^{}]{0,600}\b(?:file|src|url)\s*:\s*["'`](?:\/assets\/)?ui\/scrollbars\//i;
const OLD_PUBLIC_ASSET_FILESYSTEM = /(?:frontend\/)?public\/assets(?:\/|\b)/i;
const OLD_DEDICATED_SOURCE_FILESYSTEM = /frontend\/scripts\/groundcover\/src(?:\/|\b)/i;
const BACKEND_SOURCE_PATH_IDENTIFIER = /(?:["']sourcePath["']|\bsourcePath)\s*:/;
const RETIRED_WALL_ART_AUTHORITY = /\b(?:applyLiveWallArt|loadLiveWallArt|BASELINE_WALL_ART|wallArtJson)\b|\/api\/wall-art\//;
const MEDIA_GUARD_INSPECTORS = new Set([
  'frontend/scripts/check-empty-panel-frame-overlay.mjs',
  'frontend/scripts/check-no-committed-media.mjs',
  'frontend/scripts/check-no-committed-media.test.mjs',
  'frontend/scripts/live-media-admin-client.mjs',
  'frontend/scripts/live-media-admin-client.test.mjs',
]);
const FINAL_CUTOVER_MARKER_EXEMPTIONS = new Set([
  'frontend/scripts/check-no-committed-media.mjs',
  'frontend/scripts/check-no-committed-media.test.mjs',
]);
const TEST_SOURCE_PATH = /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.test\.[^.\/]+$|(?:^|\/)[^\/]*smoke-test\.js$/;
const CUTOVER_SCAFFOLD_SOURCE_PATH = /^(?:backend\/|frontend\/(?:config|scripts|src)\/|scripts\/|k8s\/|\.github\/workflows\/)|^(?:Dockerfile|backend\/package\.json|frontend\/package\.json)$/;
const STATIC_AUTHORITY_SOURCE_PATH = /^(?:backend\/|frontend\/(?:config|scripts|src)\/|packages\/|k8s\/|\.github\/|scripts\/|tools\/)/;
const STATIC_AUTHORITY_CODE_EXTENSION = /\.(?:c?js|json|mjs|mts|ts|tsx)$/;
const STATIC_AUTHORITY_CONFIG_EXTENSION = /\.(?:jsonl|toml|ya?ml)$/;
const RUNTIME_MEDIA_POINTER_SOURCE_PATH = /^(?:backend\/|frontend\/(?:config|src)\/|packages\/)/;
const HARDCODED_IMMUTABLE_MEDIA_URL = /\/api\/media\/[0-9a-f]{64}\b/i;
const RETIRED_CUTOVER_SOURCE_MARKERS = [
  {
    pattern: /chrome-lab-defaults\.json|nine-slice-registry\.json|config\/nine-slice|DEFAULT_OG_IMAGE|PREVIEW_KIND_BY_STABLE_SLOT|SCROLLBAR_SLOT_PREFIX|DEFAULT_(?:DIVIDER|NINE_SLICE)_ASSET[^\n]{0,160}["'](?:panel|mode-button)|requiredNineSliceAsset\(["'](?:panel|mode-button|panel-divider)["']\)/,
    detail: 'compiled installed presentation identity/default/configuration remains after drawable-catalog cutover',
  },
  {
    pattern: /LIVE_MEDIA_(?:SERVING|IMPORT)_ENABLED|liveMedia(?:Serving|Import)Enabled/,
    detail: 'temporary live-media serving/import switch remains after final cutover',
  },
  {
    pattern: /(?:media-versions[^"'`\n]{0,160}\/bridge\b|legacy_media_import_closed|media_bridge_(?:requires|failed|migration)|legacy-bridge-activated[^"'`\n]{0,160}app\.(?:post|put|patch))/,
    detail: 'retired legacy-bridge creation capability remains after final cutover',
  },
  {
    // Reading imported bridges remains supported. Creating one does not: catch
    // the durable mutation even if a future endpoint/helper is renamed and no
    // longer contains the old `/bridge` route or cutover flag vocabulary.
    pattern: /(?:\bUPDATE\s+media_versions[\s\S]{0,1200}?\bSET[\s\S]{0,600}?\bstatus\s*=\s*["']legacy-bridge["']|\bINSERT\s+INTO\s+media_versions[\s\S]{0,2000}?["']legacy-bridge["']|\bstatus\s*[:=]\s*["']legacy-bridge["']|\blegacy-bridge-activated\b)/i,
    detail: 'retired legacy-bridge creation capability remains after final cutover',
  },
  {
    pattern: /legacyThumbnailAssetBytes|path\.join\(frontendDir,\s*["']assets["']|legacyAssetRecord|if\s*\(!liveMediaServingEnabled\)\s*\{\s*next\(\)/,
    detail: 'packaged frontend media reader remains after final cutover',
  },
  {
    pattern: /--allow-frozen-cutover|--allow-cutover-importer/,
    detail: 'CI still permits the retired Git-media cutover snapshot',
  },
  {
    pattern: /exact-image-approval|EXACT_IMAGE_APPROVER_IDS|verify-live-media-cutover|media:verify-cutover|candidate-\$\{GITHUB_RUN_ID\}/,
    detail: 'retired one-time cutover release ceremony remains after final cutover',
  },
  {
    pattern: /propSeats\.json|applyPropSeatOverrides|THUMBNAIL_PROP_SEATS_TTL_MS|_thumbnailPropSeatsCache/,
    detail: 'committed or last-good prop-seat fallback remains after DB-only cutover',
  },
  {
    pattern: /wallDecorManifest(?:\.json|_default)?/,
    detail: 'committed wall-decoration media manifest remains after live-catalog cutover',
  },
  {
    pattern: /\bSUBTERRAIN_(?:MATERIALS|MATERIAL_LABELS|MATERIAL_SLOTS)\b/,
    detail: 'compiled Subterrain inventory remains after drawable-catalog cutover',
  },
  {
    pattern: /\b(?:ROAD_MATERIALS|RIVER_MATERIALS|FEATURE_MATERIAL_LABELS|FENCE_MATERIALS|FENCE_MATERIAL_LABELS|WALL_MATERIALS|WALL_MATERIAL_LABELS|DEFAULT_(?:ROAD|RIVER|FENCE|WALL)_MATERIAL)\b/,
    detail: 'compiled feature/barrier material inventory remains after drawable-catalog cutover',
  },
  {
    pattern: /\/assets\/tiles\/feature\/\$\{(?:kind|material)[^\n]{0,120}\.png/,
    detail: 'compiled feature/barrier media-slot template remains after drawable-catalog cutover',
  },
  {
    pattern: /\b(?:PRODUCTION_VARIANTS|EDGE_FAMILIES|MURAL_FAMILIES|FEATURE_PIECE_COUNT|STUDIO_FAMILY_META)\b/,
    detail: 'compiled terrain-surface inventory remains after drawable-catalog cutover',
  },
  {
    pattern: /\b(?:MacroTileManifest|STRUCTURE_ART_ASSETS\s*:\s*StructureArtDefinition\[\]\s*=\s*\[|DOODAD_ASSETS\s*=\s*\[)\b/,
    detail: 'compiled composite/structure inventory remains after drawable-catalog cutover',
  },
  {
    pattern: /\b(?:GROUND_COVER_TERRAINS|GROUND_COVER_IDS|GROUND_COVER_META|PLACEMENT_POLICY|WALL_DECOR_DEFINITIONS|REQUIRED_PROP_SEAT_IDS)\b/,
    detail: 'compiled ground-cover/wall-decoration/prop inventory remains after drawable-catalog cutover',
  },
  {
    pattern: /\b(?:SAMPLE_GAINS|TERRAIN_SAMPLE|ARRIVAL_BAKED|SFX_ASSETS)\b|Copy for Claude|(?:bake[^\n]{0,80}(?:SFX|sound)|(?:SFX|sound)[^\n]{0,80}bake)/i,
    detail: 'hardcoded or copy-to-source SFX profile authority remains after DB profile cutover',
  },
];
const CODE_OWNED_PRODUCTION_SELECTOR = /\bPRODUCTION_[A-Z0-9_]*(?:ASSET|METHOD)(?:_ID)?\b\s*(?::[^=\n]+)?=\s*["'`][^"'`]+["'`]/;
const CODE_OWNED_PRODUCTION_FLAG = /\bproduction\s*:\s*true\b/;
const CODE_OWNED_ACCEPTED_PROFILE = /\bstatus\s*:\s*["'](?:accepted|native-pass|promoted|production-accepted)["']\s*,|\b(?:label|statusLabel)\s*:\s*["']Accepted(?:\s|·|["'])/i;
const MEDIA_DATA_URI = /data:(?:image|audio|video|font|model)\/[a-z0-9.+-]+(?:;[^,\s]*)?,|data:application\/(?:font[^;,\s]*|x-font[^;,\s]*|vnd\.ms-fontobject|octet-stream|pdf|postscript)(?:;[^,\s]*)?,/i;
const STRING_LITERAL = /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/gs;
const BASE64_TEXT = /^[A-Za-z0-9+/_-]{32,}={0,2}$/;
const HEX_TEXT = /^[0-9a-f]{32,}$/i;
const BASE64_TOKEN = /[A-Za-z0-9+/_-]{32,}={0,2}/g;
const HEX_TOKEN = /[0-9a-f]{32,}/ig;
const PERCENT_BYTES = /(?:%[0-9a-f]{2}){8,}/ig;
const HEX_ESCAPE_BYTES = /(?:\\x[0-9a-f]{2}){8,}/ig;
const UNICODE_BYTE_ESCAPES = /(?:\\u00[0-9a-f]{2}){8,}/ig;
const NUMERIC_BYTE_ARRAY = /\[((?:\s*(?:0x[0-9a-f]{1,2}|\d{1,3})\s*,){31,}\s*(?:0x[0-9a-f]{1,2}|\d{1,3})\s*,?\s*)\]/ig;
const BINARY_ARRAY_WRAPPER = /(?:new\s+)?(?:Uint8(?:Clamped)?Array(?:\.from)?|Buffer\.from|bytes|bytearray)\s*\(\s*$/i;
const GENERIC_ENCODED_LITERAL_MIN_CHARS = 4 * 1024;
const GENERIC_HEX_LITERAL_MIN_CHARS = 2 * 1024;
const GENERIC_ESCAPED_BYTES_MIN_COUNT = 256;
const GENERIC_BYTE_ARRAY_MIN_COUNT = 256;
const WRAPPED_BYTE_ARRAY_MIN_COUNT = 64;

function codeOwnedAssetRegistryAuthority(relativePath, source) {
  if (!/(?:asset|candidate|catalog|fence|portrait|profile|surface|tile)/i.test(relativePath)) return false;
  if (!/(?:\/assets\/|\b(?:railE|railS|src|thumb|url)\s*:)/i.test(source)) return false;
  if (!/\b[A-Z][A-Z0-9_]*(?:ASSETS|CATALOG|METHODS|PROFILES|REGISTRY)\b|readonly\s+[A-Za-z_$][\w$]*\[\]/.test(source)) {
    return false;
  }
  return CODE_OWNED_PRODUCTION_SELECTOR.test(source)
    || CODE_OWNED_PRODUCTION_FLAG.test(source)
    || CODE_OWNED_ACCEPTED_PROFILE.test(source);
}

function lineMentionsCommittedMediaDestination(line) {
  const pathLike = pathLikeLine(line);
  return COMMITTED_MEDIA_DESTINATION.test(pathLike)
    || (MEDIA_ONLY_REPOSITORY_DESTINATION.test(pathLike) && MEDIA_EXTENSION_LITERAL.test(pathLike));
}

function pathLikeLine(line) {
  return line
    .replaceAll('\\', '/')
    .replace(/['"`]/g, '')
    .replace(/\s*(?:,|\/)\s*/g, '/')
    .replace(/\/+/g, '/')
    .toLowerCase();
}

export function normalizeRepoPath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function isMediaPath(relativePath) {
  return MEDIA_EXTENSIONS.has(path.posix.extname(normalizeRepoPath(relativePath)).toLowerCase());
}

export function isAllowedSyntheticTestMedia(relativePath, byteLength) {
  const normalized = normalizeRepoPath(relativePath);
  const basename = path.posix.basename(normalized);
  return SYNTHETIC_TEST_MEDIA_ROOTS.some((root) => normalized.startsWith(root))
    && basename.startsWith('synthetic-')
    && Number.isSafeInteger(byteLength)
    && byteLength >= 0
    && byteLength <= SYNTHETIC_TEST_MEDIA_MAX_BYTES;
}

function startsWithBytes(bytes, signature) {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function decodedBytesLookLikeMedia(bytes) {
  if (!bytes?.length) return false;
  const ascii = bytes.subarray(0, Math.min(bytes.length, 512)).toString('latin1');
  const trimmedUtf8 = bytes.subarray(0, Math.min(bytes.length, 4096)).toString('utf8').trimStart();
  if (/^<svg(?:\s|>)/i.test(trimmedUtf8)
    || (/^<\?xml(?:\s|\?>)/i.test(trimmedUtf8)
      && /<(?:svg|collada|material|texture|image)(?:\s|>)/i.test(trimmedUtf8))) return true;
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // PNG
    || startsWithBytes(bytes, [0xff, 0xd8, 0xff]) // JPEG
    || /^GIF8[79]a/.test(ascii)
    || ascii.startsWith('BM') // BMP
    || ascii.startsWith('qoif')
    || ascii.startsWith('8BPS') // PSD
    || ascii.startsWith('DDS ')
    || ascii.startsWith('gimp xcf ')
    || ascii.startsWith('BLENDER')
    || ascii.startsWith('glTF')
    || ascii.startsWith('%PDF-')
    || ascii.startsWith('OggS')
    || ascii.startsWith('fLaC')
    || ascii.startsWith('ID3')
    || ascii.startsWith('MThd')
    || ascii.startsWith('wOFF')
    || ascii.startsWith('wOF2')
    || ascii.startsWith('OTTO')
    || startsWithBytes(bytes, [0x00, 0x01, 0x00, 0x00]) // TrueType
    || startsWithBytes(bytes, [0x76, 0x2f, 0x31, 0x01]) // OpenEXR
    || startsWithBytes(bytes, [0x49, 0x49, 0x2a, 0x00]) // TIFF / several RAW formats
    || startsWithBytes(bytes, [0x4d, 0x4d, 0x00, 0x2a])
    || startsWithBytes(bytes, [0x00, 0x00, 0x01, 0x00]) // ICO
    || startsWithBytes(bytes, [0x00, 0x00, 0x02, 0x00]) // CUR
    || startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) // ZIP-backed source formats
    || startsWithBytes(bytes, [0x1f, 0x8b]) // gzip
    || startsWithBytes(bytes, [0x42, 0x5a, 0x68]) // bzip2
    || startsWithBytes(bytes, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]) // xz
    || startsWithBytes(bytes, [0x28, 0xb5, 0x2f, 0xfd]) // zstd
    || startsWithBytes(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) // 7z
    || startsWithBytes(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]) // RAR
    || bytes.subarray(257, 262).toString('ascii') === 'ustar') return true; // tar
  if (ascii.startsWith('RIFF') && ['WEBP', 'WAVE', 'AVI '].includes(ascii.slice(8, 12))) return true;
  if (ascii.startsWith('FORM') && ['AIFF', 'AIFC'].includes(ascii.slice(8, 12))) return true;
  if (bytes.length >= 12 && ascii.slice(4, 8) === 'ftyp') return true; // MP4/MOV/AVIF/HEIF
  return bytes.length >= 4 && bytes[0] === 0x0a && bytes[2] === 0x01 && [1, 2, 4, 8].includes(bytes[3]); // PCX
}

function decodeBase64(value) {
  if (!BASE64_TEXT.test(value) || value.length % 4 === 1) return null;
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64');
  } catch {
    return null;
  }
}

function quotedLiterals(source) {
  return [...source.matchAll(STRING_LITERAL)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    body: match[0].slice(1, -1),
  }));
}

function decodePercentBytes(value) {
  const pairs = value.match(/%([0-9a-f]{2})/ig) ?? [];
  return Buffer.from(pairs.map((pair) => Number.parseInt(pair.slice(1), 16)));
}

function decodeEscapedBytes(value, width) {
  const pattern = width === 2 ? /\\x([0-9a-f]{2})/ig : /\\u00([0-9a-f]{2})/ig;
  return Buffer.from([...value.matchAll(pattern)].map((match) => Number.parseInt(match[1], 16)));
}

function encodedLiteralReason(source) {
  const literals = quotedLiterals(source);
  for (const literal of literals) {
    const trimmed = literal.body.trimStart();
    if (/^<svg(?:\s|>)/i.test(trimmed)
      || (/^<\?xml(?:\s|\?>)/i.test(trimmed)
        && /<(?:svg|collada|material|texture|image)(?:\s|>)/i.test(trimmed))) {
      return 'serialized SVG/XML material is embedded in tracked text or code';
    }

    const base64 = decodeBase64(literal.body);
    if (base64 && (decodedBytesLookLikeMedia(base64)
      || literal.body.length >= GENERIC_ENCODED_LITERAL_MIN_CHARS)) {
      return decodedBytesLookLikeMedia(base64)
        ? 'base64 literal decodes to media bytes'
        : 'large opaque base64/base64url literal is embedded in tracked text or code';
    }

    if (HEX_TEXT.test(literal.body)) {
      const decoded = Buffer.from(literal.body, 'hex');
      if (decodedBytesLookLikeMedia(decoded) || literal.body.length >= GENERIC_HEX_LITERAL_MIN_CHARS) {
        return decodedBytesLookLikeMedia(decoded)
          ? 'hex literal decodes to media bytes'
          : 'large opaque hex literal is embedded in tracked text or code';
      }
    }

    for (const match of literal.body.matchAll(PERCENT_BYTES)) {
      const decoded = decodePercentBytes(match[0]);
      if (decodedBytesLookLikeMedia(decoded) || decoded.length >= GENERIC_ESCAPED_BYTES_MIN_COUNT) {
        return decodedBytesLookLikeMedia(decoded)
          ? 'percent-encoded literal decodes to media bytes'
          : 'large percent-encoded byte literal is embedded in tracked text or code';
      }
    }
    for (const [pattern, width] of [[HEX_ESCAPE_BYTES, 2], [UNICODE_BYTE_ESCAPES, 4]]) {
      for (const match of literal.body.matchAll(pattern)) {
        const decoded = decodeEscapedBytes(match[0], width);
        if (decodedBytesLookLikeMedia(decoded) || decoded.length >= GENERIC_ESCAPED_BYTES_MIN_COUNT) {
          return decodedBytesLookLikeMedia(decoded)
            ? 'escaped binary literal decodes to media bytes'
            : 'large escaped binary literal is embedded in tracked text or code';
        }
      }
    }
  }

  // Treat adjacent string fragments as one payload so splitting a data URI,
  // serialized vector, or encoded blob across source lines does not bypass the
  // guard.
  for (let index = 0; index < literals.length; index += 1) {
    let joined = literals[index].body;
    for (let next = index + 1; next < literals.length; next += 1) {
      if (!/^\s*\+\s*$/.test(source.slice(literals[next - 1].end, literals[next].start))) break;
      joined += literals[next].body;
      if (MEDIA_DATA_URI.test(joined)) return 'media data URI is split across tracked source strings';
      const trimmed = joined.trimStart();
      if (/^<svg(?:\s|>)/i.test(trimmed)
        || (/^<\?xml(?:\s|\?>)/i.test(trimmed)
          && /<(?:svg|collada|material|texture|image)(?:\s|>)/i.test(trimmed))) {
        return 'serialized SVG/XML material is split across tracked source strings';
      }
      if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(joined)) continue;
      const decoded = joined.length >= 32 ? decodeBase64(joined) : null;
      if (decoded && (decodedBytesLookLikeMedia(decoded) || joined.length >= GENERIC_ENCODED_LITERAL_MIN_CHARS)) {
        return decodedBytesLookLikeMedia(decoded)
          ? 'concatenated base64 literals decode to media bytes'
          : 'large opaque base64 literal is split across tracked source strings';
      }
    }
  }

  // Encoded payloads do not have to be quoted (CSS values and generated code
  // sometimes place them directly in a token), so scan the full text as well.
  for (const match of source.matchAll(BASE64_TOKEN)) {
    const decoded = decodeBase64(match[0]);
    if (decoded && (decodedBytesLookLikeMedia(decoded)
      || match[0].length >= GENERIC_ENCODED_LITERAL_MIN_CHARS)) {
      return decodedBytesLookLikeMedia(decoded)
        ? 'base64 token decodes to media bytes'
        : 'large opaque base64/base64url token is embedded in tracked text or code';
    }
  }
  for (const match of source.matchAll(HEX_TOKEN)) {
    if (match[0].length < GENERIC_HEX_LITERAL_MIN_CHARS) continue;
    return 'large opaque hex token is embedded in tracked text or code';
  }
  for (const match of source.matchAll(PERCENT_BYTES)) {
    const decoded = decodePercentBytes(match[0]);
    if (decodedBytesLookLikeMedia(decoded) || decoded.length >= GENERIC_ESCAPED_BYTES_MIN_COUNT) {
      return decodedBytesLookLikeMedia(decoded)
        ? 'percent-encoded token decodes to media bytes'
        : 'large percent-encoded byte token is embedded in tracked text or code';
    }
  }
  for (const [pattern, width] of [[HEX_ESCAPE_BYTES, 2], [UNICODE_BYTE_ESCAPES, 4]]) {
    for (const match of source.matchAll(pattern)) {
      const decoded = decodeEscapedBytes(match[0], width);
      if (decodedBytesLookLikeMedia(decoded) || decoded.length >= GENERIC_ESCAPED_BYTES_MIN_COUNT) {
        return decodedBytesLookLikeMedia(decoded)
          ? 'escaped binary token decodes to media bytes'
          : 'large escaped binary token is embedded in tracked text or code';
      }
    }
  }

  for (const match of source.matchAll(NUMERIC_BYTE_ARRAY)) {
    const values = match[1].split(',').map((value) => value.trim()).filter(Boolean)
      .map((value) => Number.parseInt(value, value.toLowerCase().startsWith('0x') ? 16 : 10));
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 255)) continue;
    const decoded = Buffer.from(values);
    const wrapper = BINARY_ARRAY_WRAPPER.test(source.slice(Math.max(0, match.index - 96), match.index));
    if (decodedBytesLookLikeMedia(decoded)
      || values.length >= GENERIC_BYTE_ARRAY_MIN_COUNT
      || (wrapper && values.length >= WRAPPED_BYTE_ARRAY_MIN_COUNT)) {
      return decodedBytesLookLikeMedia(decoded)
        ? 'numeric byte-array literal contains a media signature'
        : 'large numeric byte-array literal is embedded in tracked text or code';
    }
  }
  return null;
}

function trackedTextSource(bytes) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 64 * 1024));
  if (sample.includes(0)) return null;
  let controls = 0;
  for (const value of sample) {
    if (value < 0x20 && ![0x09, 0x0a, 0x0c, 0x0d].includes(value)) controls += 1;
  }
  if (sample.length && controls / sample.length > 0.01) return null;
  const source = bytes.toString('utf8');
  const replacements = source.match(/\ufffd/g)?.length ?? 0;
  return replacements > Math.max(2, source.length / 1000) ? null : source;
}

export function embeddedMediaLiteralReason(relativePath, source, byteLength = Buffer.byteLength(source, 'utf8')) {
  if (normalizeRepoPath(relativePath) === 'frontend/scripts/check-no-committed-media.test.mjs') return null;
  if (isAllowedSyntheticTestMedia(relativePath, byteLength)) return null;
  if (MEDIA_DATA_URI.test(source)) return 'media data URI is embedded in tracked text or code';
  return encodedLiteralReason(source);
}

function isStaticCandidateDatabase(relativePath, source) {
  const normalized = normalizeRepoPath(relativePath);
  if (STATIC_CANDIDATE_DATABASE_FILES.has(normalized)) return true;
  if (!normalized.startsWith('frontend/config/') && !normalized.startsWith('frontend/src/')) return false;
  if (GENERATED_CANDIDATE_CATALOG_NAME.test(path.posix.basename(normalized))) return true;
  return GENERATED_CANDIDATE_CATALOG_MARKER.test(source)
    && GENERATED_CANDIDATE_CATALOG_ROWS.test(source)
    && GENERATED_CANDIDATE_CATALOG_POINTER.test(source);
}

function normalizedChromeSemanticSlot(value) {
  const withoutQuery = value.trim().split(/[?#]/, 1)[0].replaceAll('\\', '/').replace(/^\/+/, '');
  return withoutQuery.startsWith('assets/') ? withoutQuery.slice('assets/'.length) : withoutQuery;
}

function chromeJsonSelectorReason(value, pathParts = []) {
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...pathParts, key];
    if (typeof child === 'string' && CHROME_SOURCE_SELECTOR_KEY.test(key)) {
      const slot = normalizedChromeSemanticSlot(child);
      const isRoleDividerSentinel = child === 'none'
        && key === 'atomSourceId'
        && pathParts.length === 2
        && pathParts[0] === 'dividers'
        && ['outer', 'inner'].includes(pathParts[1]);
      if (!isRoleDividerSentinel && !CANONICAL_CHROME_SOURCE_SLOTS.has(slot)) {
        return `${childPath.join('.')} points at a generated candidate id/path instead of a canonical backend slot`;
      }
    }
    const nestedReason = chromeJsonSelectorReason(child, childPath);
    if (nestedReason) return nestedReason;
  }
  return null;
}

function chromeConfigSelectorReason(source) {
  try {
    const parsed = JSON.parse(source);
    const expectedByRole = {
      outer: {
        atomSourceId: 'ui/chrome/outer/atom.png',
        railSourceId: 'ui/chrome/outer/rail.png',
      },
      inner: {
        atomSourceId: 'ui/chrome/inner/atom.png',
        railSourceId: 'ui/chrome/inner/rail.png',
      },
      divider: {
        atomSourceId: 'ui/chrome/divider/joint.png',
      },
    };
    for (const [role, selectors] of Object.entries(expectedByRole)) {
      const roleConfig = parsed?.[role];
      if (!roleConfig || typeof roleConfig !== 'object' || Array.isArray(roleConfig)) continue;
      for (const [selector, expected] of Object.entries(selectors)) {
        if (!(selector in roleConfig)) continue;
        const actual = typeof roleConfig[selector] === 'string'
          ? normalizedChromeSemanticSlot(roleConfig[selector])
          : '';
        if (actual !== expected) {
          return `${role}.${selector} must resolve through the canonical ${expected} backend slot`;
        }
      }
    }
    const roleDividers = parsed?.dividers;
    if (roleDividers && typeof roleDividers === 'object' && !Array.isArray(roleDividers)) {
      for (const role of ['outer', 'inner']) {
        const divider = roleDividers[role];
        if (!divider || typeof divider !== 'object' || Array.isArray(divider) || !('atomSourceId' in divider)) continue;
        const actual = typeof divider.atomSourceId === 'string'
          ? normalizedChromeSemanticSlot(divider.atomSourceId)
          : '';
        if (actual !== 'none' && actual !== 'ui/chrome/divider/joint.png') {
          return `dividers.${role}.atomSourceId must be none or resolve through the canonical ui/chrome/divider/joint.png backend slot`;
        }
      }
    }
    // Parsed JSON gets a structural walk so a valid installed-role section
    // cannot hide a candidate pointer elsewhere in the same document. Only the
    // exact dividers.<role>.atomSourceId `none` sentinel is exempt.
    return chromeJsonSelectorReason(parsed);
  } catch {
    // JavaScript/TypeScript installation declarations are handled by the
    // literal scan below. Malformed JSON will fail its own parser in CI.
  }

  for (const match of source.matchAll(CHROME_SOURCE_SELECTOR_LITERAL)) {
    const slot = normalizedChromeSemanticSlot(match[2]);
    if (!CANONICAL_CHROME_SOURCE_SLOTS.has(slot)) {
      return `${match[1]} points at a generated candidate id/path instead of a canonical backend slot`;
    }
  }
  return null;
}

export function chromeInstalledSourceAuthorityReason(relativePath, source) {
  const normalized = normalizeRepoPath(relativePath);
  if (MEDIA_GUARD_INSPECTORS.has(normalized)) return null;
  const installedContext = CHROME_INSTALLED_SELECTOR_PATH.test(normalized)
    || CHROME_INSTALLED_CONTEXT.test(source);
  if (!installedContext) return null;

  const selectorReason = chromeConfigSelectorReason(source);
  if (selectorReason) return selectorReason;
  if (GENERATED_CHROME_SOURCE_PATH.test(source)) {
    return 'installed Chrome resolves a generated candidate path instead of canonical backend slots';
  }
  return null;
}

export function scrollbarStaticAuthorityReason(relativePath, source) {
  const normalized = normalizeRepoPath(relativePath);
  if (MEDIA_GUARD_INSPECTORS.has(normalized) || TEST_SOURCE_PATH.test(normalized)) return null;
  const pathContext = SCROLLBAR_AUTHORITY_PATH.test(normalized);
  const preferredCopy = /\bscrollbars?\b[^\n]{0,180}\bpreferred\b|\bpreferred\b[^\n]{0,180}\bscrollbars?\b/i.test(source);
  if ((pathContext && /\bpreferred\b/i.test(source)) || preferredCopy) {
    return 'committed scrollbar preferred/default authority remains outside the backend catalog';
  }
  if (STATIC_SCROLLBAR_MEDIA_ROW.test(source) || (pathContext && STATIC_SCROLLBAR_ROSTER.test(source))) {
    return 'committed scrollbar browse roster remains instead of deriving membership from the backend catalog';
  }
  return null;
}

export function isStaticPromotionAuthority(relativePath, source) {
  const normalized = normalizeRepoPath(relativePath);
  if (MEDIA_GUARD_INSPECTORS.has(normalized)) return false;
  if (STATIC_POINTER_FILES.has(normalized)) return true;
  if (
    !STATIC_AUTHORITY_CODE_EXTENSION.test(normalized)
    && !(STATIC_AUTHORITY_SOURCE_PATH.test(normalized) && STATIC_AUTHORITY_CONFIG_EXTENSION.test(normalized))
  ) return false;
  if (/(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.test\.[^.]+$/.test(normalized)) return false;
  if (isStaticCandidateDatabase(normalized, source)) return true;
  if (chromeInstalledSourceAuthorityReason(normalized, source)) return true;
  if (scrollbarStaticAuthorityReason(normalized, source)) return true;
  if (/"authority"\s*:\s*"historical-provenance-only"/.test(source)) return false;
  return STATIC_POINTER_AUTHORITY.test(source)
    || (STATIC_AUTHORITY_CONFIG_EXTENSION.test(normalized) && STATIC_POINTER_CONFIG_AUTHORITY.test(source))
    || STATIC_CANDIDATE_LIFECYCLE.test(source)
    || codeOwnedAssetRegistryAuthority(normalized, source);
}

function finalCutoverScaffoldViolations(repoRoot, trackedFiles) {
  const violations = [];
  for (const relativePath of trackedFiles.map(normalizeRepoPath)) {
    const scriptLike = SCRIPT_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase());
    if (
      !CUTOVER_SCAFFOLD_SOURCE_PATH.test(relativePath) && !scriptLike
    ) continue;
    if (TEST_SOURCE_PATH.test(relativePath) || FINAL_CUTOVER_MARKER_EXEMPTIONS.has(relativePath)) continue;
    const target = path.join(repoRoot, relativePath);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) continue;
    const bytes = fs.readFileSync(target);
    const source = trackedTextSource(bytes);
    if (source === null) continue;
    const issue = RETIRED_CUTOVER_SOURCE_MARKERS.find(({ pattern }) => pattern.test(source));
    if (!issue) continue;
    violations.push({ kind: 'temporary-cutover-scaffold', path: relativePath, detail: issue.detail });
  }
  return violations;
}

function builtMediaViolations(repoRoot) {
  const distRoot = path.join(repoRoot, 'frontend', 'dist');
  if (!fs.existsSync(distRoot)) return [];
  const violations = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) { visit(absolute); continue; }
      if (!entry.isFile()) continue;
      const relativePath = normalizeRepoPath(path.relative(repoRoot, absolute));
      const bytes = fs.readFileSync(absolute);
      const source = trackedTextSource(bytes);
      const embedded = source === null ? null : embeddedMediaLiteralReason(relativePath, source, bytes.length);
      if (isMediaPath(relativePath) || decodedBytesLookLikeMedia(bytes) || embedded) {
        violations.push({
          kind: 'built-media',
          path: relativePath,
          detail: embedded || `${bytes.length} media bytes were packaged into frontend/dist`,
        });
      }
    }
  };
  visit(distRoot);
  return violations;
}

export function committedMediaWriterReason(relativePath, source) {
  const normalized = normalizeRepoPath(relativePath);
  if (MEDIA_GUARD_INSPECTORS.has(normalized)) return null;
  if (!SCRIPT_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase()) || !SCRIPT_PATH.test(normalized)) return null;
  if (!source.split(/\r?\n/).some(lineMentionsCommittedMediaDestination)) return null;

  const tainted = new Set();
  const publicTainted = new Set();
  for (const line of source.split(/\r?\n/)) {
    const assignment = line.match(/^\s*(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/);
    const hasProtectedLiteral = lineMentionsCommittedMediaDestination(line);
    const referencesTainted = [...tainted].some((name) => new RegExp(`\\b${name}\\b`).test(line));
    const hasPublicLiteral = PUBLIC_DESTINATION.test(pathLikeLine(line));
    const referencesPublic = [...publicTainted].some((name) => new RegExp(`\\b${name}\\b`).test(line));
    if (assignment && (hasProtectedLiteral || referencesTainted)) tainted.add(assignment[1]);
    if (assignment && (hasPublicLiteral || referencesPublic)) publicTainted.add(assignment[1]);

    if (WRITE_INTENT.test(line) && (hasProtectedLiteral
      || [...tainted].some((name) => new RegExp(`\\b${name}\\b`).test(line)))) {
      return 'producer writes into a committed runtime, review, or source-media directory';
    }
    if (WRITE_INTENT.test(line) && MEDIA_EXTENSION_LITERAL.test(line)
      && (hasPublicLiteral || [...publicTainted].some((name) => new RegExp(`\\b${name}\\b`).test(line)))) {
      return 'producer writes media into the public code/static root';
    }
  }

  if (PRODUCER_NAME.test(normalized) && [...tainted].some((name) => OUTPUT_NAME.test(name))) {
    return 'producer declares a committed runtime, review, or source-media output';
  }
  if (PRODUCER_NAME.test(normalized) && MEDIA_EXTENSION_LITERAL.test(source)
    && [...publicTainted].some((name) => OUTPUT_NAME.test(name))) {
    return 'producer declares a media output beneath the public code/static root';
  }
  return null;
}

export function committedMediaFilesystemAssumptionReason(relativePath, source) {
  const normalized = normalizeRepoPath(relativePath);
  if (MEDIA_GUARD_INSPECTORS.has(normalized)) return null;
  if (!SCRIPT_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase())) return null;
  const lines = source.split(/\r?\n/);
  const sourceRootVariables = new Set();
  for (const line of lines) {
    if (BACKEND_SOURCE_PATH_IDENTIFIER.test(line)) continue;
    const pathLike = pathLikeLine(line);
    if (OLD_PUBLIC_ASSET_FILESYSTEM.test(pathLike) || OLD_DEDICATED_SOURCE_FILESYSTEM.test(pathLike)) {
      return 'tool assumes committed runtime/source media is available on the filesystem';
    }
    const assignment = line.match(/^\s*(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/);
    const rootedInSourceArt = MEDIA_ONLY_REPOSITORY_DESTINATION.test(pathLike);
    const referencesSourceRoot = [...sourceRootVariables]
      .some((name) => new RegExp(`\\b${name}\\b`).test(line));
    if (assignment && (rootedInSourceArt || referencesSourceRoot)) sourceRootVariables.add(assignment[1]);
    if (MEDIA_EXTENSION_LITERAL.test(pathLike) && (rootedInSourceArt || referencesSourceRoot)) {
      return 'tool assumes committed runtime/source media is available on the filesystem';
    }
  }
  return null;
}

export function listTrackedFiles(repoRoot = defaultRepoRoot) {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.split('\0').filter(Boolean).map(normalizeRepoPath);
}

export function collectNoCommittedMediaViolations({
  repoRoot = defaultRepoRoot,
  trackedFiles = null,
  builtOutputOnly = false,
} = {}) {
  if (builtOutputOnly) return builtMediaViolations(repoRoot);
  const resolvedTrackedFiles = trackedFiles ?? listTrackedFiles(repoRoot);
  const violations = [];

  for (const relativePath of resolvedTrackedFiles) {
    const absolutePath = path.join(repoRoot, relativePath);
    // A local deletion is the desired migration patch even before it is staged.
    // CI's index will no longer contain the file after the deletion is committed.
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) continue;

    const bytes = fs.readFileSync(absolutePath);
    const byteLength = bytes.length;
    // Extensions are only a convenience, never the security boundary. Inspect
    // every tracked payload so renaming a PNG/SVG/ZIP-backed source to `.dat`
    // or removing its extension cannot reopen the Git-backed asset path.
    const media = isMediaPath(relativePath) || decodedBytesLookLikeMedia(bytes);
    let source = null;
    if (media) {
      if (!isAllowedSyntheticTestMedia(relativePath, byteLength)) {
        violations.push({
          kind: 'tracked-media',
          path: relativePath,
          detail: `${byteLength} committed bytes`,
          byteLength,
        });
      }
    }
    if (relativePath.startsWith(PUBLIC_ASSET_PREFIX) && !media) {
      violations.push({
        kind: 'tracked-public-asset-file',
        path: relativePath,
        detail: `${byteLength} committed bytes under the retired public asset root`,
        byteLength,
      });
    } else if (
      relativePath.startsWith(PUBLIC_ROOT_PREFIX) && !media
      && !ALLOWED_PUBLIC_EXECUTABLE_FILES.has(relativePath)
      && !PUBLIC_LEGAL_TEXT.test(relativePath)
    ) {
      violations.push({
        kind: 'tracked-public-file',
        path: relativePath,
        detail: `${byteLength} committed bytes outside the explicit deploy-owned code/legal allowlist`,
        byteLength,
      });
    }

    if (!media) {
      source = trackedTextSource(bytes);
      if (source !== null) {
        const embeddedReason = embeddedMediaLiteralReason(relativePath, source, bytes.length);
        if (embeddedReason) {
          violations.push({
            kind: 'embedded-media',
            path: relativePath,
            detail: embeddedReason,
          });
        }
        if (relativePath !== 'frontend/scripts/check-no-committed-media.mjs'
          && !TEST_SOURCE_PATH.test(relativePath) && RETIRED_WALL_ART_AUTHORITY.test(source)) {
          violations.push({
            kind: 'retired-wall-art-authority',
            path: relativePath,
            detail: 'wall art must project from DB-owned drawable records without a compiled baseline or parallel API',
          });
        }
      }
    }

    if (isStaticPromotionAuthority(relativePath, '')) {
      violations.push({
        kind: 'static-promotion-authority',
        path: relativePath,
        detail: 'committed catalog/manifest cannot own production promotion state',
      });
    } else if (
      STATIC_AUTHORITY_CODE_EXTENSION.test(relativePath)
      || (STATIC_AUTHORITY_SOURCE_PATH.test(relativePath) && STATIC_AUTHORITY_CONFIG_EXTENSION.test(relativePath))
    ) {
      const staticSource = source ?? fs.readFileSync(absolutePath, 'utf8');
      if (isStaticPromotionAuthority(relativePath, staticSource)) {
        violations.push({
          kind: 'static-promotion-authority',
          path: relativePath,
          detail: 'committed accepted/promoted pointer or production-registration flag',
        });
      }
    }

    if (
      source !== null
      && RUNTIME_MEDIA_POINTER_SOURCE_PATH.test(relativePath)
      && !TEST_SOURCE_PATH.test(relativePath)
      && HARDCODED_IMMUTABLE_MEDIA_URL.test(source)
    ) {
      violations.push({
        kind: 'hardcoded-immutable-media-pointer',
        path: relativePath,
        detail: 'runtime source pins an immutable media hash instead of resolving a semantic live slot',
      });
    }

    const extension = path.posix.extname(relativePath).toLowerCase();
    if (SCRIPT_EXTENSIONS.has(extension)) {
      const scriptSource = source ?? fs.readFileSync(absolutePath, 'utf8');
      const assumption = committedMediaFilesystemAssumptionReason(relativePath, scriptSource);
      if (assumption) {
        violations.push({ kind: 'committed-media-filesystem-assumption', path: relativePath, detail: assumption });
      }
      if (SCRIPT_PATH.test(relativePath)) {
        const reason = committedMediaWriterReason(relativePath, scriptSource);
        if (reason) violations.push({ kind: 'committed-media-writer', path: relativePath, detail: reason });
        if (
          EXTERNAL_SOURCE_FETCHER_PATH.test(relativePath) && /\bfetch\s*\(/.test(scriptSource)
          && !/\b(?:archiveSourceBytes|uploadCandidateBytes)\b/.test(scriptSource)
        ) {
          violations.push({
            kind: 'external-source-fetcher-bypass',
            path: relativePath,
            detail: 'external source fetcher does not archive the exact bytes through the backend media API',
          });
        }
      }
    }
  }

  for (const retiredPath of RETIRED_GIT_MEDIA_PATHS) {
    if (!fs.existsSync(path.join(repoRoot, retiredPath))) continue;
    violations.push({
      kind: 'retired-git-media-path',
      path: retiredPath,
      detail: 'one-time Git-media migration authority must not be recreated',
    });
  }

  violations.push(...finalCutoverScaffoldViolations(repoRoot, resolvedTrackedFiles));
  violations.push(...builtMediaViolations(repoRoot));

  return violations.sort((left, right) => left.kind.localeCompare(right.kind) || left.path.localeCompare(right.path));
}

export function summarizeTrackedMedia(violations) {
  const media = violations.filter((violation) => violation.kind === 'tracked-media');
  const summarize = (keyFor) => {
    const groups = new Map();
    for (const violation of media) {
      const key = keyFor(violation.path);
      const current = groups.get(key) ?? { count: 0, bytes: 0 };
      current.count += 1;
      current.bytes += violation.byteLength;
      groups.set(key, current);
    }
    return Object.fromEntries([...groups].sort(([left], [right]) => left.localeCompare(right)));
  };
  return {
    count: media.length,
    bytes: media.reduce((total, violation) => total + violation.byteLength, 0),
    byTopLevelPath: summarize((relativePath) => {
      const parts = relativePath.split('/');
      return ['docs', 'frontend'].includes(parts[0]) && parts.length > 1
        ? `${parts[0]}/${parts[1]}`
        : parts[0];
    }),
    byExtension: summarize((relativePath) => path.posix.extname(relativePath).toLowerCase() || '<none>'),
  };
}

function parseCli(argv) {
  const options = { repoRoot: defaultRepoRoot, builtOutputOnly: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--json') options.json = true;
    else if (value === '--built-output-only') options.builtOutputOnly = true;
    else if (value === '--repo-root') options.repoRoot = path.resolve(argv[++index] ?? '');
    else throw new Error(`Unknown option: ${value}`);
  }
  return options;
}

function runCli() {
  const options = parseCli(process.argv.slice(2));
  const violations = collectNoCommittedMediaViolations(options);
  const trackedMediaSummary = summarizeTrackedMedia(violations);
  if (options.json) console.log(JSON.stringify({ trackedMediaSummary, violations }, null, 2));
  else if (violations.length) {
    console.error(`No-committed-media guard FAILED (${violations.length} violations):`);
    console.error(`Tracked media: ${trackedMediaSummary.count} files, ${trackedMediaSummary.bytes} bytes`);
    const groups = new Map();
    for (const violation of violations) {
      if (!groups.has(violation.kind)) groups.set(violation.kind, []);
      groups.get(violation.kind).push(violation);
    }
    for (const [kind, entries] of groups) {
      console.error(`\n${kind} (${entries.length})`);
      for (const entry of entries) console.error(`  ${entry.path} — ${entry.detail}`);
    }
  } else {
    console.log(options.builtOutputOnly
      ? 'No-committed-media build guard OK: frontend/dist contains no packaged media.'
      : 'No-committed-media guard OK: Git contains no production/review/source media or committed-media producers.');
  }
  if (violations.length) process.exitCode = 1;
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) runCli();
