'use strict';

const { createHash } = require('node:crypto');

const SHA256 = /^[0-9a-f]{64}$/;
const PREDRAWN_BOARD_SLOT = /^boards\/([a-z0-9][a-z0-9._-]{0,119})\/plate\.png$/;
const PREDRAWN_BOARD_COMPONENT = 'predrawn-board-plate';
const PREDRAWN_BOARD_PROOF_SCHEMA = 'predrawn-board-canonical-level-proof-v1';
const PREDRAWN_BOARD_PROOF_RENDERER = 'LevelEditor/PredrawnBoardLayer';
// ADR-0560: the five main-menu marks, and the kit gear slot the rest of the app draws its
// gear from, are fitted to one ink HEIGHT so the whole rail carries the same padding above
// and below every mark. That fit RESAMPLES — the generator draws a 64x64 canvas whose ink is
// whatever height it happened to draw, and the packer scales that ink until it is exactly 52
// tall — so this records spatial resampling truthfully instead of claiming a native 1x the
// bytes do not have (ADR-0076).
//
// Unlike ADR-0332's eight lipsana, this family is expected to be REGENERATED as the marks are
// iterated on, so the contract pins the SHAPE — the slot, the canvas, the ink height, the exact
// transform, and an archived source — rather than exact output hashes. Pinning hashes would
// make every new mark a backend edit, which is how a gate stops being run.
const MAIN_MENU_MARK_FITTED_EXCEPTION_SCHEMA = 'main-menu-mark-fitted-production-exception-v1';
const MAIN_MENU_MARK_FITTED_TRANSFORM = 'ink-crop-lanczos-fit-height-52-even-quantize-48-center-64';
/**
 * The ink height a fitted mark is packed to, PER SEAT.
 *
 * The comment below says the list is every mark drawn into a fitted rail seat, and that two marks
 * stacked in one rail must share an ink height or one silently reads a different size — a property
 * of the SEAT. The height was nevertheless a single constant, which meant "fitted mark" implicitly
 * meant "fitted to the main menu's box". A second rail with a different measured box could not
 * state the truth about itself: the Enchiridion's section rail carries 40px of ink (measured on its
 * installed Units and Lipsana marks), so a mark fitted to 40 and declaring 52 would be a lie and a
 * mark fitted to 52 would stand a size larger than the five it joins.
 *
 * 52 stays the default, so every already-accepted row keeps validating against exactly what it
 * stored. A seat with its own box declares it here (ADR-0588).
 */
const FITTED_MARK_INK_HEIGHT_DEFAULT = 52;
const FITTED_MARK_INK_HEIGHT_BY_SLOT = Object.freeze({
  'ui/kit/icons/tileset-studio.png': 40,
});

function fittedMarkInkHeight(slot) {
  const declared = FITTED_MARK_INK_HEIGHT_BY_SLOT[String(slot || '')];
  return Number.isInteger(declared) ? declared : FITTED_MARK_INK_HEIGHT_DEFAULT;
}

/** The exact packer transform for a seat, derived from its ink height so the two cannot drift. */
function fittedMarkTransform(slot) {
  return `ink-crop-lanczos-fit-height-${fittedMarkInkHeight(slot)}-even-quantize-48-center-64`;
}
// The list is every mark drawn into a FITTED RAIL SEAT, which is why it is not confined to the
// main menu's own five. The seat scales the whole 64x64 canvas to a fixed size and lets the
// asset's transparent padding decide how big the mark reads, so any two marks stacked in one
// rail must share an ink height or one of them silently reads a different size. That is a
// property of the seat, not of the screen: the gear is here because the Battle HUD, Settings
// and `.icon-gear` all draw it, and the Editor's War and Levels marks are here because they
// stack in the Editor rail beside campaign-editor.png, which is already fitted to 52. The
// Battle command card's ten marks are here for the same reason and not a weaker one: they sit
// in a 3x5 grid of equal buttons, which is a denser size comparison than any column, and they
// are drawn through the identical fixed-seat-plus-contain rule.
const MAIN_MENU_MARK_FITTED_SLOTS = Object.freeze([
  'ui/main-menu/icons-carved/solo-skirmish.png',
  'ui/main-menu/icons-carved/campaign-editor.png',
  'ui/main-menu/icons-carved/lobbies.png',
  'ui/main-menu/icons-carved/enchiridion.png',
  'ui/main-menu/icons-carved/settings.png',
  'ui/kit/icons/gear.png',
  'ui/kit/icons/war.png',
  'ui/kit/icons/levels.png',
  'ui/kit/icons/shortcuts/enemy-attacks.png',
  'ui/kit/icons/shortcuts/enemy-moves.png',
  'ui/kit/icons/shortcuts/grid.png',
  'ui/kit/icons/shortcuts/deselect.png',
  'ui/kit/icons/shortcuts/clear-overlays.png',
  'ui/kit/icons/shortcuts/player-attacks.png',
  'ui/kit/icons/shortcuts/player-moves.png',
  'ui/kit/icons/shortcuts/promotion-zones.png',
  'ui/kit/icons/shortcuts/zoom-in.png',
  'ui/kit/icons/shortcuts/zoom-out.png',
  // The Enchiridion section rail's Terrain mark. Its seat carries 40px of ink, not 52 —
  // see FITTED_MARK_INK_HEIGHT_BY_SLOT (ADR-0588).
  'ui/kit/icons/tileset-studio.png',
]);

const LIPSANON_ICON_COMPONENT = 'run-lipsanon-icon';
const LIPSANON_ICON_SLOT = /^ui\/run\/lipsana\/([a-z][a-z0-9-]{0,79})\.png$/;
const LIPSANON_RESIZED_PRODUCTION_EXCEPTION_SCHEMA = 'run-lipsanon-resized-production-exception-v1';
const LIPSANON_RESIZED_PRODUCTION_EXCEPTION_SHA_BY_SLOT = Object.freeze({
  'ui/run/lipsana/congressional-approval.png': '928f9ceb7a5612ff0d2216b70422b972b04492a4c9ed277e5122721b390c52d0',
  'ui/run/lipsana/deployment-vehicle.png': 'd004c0f5be36094ebc137a9cdbebfe69d847636a7c8ddaff50bac8b687aac0bc',
  'ui/run/lipsana/inspirational-record.png': 'b6d18510fcff3e374a1899421b2928fb16cd79c0108ad00179059cca539e309d',
  'ui/run/lipsana/mercenarys-rifle.png': 'afe1a1f718a4406a60ae85adb002af846ef4a9c6000c20b97d67a0b57c06fa60',
  'ui/run/lipsana/merchants-shopkey.png': 'c8e0e45f9b863e42401c8e72cf0c42364a3c70c0c8dfb7362978b79e9b5adfa0',
  'ui/run/lipsana/occult-dagger.png': 'bc7984ccbabf45e39e672957d7ed1e2716c7e82e14b671fcbed38a7f82b9208d',
  'ui/run/lipsana/training-linens.png': 'e1349bd32f7bcaccbd706dbc55a6f97df8a0dd96533f309d1e2c0ea38aabf461',
});
// ADR-0360. Two generated card frames painted their card at a different SHAPE
// from the other three, so the same 5:7 element rendered visibly different card
// sizes. Normalising them to the shared 1009x1402 painted box means resampling,
// which is not native 1x — admitted only for these exact slots, bytes and
// transform, exactly as ADR-0332 admits the resized lipsanon icons.
const RUN_CARD_FRAME_NORMALISED_EXCEPTION_SCHEMA = 'run-card-frame-normalised-production-exception-v1';
const RUN_CARD_FRAME_NORMALISED_EXCEPTION_TRANSFORM = 'painted-card-box-normalise-lanczos-1009x1402';
const RUN_CARD_FRAME_NORMALISED_EXCEPTION_BY_SLOT = Object.freeze({
  'ui/run/card-prototypes/concinnous-frame-v1.png': Object.freeze({
    outputSha256: '310629d033eebd8f2b1227de1b8a42e1a6b86087327111c145b8f715d4481bcb',
    sourceSha256: '38b1290df1067dfa3562b874478b29c3f47341d8a065c90d426cec2cdaa32cc7',
    sourcePaintedHeight: 1420,
  }),
  'ui/run/card-prototypes/hieratic-frame-v1.png': Object.freeze({
    outputSha256: '6552cae59d0d1b404a466b2d37fb6d0a0e6dcdcd60b171ec4979f8a50c610348',
    sourceSha256: '7ae3b1945da8fefa46a264b696b0fc5695454c80c7256f879fd465a06a2d1152',
    sourcePaintedHeight: 1427,
  }),
});
// ADR-0414. The owner selected exact Codex derivatives after side-by-side
// review. Their generated sources are archived in live storage, and these exact
// output bytes are admitted only in their dedicated starter-card roles. This is
// deliberately narrower than treating resampled review media as generally native.
const RUN_STARTER_SELECTED_DERIVATIVE_EXCEPTION_SCHEMA =
  'run-starter-selected-derivative-production-exception-v1';
const RUN_CARD_BACK_SLOT = 'ui/run/card-back/standard.png';
const RUN_CARD_BACK_SLOT_PATTERN = /^ui\/run\/card-back\/([a-z0-9]+(?:-[a-z0-9]+)*)\.png$/;
const RUN_CARD_BACK_COMPONENT = 'run-card-back';
const RUN_CARD_BACK_PROOF_SCHEMA = 'run-card-back-card-layout-proof-v1';
const RUN_CARD_BACK_PROOF_RENDERER = 'RunCardBack/CardLayout';
const RUN_CARD_RARITY_FRAME_PROOF_SCHEMA = 'run-card-rarity-frame-card-layout-proof-v3';
const RUN_CARD_RARITY_FRAME_PROOF_RENDERER = 'RunCardFace/CardLayout';
const RUN_CARD_RARITY_FRAME_BY_SLOT = Object.freeze({
  'ui/run/card-prototypes/standard-uncommon-frame-v1.png': 'uncommon',
  'ui/run/card-prototypes/standard-rare-frame-v1.png': 'rare',
});
const RUN_STARTER_SELECTED_DERIVATIVE_BY_SLOT = Object.freeze({
  'ui/run/card-art/his-grace/illustration.png': Object.freeze({
    outputSha256: '3911aa54c164a29837ac99d4d34bfc468c80af7ed8e4e41246c7431d9b394ec2',
    sourceSha256: 'bc0ce7ad6e940d475b1beb069fb5269feafdc9124b70f105eedd2d918a669859',
    sourceVersionId: '8759216d-74b8-4467-aad8-5840a7c13644',
    sourceWidth: 1499,
    sourceHeight: 1049,
    outputWidth: 400,
    outputHeight: 280,
    transform: 'nearest-neighbor-resize-1499x1049-to-400x280-no-crop',
  }),
  'ui/run/card-art/front-lines/illustration.png': Object.freeze({
    outputSha256: '56752ab5f9ff817113ae43c7278624aad5ab8f8fe42f8f5b174eedf84ce86bda',
    sourceSha256: '09fabd713f9aa75bcd3ff5d34eb7dd68c602bf9a389d13c9e6269e6015def81f',
    sourceVersionId: '9be2d1c0-912d-4770-94f6-36d0f76bd8ce',
    sourceWidth: 1499,
    sourceHeight: 1049,
    outputWidth: 400,
    outputHeight: 280,
    transform: 'nearest-neighbor-resize-1499x1049-to-400x280-no-crop',
  }),
  'ui/kit/icons/card-properties/praecipuus.png': Object.freeze({
    outputSha256: 'f3e6be8674f1c106ba328a015ca10c7ad0d98f4eb7ec4f4a0f6e0c6a8cbda8e6',
    sourceSha256: '9e24dd89a51a5927d44c7fa779b7e910fd67aa9431e981d96b70f46ada7378e1',
    sourceVersionId: '8a0ad309-f538-432a-96df-208fa1a12f7d',
    sourceWidth: 1774,
    sourceHeight: 887,
    outputWidth: 64,
    outputHeight: 64,
    transform: 'left-887x887-largest-component-nearest-neighbor-fit-40x54-center-64',
  }),
});
const RUN_RESOURCE_ICON_COMPONENT = 'run-resource-icon';
const RUN_RESOURCE_ICON_SLOT = /^ui\/run\/resources\/([a-z][a-z0-9-]{0,79})\.png$/;
// Loss only. The gain-direction mark — coins rising behind a green arrow — was accepted under
// ADR-0486 and RETIRED by ADR-0511 when no Run transaction paid gold in any more, and its slot
// is retired in the database, so an upload to it is refused `media_slot_retired`. The Battle
// log's Manubium row is now a gain consumer and would be the reason to bring it back; doing so
// is a migration, not an edit here, and until then that row states its sign in the number.
const RUN_GOLD_TRANSACTION_REVIEW_SLOTS = new Set([
  'ui/run/resources/lose-gold.png',
]);
const RUN_CARD_COST_COIN_COMPONENT = 'run-card-cost-coin';
const RUN_CARD_COST_COIN_SLOT = 'ui/run/card-prototypes/cost-coin-v1.png';
// What is struck on the coin when no price is. The coin is the socket and its mark is
// separate media, exactly as the price numeral is separate text (ADR-0530).
const RUN_CARD_COST_CROWN_COMPONENT = 'run-card-cost-crown';
const RUN_CARD_COST_CROWN_SLOT = 'ui/run/card-prototypes/cost-crown-v1.png';
const RUN_CARD_GOLD_TIER_DIVIDER_COMPONENT = 'run-card-gold-tier-divider';
const RUN_CARD_GOLD_TIER_DIVIDER_SLOT = 'ui/run/card-prototypes/gold-tier-divider-v1.png';
const RUN_CARD_GOLD_TIER_DIVIDER_PROOF_SCHEMA = 'run-card-gold-tier-divider-enchiridion-proof-v1';
const RUN_CARD_GOLD_TIER_DIVIDER_PROOF_RENDERER = 'RunCardGoldTierDivider/Enchiridion';
const RUN_CARD_GOLD_TIER_DIVIDER_SCALED_PRODUCTION_EXCEPTION_SCHEMA =
  'run-card-gold-tier-divider-scaled-production-exception-v1';
// The accepted shared-dev evidence predates the final ADR renumbering. Because
// native evidence is immutable, the exact selected SHA retains that historical
// tag while every new record uses the canonical ADR-0506 identity.
const RUN_CARD_GOLD_TIER_DIVIDER_EVIDENCE_DECISIONS = new Set(['ADR-0506', 'ADR-0503']);
const RUN_CARD_GOLD_TIER_DIVIDER_SHA256 =
  '230eab0e82646434ee603bbcb624a27d44dc3c4f81e2f68c2fa23ae1d0fb18c0';
const RUN_CARD_GOLD_TIER_DIVIDER_SLICE = Object.freeze({ top: 138, right: 56, bottom: 139, left: 132 });
const RUN_CARD_GOLD_TIER_DIVIDER_DRAW = Object.freeze({ height: 38, left: 47, right: 20 });
const RUN_SECTIO_WRAP_COMPONENT = 'run-sectio-wrap';
const RUN_SECTIO_WRAP_SLOT = /^ui\/run\/sectio-wrap\/([a-z][a-z0-9-]{0,79})\.png$/;
// A wrap frames live cards rather than replacing them, so the only geometry the
// runtime needs is where the card row sits inside the painted canvas.
const RUN_SECTIO_WRAP_KINDS = Object.freeze(['seat', 'band', 'slots', 'screen']);
const RUN_PROGRESS_ICON_COMPONENT = 'run-progress-icon';
// The mark of one Run card ACTION, drawn on the control that performs it rather
// than on a screen. Trimmed to its own ink like the position marks, because it
// shares a row with a label instead of sitting in a padded 64x64 frame.
const RUN_ACTION_ICON_COMPONENT = 'run-action-icon';
// The mark one Event Log prose line wears, drawn in the column the move numbers take.
// Trimmed to its own ink like the position and action marks, for the same reason: it
// shares an 18px seat with a line of type instead of sitting in a padded 64x64 frame,
// so transparent margin left on the canvas would come straight off the drawn glyph.
const BATTLE_LOG_MARK_COMPONENT = 'battle-log-mark';
// Each state and property is registered under the word the game says (ADR-0374): the slot,
// the stored value and the name a player reads are one vocabulary.
const GAME_CONDITION_ICON_BY_SLOT = Object.freeze({
  'ui/kit/icons/game/cacochymic.png': Object.freeze({ component: 'unit-ability-icon', variant: 'cacochymic' }),
  'ui/kit/icons/game/eutactic.png': Object.freeze({ component: 'unit-ability-icon', variant: 'eutactic' }),
  'ui/kit/icons/game/adlected.png': Object.freeze({ component: 'unit-ability-icon', variant: 'adlected' }),
  'ui/kit/icons/game/agminate.png': Object.freeze({ component: 'unit-ability-icon', variant: 'agminate' }),
  'ui/kit/icons/card-properties/pestiferous.png': Object.freeze({ component: 'card-property-icon', variant: 'pestiferous' }),
  'ui/kit/icons/card-properties/concinnous.png': Object.freeze({ component: 'card-property-icon', variant: 'concinnous' }),
  'ui/kit/icons/card-properties/legatine.png': Object.freeze({ component: 'card-property-icon', variant: 'legatine' }),
  'ui/kit/icons/card-properties/hieratic.png': Object.freeze({ component: 'card-property-icon', variant: 'hieratic' }),
  'ui/kit/icons/card-properties/praecipuus.png': Object.freeze({ component: 'card-property-icon', variant: 'praecipuus' }),
  // The Run's position in its War, as the persistent title bar names it, plus the
  // emblem that says WHICH ladder the carved rung beside it belongs to.
  'ui/kit/icons/run/ataraxia-mark.png': Object.freeze({ component: RUN_PROGRESS_ICON_COMPONENT, variant: 'ataraxia' }),
  'ui/kit/icons/run/conflict.png': Object.freeze({ component: RUN_PROGRESS_ICON_COMPONENT, variant: 'conflict' }),
  'ui/kit/icons/run/battle.png': Object.freeze({ component: RUN_PROGRESS_ICON_COMPONENT, variant: 'battle' }),
  // Athetize: the card-level act inside Expunctio (ADR-0443). It joins the action
  // family the board verbs are drawn in rather than the Run-position marks, because
  // what it names is a button's effect, not a place in the War.
  'ui/kit/icons/game/athetize.png': Object.freeze({ component: RUN_ACTION_ICON_COMPONENT, variant: 'athetize' }),
  // The four Event Log marks with no existing home. The clock's hourglass, the objective
  // flag and the Run's two coins are already installed for the title bar and the board's
  // rising gold, and the log reuses those verbatim rather than forging a second of any of
  // them (ADR-0059) — so only these four are registered here.
  'ui/kit/icons/game/check.png': Object.freeze({ component: BATTLE_LOG_MARK_COMPONENT, variant: 'check' }),
  'ui/kit/icons/game/victory.png': Object.freeze({ component: BATTLE_LOG_MARK_COMPONENT, variant: 'victory' }),
  'ui/kit/icons/game/defeat.png': Object.freeze({ component: BATTLE_LOG_MARK_COMPONENT, variant: 'defeat' }),
  'ui/kit/icons/game/draw.png': Object.freeze({ component: BATTLE_LOG_MARK_COMPONENT, variant: 'draw' }),
  // The CAUSE half of the vocabulary. An outcome mark and one of these finish a log line
  // between them with no words in it, so each needs a glyph of its own.
  'ui/kit/icons/game/checkmate.png': Object.freeze({ component: BATTLE_LOG_MARK_COMPONENT, variant: 'checkmate' }),
  'ui/kit/icons/game/stalemate.png': Object.freeze({ component: BATTLE_LOG_MARK_COMPONENT, variant: 'stalemate' }),
  'ui/kit/icons/game/resign.png': Object.freeze({ component: BATTLE_LOG_MARK_COMPONENT, variant: 'resign' }),
  // Gold ARRIVING. The Run's coin is a resource mark and states no direction, so a payout row
  // drawing it left the number to carry the sign alone — beside a loss row whose own mark says
  // its direction outright. This is the coin stack the game already uses, carrying a green plus.
  'ui/kit/icons/game/gold.png': Object.freeze({ component: BATTLE_LOG_MARK_COMPONENT, variant: 'gold' }),
});
const CARD_TYPE_ROW_TEXTURE_COMPONENT = 'card-type-row-texture';
const CARD_TYPE_ROW_TEXTURE_GROUP_ID = 'card-type-row-textures-pixen-v1';
const CARD_TYPE_ROW_TEXTURE_BY_SLOT = Object.freeze({
  'ui/surfaces/card-type-pestiferous.png': Object.freeze({ variant: 'pestiferous', width: 128, height: 64 }),
  'ui/surfaces/card-type-concinnous.png': Object.freeze({ variant: 'concinnous', width: 512, height: 64 }),
  'ui/surfaces/card-type-legatine.png': Object.freeze({ variant: 'legatine', width: 128, height: 64 }),
  'ui/surfaces/card-type-hieratic.png': Object.freeze({ variant: 'hieratic', width: 128, height: 64 }),
});
const CARD_TYPE_ROW_TEXTURE_REQUIRED_SLOTS = Object.freeze(Object.keys(CARD_TYPE_ROW_TEXTURE_BY_SLOT).sort());
const LEVEL_EDITOR_BRUSH_ICON_SLOT = 'ui/kit/icons/brush.png';
const LEVEL_EDITOR_BRUSH_ICON_COMPONENT = 'level-editor-tool-icon';
const LEVEL_EDITOR_BRUSH_ICON_PROOF_SCHEMA = 'level-editor-brush-icon-exact-byte-proof-v1';
const LEVEL_EDITOR_BRUSH_ICON_PROOF_RENDERER = 'LevelEditorControlsPanel/inner-brush-tool';
const LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SCHEMA = 'level-editor-brush-option-01-scaled-production-exception-v1';
const LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SHA256 = 'abaf1ab5e8f34531864e4e9e9d52cb15a0e7b944e84a79dea98939013267074a';
const SFX_SAMPLE_COMPONENT = 'sfx-sample';
const SFX_SAMPLE_PROOF_RENDERER = 'SfxViewer/ExactCandidateAudition';
const SFX_SAMPLE_PROOF_SCHEMA = 'sfx-sample-exact-byte-proof-v1';
const SFX_SAMPLE_SLOT = /^sfx\/([a-z0-9][a-z0-9_-]{0,63})\/v([0-9]+)\.(aac|flac|m4a|mp3|oga|ogg|wav|webm)$/;
const SFX_MEDIA_TYPE_BY_EXTENSION = Object.freeze({
  aac: 'audio/aac',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
});
// The Ataraxia rung marks (ADR-0362): `ui/kit/numerals/<style>/<rung>.png`, forged 0-through-X
// as one set and reviewed on the Ataraxia reference rows of either host.
const ATARAXIA_NUMERAL_SLOT = /^ui\/kit\/numerals\/([a-z][a-z0-9-]{0,31})\/([a-z][a-z0-9-]{0,15})\.png$/;
const ATARAXIA_NUMERAL_COMPONENT = 'ataraxia-rung-numeral';
const TITLE_BAR_MARK_COMPONENT = 'title-bar-mark';
// The rung marks compose the GENERIC typed owner proof (which acceptance requires of every
// non-terrain, non-group domain) with the domain rules below — one evidence object that both
// the review-time surface check and the accept-time typed-proof check read.
const ATARAXIA_NUMERAL_PROOF_SCHEMA = 'live-media-owner-proof-v1';
const ATARAXIA_NUMERAL_PROOF_RENDERER = 'Enchiridion/AtaraxiaSection';
const ATARAXIA_NUMERAL_REVIEW_SURFACE = /^(?:\/(?:play|run))?\/(?:strategikon\/)?enchiridion\/ataraxia$/;
const STRATEGIKON_BACKGROUND_COMPONENT = 'strategikon-background';
const STRATEGIKON_BACKGROUND_PROOF_RENDERER = 'ShellWorkspace/StrategikonBackgroundArtwork';
const STRATEGIKON_BACKGROUND_PROOF_SCHEMA = 'strategikon-background-cover-exception-v1';
const STRATEGIKON_BACKGROUND_SLOT = 'ui/workspaces/strategikon/background.png';
const STRATEGIKON_BACKGROUND_SHA256 = '8084f009cae79d3eaaa64bb2c0f5df6e26fc8dfe7d9f0547f24135102d41ffe7';
// Full-screen artwork behind one workspace. The Strategikon keeps its own stricter,
// byte-pinned projection (ADR-0336) and is dispatched before this one; these are the
// screens whose backdrop is chosen from generated candidates in Studio > Screen Art.
const LIPSANON_MAT_COMPONENT = 'run-lipsanon-mat';
const LIPSANON_MAT_SLOT = 'ui/run/bona-vacantia/mat.png';
const runLipsanonMatSlot = (slot) => String(slot || '') === LIPSANON_MAT_SLOT;
const WORKSPACE_BACKGROUND_COMPONENT = 'workspace-background';
const WORKSPACE_BACKGROUND_SLOT = /^ui\/workspaces\/([a-z][a-z0-9-]{0,63})\/background\.png$/;
const WORKSPACE_BACKGROUND_IDS = Object.freeze([
  'run-victory', 'run-bona-vacantia', 'run-commendatio', 'level-editor-events',
]);
// Perimeter walls live in the terrain domain but are NOT board tiles: they carry their own
// full-height frame geometry (ADR-0086) instead of the 96x180 tile projection, so they are
// dispatched before the tile rules the way the brush icon and SFX takes are.
const WALL_MATERIAL_COMPONENT = 'wall-material';
const WALL_MATERIAL_PROOF_SCHEMA = 'wall-material-canonical-board-proof-v1';
const WALL_MATERIAL_PROOF_RENDERER = 'BoardLabBoard/BoardBarrierSceneLayer';
const WALL_MATERIAL_FRAME_SLOT = /^tiles\/feature\/wall-([a-z][a-z0-9-]{0,63})-(1|8|9)\.png$/;
const WALL_MATERIAL_THUMB_SLOT = /^tiles\/feature\/wall-([a-z][a-z0-9-]{0,63})-thumb\.png$/;
const WALL_MATERIAL_FRAME_WIDTH = 128;
const WALL_MATERIAL_FRAME_HEIGHT = 336;
const WALL_MATERIAL_THUMB_MAX = 512;

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizedSha(value) {
  const sha = String(value || '').trim().toLowerCase();
  return SHA256.test(sha) ? sha : null;
}

function predrawnBoardSlotSlug(slot) {
  const match = PREDRAWN_BOARD_SLOT.exec(String(slot || ''));
  return match ? match[1] : null;
}

function runLipsanonIconSlotId(slot) {
  const match = LIPSANON_ICON_SLOT.exec(String(slot || ''));
  return match ? match[1] : null;
}

function runResourceIconSlotId(slot) {
  const match = RUN_RESOURCE_ICON_SLOT.exec(String(slot || ''));
  return match ? match[1] : null;
}

function runCardCostCoinSlot(slot) {
  return String(slot || '') === RUN_CARD_COST_COIN_SLOT;
}

function runCardCostCrownSlot(slot) {
  return String(slot || '') === RUN_CARD_COST_CROWN_SLOT;
}

function runCardGoldTierDividerSlot(slot) {
  return String(slot || '') === RUN_CARD_GOLD_TIER_DIVIDER_SLOT;
}

/**
 * The back id a card-back slot names, or null.
 *
 * The card back is a family rather than one image (ADR-0524): the player picks which back their
 * Run deals, and each offered design owns its own slot so retiring one never re-points another's
 * pixels. `standard.png` stays a member and is the availability-critical fallback.
 */
function runCardBackSlot(slot) {
  const match = RUN_CARD_BACK_SLOT_PATTERN.exec(String(slot || ''));
  return match ? match[1] : null;
}

function runSectioWrapSlotId(slot) {
  const match = RUN_SECTIO_WRAP_SLOT.exec(String(slot || ''));
  return match ? match[1] : null;
}

/** A whole-pixel rectangle that must lie inside the painted canvas. */
function containedRect(value, canvasWidth, canvasHeight) {
  if (!isObjectRecord(value)) return null;
  const { x, y, w, h } = value;
  const whole = [x, y, w, h].every((entry) => Number.isSafeInteger(entry));
  if (!whole || w <= 0 || h <= 0 || x < 0 || y < 0) return null;
  if (x + w > canvasWidth || y + h > canvasHeight) return null;
  return { x, y, w, h };
}

function gameConditionIconSlot(slot) {
  return GAME_CONDITION_ICON_BY_SLOT[String(slot || '')] ?? null;
}

function cardTypeRowTextureSlot(slot) {
  return CARD_TYPE_ROW_TEXTURE_BY_SLOT[String(slot || '')] ?? null;
}

function levelEditorBrushIconSlot(slot) {
  return String(slot || '') === LEVEL_EDITOR_BRUSH_ICON_SLOT;
}

function sfxSampleSlot(slot) {
  const match = SFX_SAMPLE_SLOT.exec(String(slot || ''));
  if (!match) return null;
  const variantIndex = Number(match[2]);
  if (!Number.isSafeInteger(variantIndex) || variantIndex < 0 || variantIndex > 9999) return null;
  return { soundSetKey: match[1], variantIndex, extension: match[3] };
}

function strategikonBackgroundSlot(slot) {
  return String(slot || '') === STRATEGIKON_BACKGROUND_SLOT;
}

/** The `{style, rung}` an Ataraxia rung-mark slot names, or null (ADR-0362). */
function ataraxiaNumeralSlot(slot) {
  const match = ATARAXIA_NUMERAL_SLOT.exec(String(slot || ''));
  return match ? { style: match[1], rung: match[2] } : null;
}

/**
 * The typed completeness validator that lifts rung marks out of `ui-kit`'s bridge-only
 * default: a rung mark is one native 64x64 PNG naming its own rung, so the catalog can
 * state what the row will draw instead of trusting an untyped kit upload.
 */
function ataraxiaNumeralMediaIssue(row, projectedRuntime = null) {
  const contract = ataraxiaNumeralSlot(row.slot);
  if (!contract) return 'Ataraxia rung marks require a registered semantic slot';
  if (row.domain !== 'ui-kit') return 'Ataraxia rung marks require the ui-kit domain';
  if (row.media_type !== 'image/png') return 'Ataraxia rung marks require image/png';
  if (Number(row.width) !== 64 || Number(row.height) !== 64) {
    return 'Ataraxia rung marks must be native 64x64 rasters';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Ataraxia rung marks require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Ataraxia rung mark runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== ATARAXIA_NUMERAL_COMPONENT) {
    return `Ataraxia rung mark metadata.runtime.component must be ${ATARAXIA_NUMERAL_COMPONENT}`;
  }
  if (runtime.nativeRole !== ATARAXIA_NUMERAL_COMPONENT) {
    return `Ataraxia rung mark metadata.runtime.nativeRole must be ${ATARAXIA_NUMERAL_COMPONENT}`;
  }
  // The style is the slot's own path segment; the runtime block stays inside the shared
  // key allowlist rather than inventing a projection key for it.
  if (runtime.variant !== contract.rung) return 'Ataraxia rung mark variant must match its semantic slot';
  if (runtime.frameWidth !== 64 || runtime.frameHeight !== 64 || runtime.frameCount !== 1) {
    return 'Ataraxia rung mark runtime geometry must describe one native 64x64 frame';
  }
  return null;
}

/**
 * A rung mark is reviewed where it is worn: the Ataraxia reference rows, on either host.
 * Every other art domain names its own review surface this way; without one, this domain
 * would fall through to the `/studio` backstop and evidence would have to claim a surface
 * the reviewer never opened. The proof carries the same candidate/slot snapshot every
 * other domain requires — this registers a surface, it does not relax a gate.
 */
function ataraxiaNumeralOwnerProofIssue(row, proof, surfaceUrl = null) {
  if (!ataraxiaNumeralSlot(row.slot)) return 'Ataraxia numeral proof requires a registered rung slot';
  if (!isObjectRecord(proof) || proof.schema !== ATARAXIA_NUMERAL_PROOF_SCHEMA) {
    return `Ataraxia numeral review requires ${ATARAXIA_NUMERAL_PROOF_SCHEMA}`;
  }
  if (proof.renderer !== ATARAXIA_NUMERAL_PROOF_RENDERER) {
    return 'Ataraxia numeral proof does not name the reviewed rung renderer';
  }
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'Ataraxia numeral proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'Ataraxia numeral proof surfaceUrl is invalid'; }
  if (!ATARAXIA_NUMERAL_REVIEW_SURFACE.test(parsedSurface.pathname)) {
    return 'Ataraxia numeral proof must identify the live Ataraxia reference rows';
  }
  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (!candidateSha256 || !Array.isArray(proof.selectedCandidates) || proof.selectedCandidates.length !== 1) {
    return 'Ataraxia numeral proof must identify exactly one candidate';
  }
  const selected = proof.selectedCandidates[0];
  if (
    !isObjectRecord(selected) || selected.slot !== row.slot || selected.versionId !== String(row.id)
    || normalizedSha(selected.sha256) !== candidateSha256
  ) return 'Ataraxia numeral proof does not identify the reviewed candidate bytes';
  if (!Array.isArray(proof.slotSnapshots) || proof.slotSnapshots.length !== 1) {
    return 'Ataraxia numeral proof must snapshot exactly one semantic slot';
  }
  const snapshot = proof.slotSnapshots[0];
  if (!isObjectRecord(snapshot) || snapshot.slot !== row.slot) {
    return 'Ataraxia numeral proof slot snapshot is invalid';
  }
  // The set is judged together — a half-carved ladder is the defect this records against.
  if (!Array.isArray(proof.reviewedSet) || proof.reviewedSet.length < 2
    || !proof.reviewedSet.every((entry) => typeof entry === 'string' && ataraxiaNumeralSlot(entry))
    || !proof.reviewedSet.includes(row.slot)) {
    return 'Ataraxia numeral proof must record the whole reviewed rung set';
  }
  return null;
}

/**
 * The wall material and face a `tiles/feature/wall-<material>-<mask|thumb>.png` slot names, or
 * null. `mask` is the N(1)/W(8) face bitmask the frame paints; `thumb` is its picker card.
 */
// Board prop artwork. A prop is one drawing shown through two depth-half slots so a unit can
// stand between its front and back; the halves are not two pictures, they are one picture cut at
// its ground contact. That is the completeness this validator exists to state, and its absence is
// why the prop domain was refused acceptance outright and every prop in the game arrived over the
// legacy bridge instead.
// `impact` is a one-shot sprite sheet: the prop's resting frame followed by what happens to it
// when it lands, ending on the appearance it keeps. It is a strip, so it is wider than a half.
const PROP_ART_SLOT = /^props\/([a-z][a-z0-9-]*)\/(back|front|impact)\.png$/;

/** The prop and depth half a slot names, or null when the slot is not prop artwork. */
function propArtSlot(slot) {
  const match = PROP_ART_SLOT.exec(String(slot || ''));
  return match ? { propId: match[1], half: match[2] } : null;
}

/**
 * Prop artwork is complete when it is a native raster of a plausible sprite frame that both
 * depth halves can be cut from. The seat document addresses the contact point as a pixel INSIDE
 * this frame, so a frame outside these bounds cannot be seated by any anchor a human would author.
 */
function propArtMediaIssue(row, projectedRuntime = null) {
  const contract = propArtSlot(row.slot);
  if (!contract) return 'prop artwork requires a props/<id>/<half>.png slot';
  if (row.domain !== 'prop') return 'prop artwork requires the prop domain';
  if (row.role !== 'media') return 'prop artwork requires the media role';
  if (row.media_type !== 'image/png') return 'prop artwork requires image/png';
  const width = Number(row.width);
  const height = Number(row.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8) {
    return 'prop artwork requires a raster at least 8x8';
  }
  // A prop frame is a sprite, not a scene. The upper bound is the largest installed prop frame
  // (the 192x300 oak) with room above it; anything larger is a source render that has not been
  // cropped to a placeable frame.
  if (height > 512) return 'prop artwork frames are bounded at 512px tall';
  if (contract.half === 'impact') {
    // A strip is as wide as its frames; its frame is still bounded, and it must divide evenly or
    // the renderer cannot cut a frame from it.
    const metadata = mediaVersionMetadata(row);
    const runtimeMeta = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
    const frameCount = Number(runtimeMeta?.frameCount);
    const frameWidth = Number(runtimeMeta?.frameWidth);
    if (!Number.isInteger(frameCount) || frameCount < 2 || frameCount > 32) {
      return 'prop impact sheets require metadata.runtime.frameCount between 2 and 32';
    }
    if (!Number.isInteger(frameWidth) || frameWidth < 8 || frameWidth > 512) {
      return 'prop impact sheets require a metadata.runtime.frameWidth between 8 and 512';
    }
    if (frameWidth * frameCount !== width) {
      return 'prop impact sheet width must equal frameWidth times frameCount';
    }
    return null;
  }
  if (width > 512) return 'prop artwork frames are bounded at 512px wide';
  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (runtime && Object.keys(runtime).length) {
    const allowed = new Set(['component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole']);
    const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
    if (unsupported.length) {
      return `prop artwork runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
    }
  }
  return null;
}

function wallMaterialSlot(slot) {
  const raw = String(slot || '');
  const frame = WALL_MATERIAL_FRAME_SLOT.exec(raw);
  if (frame) return { material: frame[1], mask: Number(frame[2]), thumb: false };
  const thumb = WALL_MATERIAL_THUMB_SLOT.exec(raw);
  return thumb ? { material: thumb[1], mask: null, thumb: true } : null;
}

/** The workspace id a `ui/workspaces/<id>/background.png` slot names, or null. */
function workspaceBackgroundSlotId(slot) {
  const match = WORKSPACE_BACKGROUND_SLOT.exec(String(slot || ''));
  const id = match ? match[1] : null;
  return id && WORKSPACE_BACKGROUND_IDS.includes(id) ? id : null;
}

function mediaVersionMetadata(row) {
  return isObjectRecord(row.version_metadata) ? row.version_metadata
    : isObjectRecord(row.metadata) ? row.metadata : {};
}

function predrawnBoardAlignmentIssue(value, frameWidth, frameHeight) {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    return 'pre-drawn board proof requires a canonical serialized alignment';
  }
  const sections = value.split(';');
  if (sections.length !== 6 || sections[0] !== 'v4') {
    return 'pre-drawn board alignment must use the canonical v4 payload';
  }
  const numbers = (text, count) => {
    const tokens = text.split(',');
    if (tokens.length !== count || tokens.some((token) => !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(token))) return null;
    const parsed = tokens.map(Number);
    return parsed.every(Number.isFinite) ? parsed : null;
  };
  const frameAndCorners = numbers(sections[1], 10);
  const grid = numbers(sections[2], 2);
  if (!frameAndCorners || !grid) return 'pre-drawn board alignment geometry is malformed';
  if (
    frameAndCorners[0] !== Number(frameWidth) || frameAndCorners[1] !== Number(frameHeight)
    || !Number.isInteger(grid[0]) || !Number.isInteger(grid[1])
    || grid[0] < 1 || grid[0] > 64 || grid[1] < 1 || grid[1] > 64
  ) return 'pre-drawn board alignment does not match the reviewed frame/grid';
  const columnGuides = numbers(sections[3], grid[0] + 1);
  const rowGuides = numbers(sections[4], grid[1] + 1);
  const boundary = numbers(sections[5], 8);
  if (!columnGuides || !rowGuides || !boundary) return 'pre-drawn board alignment guides or boundary are malformed';
  const monotonicUnitGuides = (guides) => (
    guides[0] === 0 && guides.at(-1) === 1
    && guides.every((guide, index) => guide >= 0 && guide <= 1 && (index === 0 || guide > guides[index - 1]))
  );
  if (!monotonicUnitGuides(columnGuides) || !monotonicUnitGuides(rowGuides)) {
    return 'pre-drawn board alignment guides must be strictly monotonic from 0 to 1';
  }
  const allPoints = [...frameAndCorners.slice(2), ...boundary];
  for (let index = 0; index < allPoints.length; index += 2) {
    if (
      allPoints[index] < 0 || allPoints[index] > Number(frameWidth)
      || allPoints[index + 1] < 0 || allPoints[index + 1] > Number(frameHeight)
    ) return 'pre-drawn board alignment points must lie inside the reviewed frame';
  }
  return null;
}

/**
 * Domain-owned runtime projection for one complete pre-drawn level plate.
 * Dimensions are candidate-declared native geometry, not a global preset.
 */
function predrawnBoardMediaIssue(row, projectedRuntime = null) {
  const slug = predrawnBoardSlotSlug(row.slot);
  if (!slug) return 'pre-drawn board slots must match boards/<board-slug>/plate.png';
  if (row.domain !== 'background') return 'pre-drawn board plates require the background domain';
  if (row.role !== 'media') return 'pre-drawn board plates require the media role';
  if (row.media_type !== 'image/png') return 'pre-drawn board plates require image/png';
  if (
    !Number.isInteger(Number(row.width)) || Number(row.width) < 1
    || !Number.isInteger(Number(row.height)) || Number(row.height) < 1
  ) return 'pre-drawn board plates require decoded positive raster dimensions';

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'pre-drawn board plates require metadata.runtime';
  const allowed = new Set(['component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `pre-drawn board runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== PREDRAWN_BOARD_COMPONENT) {
    return `pre-drawn board metadata.runtime.component must be ${PREDRAWN_BOARD_COMPONENT}`;
  }
  if (runtime.variant !== slug) return 'pre-drawn board runtime variant must match its semantic slot slug';
  if (runtime.frameWidth !== Number(row.width) || runtime.frameHeight !== Number(row.height)) {
    return 'pre-drawn board runtime frame dimensions must equal the uploaded PNG dimensions';
  }
  if (runtime.frameCount !== 1) return 'pre-drawn board runtime frameCount must be 1';
  return null;
}

/**
 * Domain-owned runtime projection for one native Run lipsanon icon. Lipsanon
 * membership remains in the drawable catalog; the semantic slot only carries
 * the exact reviewed pixels for that installed record.
 */
function runLipsanonIconMediaIssue(row, projectedRuntime = null) {
  const lipsanonId = runLipsanonIconSlotId(row.slot);
  if (!lipsanonId) return 'Run lipsanon icon slots must match ui/run/lipsana/<lipsanon-id>.png';
  if (row.domain !== 'ui-kit') return 'Run lipsanon icons require the ui-kit domain';
  if (row.role !== 'icon') return 'Run lipsanon icons require the icon role';
  if (row.media_type !== 'image/png') return 'Run lipsanon icons require image/png';
  if (Number(row.width) !== 64 || Number(row.height) !== 64) {
    return 'Run lipsanon icons must be native 64x64 rasters';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Run lipsanon icons require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Run lipsanon icon runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== LIPSANON_ICON_COMPONENT) {
    return `Run lipsanon icon metadata.runtime.component must be ${LIPSANON_ICON_COMPONENT}`;
  }
  if (runtime.variant !== lipsanonId) return 'Run lipsanon icon variant must match its semantic slot id';
  if (runtime.frameWidth !== 64 || runtime.frameHeight !== 64 || runtime.frameCount !== 1) {
    return 'Run lipsanon icon runtime geometry must describe one native 64x64 frame';
  }
  if (runtime.nativeRole !== LIPSANON_ICON_COMPONENT) {
    return `Run lipsanon icon metadata.runtime.nativeRole must be ${LIPSANON_ICON_COMPONENT}`;
  }
  if (runtime.altText !== '') {
    return 'Run lipsanon icon metadata.runtime.altText must be empty because the lipsanon label owns its accessible name';
  }
  return null;
}

/**
 * Domain-owned runtime projection for one Run Sectio wrap: generated art that
 * frames the live Sectio's card row. The wrap is decorative chrome around real
 * cards, so it never carries text and never supplies an accessible name; the
 * runtime contract is purely the card window measured on the painted canvas.
 */
function runSectioWrapMediaIssue(row, projectedRuntime = null) {
  const wrapId = runSectioWrapSlotId(row.slot);
  if (!wrapId) return 'Run Sectio wrap slots must match ui/run/sectio-wrap/<wrap-id>.png';
  if (row.domain !== 'ui-kit') return 'Run Sectio wraps require the ui-kit domain';
  if (row.role !== 'sectio-wrap') return 'Run Sectio wraps require the sectio-wrap role';
  if (row.media_type !== 'image/png') return 'Run Sectio wraps require image/png';
  const width = Number(row.width);
  const height = Number(row.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    return 'Run Sectio wraps require decoded raster dimensions';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Run Sectio wraps require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'kind', 'canvasWidth', 'canvasHeight', 'window', 'slots', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Run Sectio wrap runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== RUN_SECTIO_WRAP_COMPONENT) {
    return `Run Sectio wrap metadata.runtime.component must be ${RUN_SECTIO_WRAP_COMPONENT}`;
  }
  if (runtime.nativeRole !== RUN_SECTIO_WRAP_COMPONENT) {
    return `Run Sectio wrap metadata.runtime.nativeRole must be ${RUN_SECTIO_WRAP_COMPONENT}`;
  }
  if (runtime.variant !== wrapId) return 'Run Sectio wrap variant must match its semantic slot id';
  if (!RUN_SECTIO_WRAP_KINDS.includes(runtime.kind)) {
    return `Run Sectio wrap kind must be one of ${RUN_SECTIO_WRAP_KINDS.join(', ')}`;
  }
  // The canvas is the acceptance-time contract against the uploaded raster, so a
  // re-crop can never silently move every measured window.
  if (runtime.canvasWidth !== width || runtime.canvasHeight !== height) {
    return 'Run Sectio wrap canvas metadata must match the uploaded raster dimensions';
  }
  const window = containedRect(runtime.window, width, height);
  if (!window) return 'Run Sectio wrap metadata.runtime.window must be a whole-pixel rect inside the canvas';
  const slots = Array.isArray(runtime.slots)
    ? runtime.slots.map((entry) => containedRect(entry, width, height))
    : [];
  if (slots.some((entry) => entry === null)) {
    return 'Run Sectio wrap metadata.runtime.slots must all be whole-pixel rects inside the canvas';
  }
  if (runtime.kind === 'slots' && slots.length < 2) {
    return 'Run Sectio wrap slots kind requires at least two measured card openings';
  }
  if (runtime.kind !== 'slots' && slots.length) {
    return 'Run Sectio wrap slots are only meaningful for the slots kind';
  }
  if (runtime.altText !== '') {
    return 'Run Sectio wrap metadata.runtime.altText must be empty because the live cards own the accessible content';
  }
  return null;
}

/**
 * Domain-owned runtime projection for one native Run resource icon. The
 * surrounding live number owns the accessible currency value.
 */
// A 64x64 canvas is a FRAME, not a size. An icon that fills 20 of it and one that
// fills 62 draw at wildly different scales and carry wildly different invisible
// padding, which is what makes a row of marks look unevenly spaced. So an icon in
// these families ships TRIMMED to its occupied pixels and padded to the square that
// bounds them: the raster is the art, and the only spacing left is the one the
// layout asks for. The historical full-frame 64x64 rasters remain valid — they are
// simply the case where the ink already filled the frame.
const TRIMMED_ICON_MIN_SIDE = 16;
const TRIMMED_ICON_MAX_SIDE = 64;

function trimmedIconRasterIssue(row, label) {
  const width = Number(row.width);
  const height = Number(row.height);
  if (width !== height) return `${label} must be square rasters`;
  if (!Number.isSafeInteger(width) || width < TRIMMED_ICON_MIN_SIDE || width > TRIMMED_ICON_MAX_SIDE) {
    return `${label} must be native square rasters from ${TRIMMED_ICON_MIN_SIDE}x${TRIMMED_ICON_MIN_SIDE} through ${TRIMMED_ICON_MAX_SIDE}x${TRIMMED_ICON_MAX_SIDE}`;
  }
  return null;
}

function trimmedIconRuntimeGeometryIssue(row, runtime, label) {
  const side = Number(row.width);
  if (runtime.frameWidth !== side || runtime.frameHeight !== side || runtime.frameCount !== 1) {
    return `${label} runtime geometry must describe one native ${side}x${side} frame`;
  }
  return null;
}

function runResourceIconMediaIssue(row, projectedRuntime = null) {
  const resourceId = runResourceIconSlotId(row.slot);
  if (!resourceId) return 'Run resource icon slots must match ui/run/resources/<resource-id>.png';
  if (row.domain !== 'ui-kit') return 'Run resource icons require the ui-kit domain';
  if (row.role !== 'icon') return 'Run resource icons require the icon role';
  if (row.media_type !== 'image/png') return 'Run resource icons require image/png';
  const trimmed = trimmedIconRasterIssue(row, 'Run resource icons');
  if (trimmed) return trimmed;

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Run resource icons require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Run resource icon runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== RUN_RESOURCE_ICON_COMPONENT) {
    return `Run resource icon metadata.runtime.component must be ${RUN_RESOURCE_ICON_COMPONENT}`;
  }
  if (runtime.variant !== resourceId) return 'Run resource icon variant must match its semantic slot id';
  const geometry = trimmedIconRuntimeGeometryIssue(row, runtime, 'Run resource icon');
  if (geometry) return geometry;
  if (runtime.nativeRole !== RUN_RESOURCE_ICON_COMPONENT) {
    return `Run resource icon metadata.runtime.nativeRole must be ${RUN_RESOURCE_ICON_COMPONENT}`;
  }
  if (runtime.altText !== '') {
    return 'Run resource icon metadata.runtime.altText must be empty because the live value owns its accessible name';
  }
  return null;
}

function runExpunctioReviewSurface(url) {
  return url instanceof URL
    && url.pathname === '/run'
    && url.searchParams.get('view') === 'expunctio';
}

function runGoldTransactionReviewSurface(url, slot) {
  return RUN_GOLD_TRANSACTION_REVIEW_SLOTS.has(String(slot || ''))
    && runExpunctioReviewSurface(url);
}

/**
 * The marks the persistent title bar wears — the battle clock's hourglass and the
 * objective flag. They are worn on the live play surfaces and NOWHERE else: no Studio
 * page lists them and no reference row shows them, so the generic `/studio` proof rule
 * had the perverse effect of accepting a page these glyphs are invisible on while
 * refusing the only page they actually appear on. A registered surface for them is the
 * same shape every other domain already uses (predrawn boards, sfx, brush icons), and it
 * makes the strongest available proof — a capture of the real seat — the legal one.
 */
const TITLE_BAR_MARK_REVIEW_SLOTS = new Set([
  'ui/kit/icons/game/wait.png',
  'ui/kit/icons/game/objective.png',
]);

function titleBarMarkReviewSurface(url, slot) {
  return titleBarMarkSlot(slot)
    && url instanceof URL
    && (url.pathname === '/play' || url.pathname === '/run');
}

/** Whether this slot is a mark the persistent title bar wears. */
function titleBarMarkSlot(slot) {
  return TITLE_BAR_MARK_REVIEW_SLOTS.has(String(slot || ''));
}

/**
 * The typed completeness validator that lifts title-bar marks out of `ui-kit`'s
 * bridge-only default.
 *
 * The contract these marks have to state is the one the seat depends on: a mark is
 * TRIMMED TO ITS OWN INK. A square seat draws with `contain`, which scales the canvas, so
 * transparent margin left on the canvas comes straight off the drawn glyph — an untrimmed
 * mark silently draws smaller than the marks beside it, and the only fix at that point is
 * a hand-copied compensation number in CSS that goes stale the moment the art changes.
 * Requiring the bytes to be trimmed at acceptance means the seat can stay dumb and the
 * marks cannot drift apart.
 *
 * Deliberately no fixed dimensions: these glyphs are not all the same shape (an hourglass
 * is tall and narrow, a flag is not), and forcing a square would reintroduce the padding
 * this exists to reject.
 */
function titleBarMarkMediaIssue(row, projectedRuntime = null) {
  if (!titleBarMarkSlot(row.slot)) return 'Title-bar marks require a registered semantic slot';
  if (row.domain !== 'ui-kit') return 'Title-bar marks require the ui-kit domain';
  if (row.media_type !== 'image/png') return 'Title-bar marks require image/png';
  if (!Number(row.width) || !Number(row.height)) return 'Title-bar marks require decoded raster dimensions';

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Title-bar marks require metadata.runtime';
  const allowed = new Set(['component', 'variant', 'altText', 'nativeRole']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Title-bar mark runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== TITLE_BAR_MARK_COMPONENT) {
    return `Title-bar mark metadata.runtime.component must be ${TITLE_BAR_MARK_COMPONENT}`;
  }
  if (runtime.nativeRole !== TITLE_BAR_MARK_COMPONENT) {
    return `Title-bar mark metadata.runtime.nativeRole must be ${TITLE_BAR_MARK_COMPONENT}`;
  }
  // The mark carries its own accessible name nowhere: the chip's text does. An alt string
  // here would be read out beside a value that already says it.
  if (runtime.altText !== '') {
    return 'Title-bar mark metadata.runtime.altText must be empty because the chip owns its accessible name';
  }
  // Trimmed-ness is a claim about the BYTES, so it is stated where the row's other byte
  // claims live rather than in the runtime projection, whose key set is shared and closed.
  const native = isObjectRecord(row.native_evidence) ? row.native_evidence : {};
  const inkBox = isObjectRecord(native.inkBox) ? native.inkBox : null;
  if (!inkBox) return 'Title-bar marks must state nativeEvidence.inkBox, the measured ink box of these bytes';
  if (Number(inkBox.width) !== Number(row.width) || Number(inkBox.height) !== Number(row.height)) {
    return 'Title-bar marks must be trimmed to their own ink: the measured ink box must fill the canvas';
  }
  return null;
}

/**
 * The Adlectio mark: the glyph Expunctio prints beside a formation the current Sectio visit
 * admitted (ADR-0553). It is the same shape of thing as a title-bar mark and carries the same
 * contract — a small mark drawn into a seat with `contain`, so transparent margin on the canvas
 * comes straight off the drawn glyph — which is why it states its trimmed-ness at acceptance
 * rather than leaving the seat to compensate.
 *
 * It gets its own component name rather than borrowing the title bar's, because the two seats are
 * different sizes and a mark accepted for one must not silently satisfy the other.
 */
/**
 * Run preparation's rail-tab marks: the glyphs the Continue and New tabs wear (ADR-0558 made
 * those tabs the shared ApparatusRailTab, and a rail tab carries a mark; ADR-0582 named them —
 * the `run/current` and `run/new` slot paths below predate the labels and do not follow them).
 *
 * Their contract is the OPPOSITE of a title-bar mark's, which is why they cannot borrow that
 * validator. A title-bar mark is drawn into a square seat with `contain`, so it must be trimmed
 * to its own ink or it silently draws small. A rail mark is drawn on the kit's fixed 64x64 icon
 * canvas at a 40px slot, where the reserved transparent margin IS the optical centring
 * (ADR-0026) — trimming one would make it draw LARGER than the kit icons beside it. So this
 * requires the canonical canvas and a stated ink box strictly inside it, rather than filling it.
 */
const RUN_RAIL_MARK_COMPONENT = 'run-rail-mark';
const RUN_RAIL_MARK_CANVAS = 64;
/**
 * The band the drawn glyph must land in. The kit's own authored marks fill 62-84% of the 64px
 * canvas; a generated mark commonly comes back nearer the edge, and that is fine — the seat
 * compensates with a stated ink fraction (see .settings-tab's --settings-tab-icon-bleed-size).
 * What the band exists to reject is the two failures the seat CANNOT compensate: a glyph that
 * fills the canvas edge to edge, which then collides with the tab frame, and one so small it
 * reads as a different size class from its neighbours.
 */
const RUN_RAIL_MARK_INK_MIN = 0.62;
const RUN_RAIL_MARK_INK_MAX = 0.95;
const RUN_RAIL_MARK_SLOTS = new Map([
  ['ui/kit/icons/run/current.png', 'current'],
  ['ui/kit/icons/run/new.png', 'new'],
]);

function runRailMarkSlot(slot) {
  return RUN_RAIL_MARK_SLOTS.get(String(slot || '')) ?? null;
}

function runRailMarkReviewSurface(url, slot) {
  return Boolean(runRailMarkSlot(slot))
    && url instanceof URL
    && url.pathname === '/studio'
    && url.searchParams.get('cat') === 'runrailmarks';
}

function runRailMarkMediaIssue(row, projectedRuntime = null) {
  const variant = runRailMarkSlot(row.slot);
  if (!variant) return 'Run rail marks require a registered semantic slot';
  if (row.domain !== 'ui-kit') return 'Run rail marks require the ui-kit domain';
  if (row.media_type !== 'image/png') return 'Run rail marks require image/png';
  if (Number(row.width) !== RUN_RAIL_MARK_CANVAS || Number(row.height) !== RUN_RAIL_MARK_CANVAS) {
    return `Run rail marks require the canonical ${RUN_RAIL_MARK_CANVAS}x${RUN_RAIL_MARK_CANVAS} kit icon canvas`;
  }
  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Run rail marks require metadata.runtime';
  const allowed = new Set(['component', 'variant', 'altText', 'nativeRole']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Run rail mark runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== RUN_RAIL_MARK_COMPONENT) {
    return `Run rail mark metadata.runtime.component must be ${RUN_RAIL_MARK_COMPONENT}`;
  }
  if (runtime.nativeRole !== RUN_RAIL_MARK_COMPONENT) {
    return `Run rail mark metadata.runtime.nativeRole must be ${RUN_RAIL_MARK_COMPONENT}`;
  }
  if (runtime.variant !== variant) {
    return `Run rail mark metadata.runtime.variant must be ${variant} for ${row.slot}`;
  }
  // The tab's label owns the accessible name, so the mark states none.
  if (runtime.altText !== '') {
    return 'Run rail mark metadata.runtime.altText must be empty because the tab label owns its accessible name';
  }
  // Margin is a claim about the BYTES, stated where the row's other byte claims live.
  const native = isObjectRecord(row.native_evidence) ? row.native_evidence : {};
  const inkBox = isObjectRecord(native.inkBox) ? native.inkBox : null;
  if (!inkBox) return 'Run rail marks must state nativeEvidence.inkBox, the measured ink box of these bytes';
  const longest = Math.max(Number(inkBox.width), Number(inkBox.height));
  if (!Number.isFinite(longest) || longest <= 0) return 'Run rail mark nativeEvidence.inkBox is not a measured box';
  const fraction = longest / RUN_RAIL_MARK_CANVAS;
  if (fraction > RUN_RAIL_MARK_INK_MAX) {
    return 'Run rail marks must reserve canvas margin: ink fills more than 95% of the canvas';
  }
  if (fraction < RUN_RAIL_MARK_INK_MIN) {
    return 'Run rail marks must carry the kit optical mass: ink fills less than 62% of the canvas';
  }
  return null;
}

const ADLECTIO_MARK_COMPONENT = 'adlectio-mark';
const ADLECTIO_MARK_SLOT = 'ui/run/sectio/adlectio-mark.png';

/** Whether this slot is the mark Expunctio prints for a formation admitted this visit. */
function adlectioMarkSlot(slot) {
  return String(slot || '') === ADLECTIO_MARK_SLOT;
}

function mainMenuMarkSlot(slot) {
  return MAIN_MENU_MARK_FITTED_SLOTS.includes(String(slot || '')) ? String(slot) : null;
}

/**
 * The typed completeness validator that lifts the main-menu marks out of `ui-kit`'s
 * bridge-only default (ADR-0560).
 *
 * What the rail actually depends on is geometry, not a runtime component: the seat draws the
 * WHOLE 64x64 canvas at a fixed size and lets the asset's own transparent padding decide how
 * big the mark reads and where it sits. So a mark that ships on another canvas, or with its
 * ink at another height, silently mis-sizes one row of a five-row column with nothing pointing
 * at the cause — which is exactly the state this ADR was opened to fix. The declared shape is
 * checked here, the pixels are enforced by `frontend/scripts/pack-menu-icons.mjs`, and the
 * owner proves them on the rail at `/studio?menuIconReview=1`.
 *
 * The kit gear slot is a member because the Battle HUD's Controls tab, the Settings General
 * section and `.icon-gear` all draw the gear from it — one mark, one contract, wherever it is
 * painted.
 */
function mainMenuMarkMediaIssue(row, projectedRuntime = null) {
  if (!mainMenuMarkSlot(row.slot)) return 'A main-menu mark requires one of its registered semantic slots';
  if (row.domain !== 'ui-kit') return 'A main-menu mark requires the ui-kit domain';
  if (row.media_type !== 'image/png') return 'A main-menu mark requires image/png';
  if (Number(row.width) !== 64 || Number(row.height) !== 64) {
    return 'A main-menu mark requires the canonical 64x64 icon canvas (ADR-0026)';
  }

  const metadata = mediaVersionMetadata(row);
  if (Number(metadata.canvas) !== 64) return 'A main-menu mark requires metadata.canvas 64';
  if (Number(metadata.inkHeight) !== fittedMarkInkHeight(row.slot)) {
    return `A fitted mark requires metadata.inkHeight ${fittedMarkInkHeight(row.slot)}, the one height ITS rail is fitted to`;
  }
  if (metadata.evenInkDimensions !== true) {
    return 'A main-menu mark requires metadata.evenInkDimensions true, so its ink centres exactly on an even canvas';
  }

  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (runtime !== null && !isObjectRecord(runtime)) return 'A main-menu mark runtime projection must be an object';
  return null;
}

/**
 * The typed completeness validator that lifts the Adlectio mark out of `ui-kit`'s bridge-only
 * default. Deliberately no fixed dimensions: the candidates are hands, cards and coins, which are
 * not one shape, and forcing a square would reintroduce the padding the ink-box rule rejects.
 */
function adlectioMarkMediaIssue(row, projectedRuntime = null) {
  if (!adlectioMarkSlot(row.slot)) return 'The Adlectio mark requires its registered semantic slot';
  if (row.domain !== 'ui-kit') return 'The Adlectio mark requires the ui-kit domain';
  if (row.media_type !== 'image/png') return 'The Adlectio mark requires image/png';
  if (!Number(row.width) || !Number(row.height)) return 'The Adlectio mark requires decoded raster dimensions';

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'The Adlectio mark requires metadata.runtime';
  const allowed = new Set(['component', 'variant', 'altText', 'nativeRole']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Adlectio mark runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== ADLECTIO_MARK_COMPONENT) {
    return `Adlectio mark metadata.runtime.component must be ${ADLECTIO_MARK_COMPONENT}`;
  }
  if (runtime.nativeRole !== ADLECTIO_MARK_COMPONENT) {
    return `Adlectio mark metadata.runtime.nativeRole must be ${ADLECTIO_MARK_COMPONENT}`;
  }
  // The words beside it say "Adlected this visit"; an alt string here would be read out twice.
  if (runtime.altText !== '') {
    return 'Adlectio mark metadata.runtime.altText must be empty because the line owns its accessible name';
  }
  const native = isObjectRecord(row.native_evidence) ? row.native_evidence : {};
  const inkBox = isObjectRecord(native.inkBox) ? native.inkBox : null;
  if (!inkBox) return 'The Adlectio mark must state nativeEvidence.inkBox, the measured ink box of these bytes';
  if (Number(inkBox.width) !== Number(row.width) || Number(inkBox.height) !== Number(row.height)) {
    return 'The Adlectio mark must be trimmed to its own ink: the measured ink box must fill the canvas';
  }
  return null;
}

/**
 * The card-price coin is the exact transparent 112px extraction of the shared
 * card coin. The surrounding component owns both the live value and accessible
 * currency label; the raster owns only the blank struck-metal body.
 */
function runCardCostCoinMediaIssue(row, projectedRuntime = null) {
  if (!runCardCostCoinSlot(row.slot)) return 'Run card cost coin requires its registered semantic slot';
  if (row.domain !== 'ui-kit') return 'Run card cost coin requires the ui-kit domain';
  if (row.role !== 'icon') return 'Run card cost coin requires the icon role';
  if (row.media_type !== 'image/png') return 'Run card cost coin requires image/png';
  if (Number(row.width) !== 112 || Number(row.height) !== 112) {
    return 'Run card cost coin must preserve the native 112x112 transparent raster';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Run card cost coin requires metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Run card cost coin runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== RUN_CARD_COST_COIN_COMPONENT) {
    return `Run card cost coin metadata.runtime.component must be ${RUN_CARD_COST_COIN_COMPONENT}`;
  }
  if (runtime.variant !== 'gold') return 'Run card cost coin variant must be gold';
  if (runtime.frameWidth !== 112 || runtime.frameHeight !== 112 || runtime.frameCount !== 1) {
    return 'Run card cost coin runtime geometry must describe one native 112x112 frame';
  }
  if (runtime.nativeRole !== RUN_CARD_COST_COIN_COMPONENT) {
    return `Run card cost coin metadata.runtime.nativeRole must be ${RUN_CARD_COST_COIN_COMPONENT}`;
  }
  if (runtime.altText !== '') {
    return 'Run card cost coin metadata.runtime.altText must be empty because the live value owns its accessible name';
  }
  return null;
}

/**
 * The mark struck on a coin that carries no price. It is His Grace's crown: the starter
 * card is the King's own, and a blank coin said only that a number was missing. The raster
 * is one transparent 64x64 glyph seated in the coin's flat striking face, so it scales with
 * the coin at every size the numeral does and never redraws the coin itself (ADR-0530).
 */
function runCardCostCrownMediaIssue(row, projectedRuntime = null) {
  if (!runCardCostCrownSlot(row.slot)) return 'Run card cost crown requires its registered semantic slot';
  if (row.domain !== 'ui-kit') return 'Run card cost crown requires the ui-kit domain';
  if (row.role !== 'icon') return 'Run card cost crown requires the icon role';
  if (row.media_type !== 'image/png') return 'Run card cost crown requires image/png';
  if (Number(row.width) !== 64 || Number(row.height) !== 64) {
    return 'Run card cost crown must preserve the native 64x64 transparent raster';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Run card cost crown requires metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Run card cost crown runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== RUN_CARD_COST_CROWN_COMPONENT) {
    return `Run card cost crown metadata.runtime.component must be ${RUN_CARD_COST_CROWN_COMPONENT}`;
  }
  if (runtime.variant !== 'crown') return 'Run card cost crown variant must be crown';
  if (runtime.frameWidth !== 64 || runtime.frameHeight !== 64 || runtime.frameCount !== 1) {
    return 'Run card cost crown runtime geometry must describe one native 64x64 frame';
  }
  if (runtime.nativeRole !== RUN_CARD_COST_CROWN_COMPONENT) {
    return `Run card cost crown metadata.runtime.nativeRole must be ${RUN_CARD_COST_CROWN_COMPONENT}`;
  }
  if (runtime.altText !== '') {
    return 'Run card cost crown metadata.runtime.altText must be empty because the coin owns its accessible name';
  }
  return null;
}

/**
 * The Cards/Chartulary gold-tier divider is one owner-selected transparent
 * PixelLab raster. The shared renderer preserves its circular cradle and end
 * cap while stretching only the undecorated middle rail span (ADR-0506).
 */
function runCardGoldTierDividerMediaIssue(row, projectedRuntime = null) {
  if (!runCardGoldTierDividerSlot(row.slot)) return 'Run card gold-tier dividers require their registered semantic slot';
  if (row.domain !== 'ui-kit') return 'Run card gold-tier dividers require the ui-kit domain';
  if (row.role !== 'divider') return 'Run card gold-tier dividers require the divider role';
  if (row.media_type !== 'image/png') return 'Run card gold-tier dividers require image/png';
  if (Number(row.width) !== 688 || Number(row.height) !== 384) {
    return 'Run card gold-tier dividers must preserve the approved 688x384 transparent raster';
  }
  if (normalizedSha(row.blob_sha256) !== RUN_CARD_GOLD_TIER_DIVIDER_SHA256) {
    return 'ADR-0506 authorizes only the exact owner-approved gold-tier divider bytes';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Run card gold-tier dividers require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole', 'slice',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Run card gold-tier divider runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== RUN_CARD_GOLD_TIER_DIVIDER_COMPONENT) {
    return `Run card gold-tier divider metadata.runtime.component must be ${RUN_CARD_GOLD_TIER_DIVIDER_COMPONENT}`;
  }
  if (runtime.variant !== 'open-rail') return 'Run card gold-tier divider variant must be open-rail';
  if (runtime.frameWidth !== 688 || runtime.frameHeight !== 384 || runtime.frameCount !== 1) {
    return 'Run card gold-tier divider runtime geometry must describe one 688x384 source frame';
  }
  if (runtime.nativeRole !== RUN_CARD_GOLD_TIER_DIVIDER_COMPONENT) {
    return `Run card gold-tier divider metadata.runtime.nativeRole must be ${RUN_CARD_GOLD_TIER_DIVIDER_COMPONENT}`;
  }
  if (runtime.altText !== '') {
    return 'Run card gold-tier divider metadata.runtime.altText must be empty because the live coin owns the heading name';
  }
  if (!isObjectRecord(runtime.slice) || ['top', 'right', 'bottom', 'left'].some(
    (edge) => runtime.slice[edge] !== RUN_CARD_GOLD_TIER_DIVIDER_SLICE[edge],
  )) return 'Run card gold-tier divider runtime slice must preserve the approved cradle, rails, and end cap';
  return null;
}

function runCardGoldTierDividerOwnerProofIssue(row, proof, surfaceUrl = null) {
  if (!runCardGoldTierDividerSlot(row.slot)) return 'Run card gold-tier divider proof requires the registered semantic slot';
  if (!isObjectRecord(proof) || proof.schema !== RUN_CARD_GOLD_TIER_DIVIDER_PROOF_SCHEMA) {
    return `Run card gold-tier divider review requires ${RUN_CARD_GOLD_TIER_DIVIDER_PROOF_SCHEMA}`;
  }
  if (
    proof.renderer !== RUN_CARD_GOLD_TIER_DIVIDER_PROOF_RENDERER
    || proof.canonicalScale !== 1 || proof.spatialResampling !== true
    || proof.frameWidth !== 688 || proof.frameHeight !== 384
    || proof.drawHeight !== RUN_CARD_GOLD_TIER_DIVIDER_DRAW.height
    || proof.leftCapWidth !== RUN_CARD_GOLD_TIER_DIVIDER_DRAW.left
    || proof.rightCapWidth !== RUN_CARD_GOLD_TIER_DIVIDER_DRAW.right
    || !isObjectRecord(proof.slice)
    || ['top', 'right', 'bottom', 'left'].some(
      (edge) => proof.slice[edge] !== RUN_CARD_GOLD_TIER_DIVIDER_SLICE[edge],
    )
  ) return 'Run card gold-tier divider proof does not match the exact shared three-slice renderer';
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'Run card gold-tier divider proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'Run card gold-tier divider proof surfaceUrl is invalid'; }
  if (
    parsedSurface.pathname !== '/enchiridion/cards'
    || parsedSurface.searchParams.get('goldTierDividerReview') !== String(row.id)
  ) return 'Run card gold-tier divider proof must identify its exact candidate in the real Cards gallery';
  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (!candidateSha256 || !Array.isArray(proof.selectedCandidates) || proof.selectedCandidates.length !== 1) {
    return 'Run card gold-tier divider proof must identify exactly one candidate';
  }
  const selected = proof.selectedCandidates[0];
  if (
    !isObjectRecord(selected) || selected.slot !== row.slot || selected.versionId !== String(row.id)
    || normalizedSha(selected.sha256) !== candidateSha256
  ) return 'Run card gold-tier divider proof does not identify the reviewed candidate bytes';
  if (!Array.isArray(proof.slotSnapshots) || proof.slotSnapshots.length !== 1) {
    return 'Run card gold-tier divider proof must snapshot exactly one semantic slot';
  }
  const snapshot = proof.slotSnapshots[0];
  if (!isObjectRecord(snapshot) || snapshot.slot !== row.slot) {
    return 'Run card gold-tier divider proof slot snapshot is invalid';
  }
  return null;
}

/**
 * The universal Run-card back is one native complete card, not a frame fragment
 * or a face-specific skin. Its closed slot keeps every Run consumer on the same
 * semantic object while a later player preference can choose among separately
 * accepted backs without allowing arbitrary ui-kit media into this role.
 */
function runCardBackMediaIssue(row, projectedRuntime = null) {
  const backId = runCardBackSlot(row.slot);
  if (!backId) return 'Run card backs require a registered card-back semantic slot';
  if (row.domain !== 'ui-kit') return 'Run card backs require the ui-kit domain';
  if (row.role !== 'card-back') return 'Run card backs require the card-back role';
  if (row.media_type !== 'image/png') return 'Run card backs require image/png';
  if (Number(row.width) !== 1060 || Number(row.height) !== 1484) {
    return 'Run card backs must preserve the native 1060x1484 5:7 raster';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Run card backs require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Run card-back runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== RUN_CARD_BACK_COMPONENT) {
    return `Run card-back metadata.runtime.component must be ${RUN_CARD_BACK_COMPONENT}`;
  }
  // Same rule the other slot families use: the variant names its own slot, so a version can never
  // be accepted onto a back it does not claim to be.
  if (runtime.variant !== backId) return 'Run card-back variant must match its semantic slot id';
  if (runtime.frameWidth !== 1060 || runtime.frameHeight !== 1484 || runtime.frameCount !== 1) {
    return 'Run card-back runtime geometry must describe one native 1060x1484 frame';
  }
  if (runtime.nativeRole !== RUN_CARD_BACK_COMPONENT) {
    return `Run card-back metadata.runtime.nativeRole must be ${RUN_CARD_BACK_COMPONENT}`;
  }
  if (runtime.altText !== '') {
    return 'Run card-back metadata.runtime.altText must be empty because the face-down card owns its accessible name';
  }
  return null;
}

function runCardBackOwnerProofIssue(row, proof, surfaceUrl = null) {
  if (!runCardBackSlot(row.slot)) return 'Run card-back proof requires a registered card-back semantic slot';
  if (!isObjectRecord(proof) || proof.schema !== RUN_CARD_BACK_PROOF_SCHEMA) {
    return `Run card-back review requires ${RUN_CARD_BACK_PROOF_SCHEMA}`;
  }
  if (proof.renderer !== RUN_CARD_BACK_PROOF_RENDERER) {
    return 'Run card-back proof does not name Card Layout and the shared RunCardBack renderer';
  }
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'Run card-back proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'Run card-back proof surfaceUrl is invalid'; }
  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (
    parsedSurface.pathname !== '/studio'
    || parsedSurface.searchParams.get('mode') !== 'viewer'
    || parsedSurface.searchParams.get('vk') !== 'cardlayout'
    || parsedSurface.searchParams.get('cardSide') !== 'back'
    || normalizedSha(parsedSurface.searchParams.get('backCandidate')) !== candidateSha256
  ) return 'Run card-back proof must identify the exact Card Layout back candidate';
  if (
    proof.canonicalScale !== 1 || proof.assetLocalScale !== 1 || proof.spatialResampling !== false
    || !isObjectRecord(proof.decodedNativeRaster)
    || proof.decodedNativeRaster.width !== 1060 || proof.decodedNativeRaster.height !== 1484
  ) return 'Run card-back proof must cover the decoded native 1060x1484 pixels at exact scale';
  if (!candidateSha256 || !Array.isArray(proof.selectedCandidates) || proof.selectedCandidates.length !== 1) {
    return 'Run card-back proof must identify exactly one candidate';
  }
  const selected = proof.selectedCandidates[0];
  if (
    !isObjectRecord(selected) || selected.slot !== row.slot || selected.versionId !== String(row.id)
    || normalizedSha(selected.sha256) !== candidateSha256
  ) return 'Run card-back proof does not identify the reviewed candidate bytes';
  if (!Array.isArray(proof.slotSnapshots) || proof.slotSnapshots.length !== 1) {
    return 'Run card-back proof must snapshot the universal semantic slot';
  }
  if (!isObjectRecord(proof.slotSnapshots[0]) || proof.slotSnapshots[0].slot !== row.slot) {
    return 'Run card-back proof slot snapshot is invalid';
  }
  return null;
}

function runCardRarityFrameSlot(slot) {
  return RUN_CARD_RARITY_FRAME_BY_SLOT[String(slot || '')] ?? null;
}

/**
 * Rarity frames are reviewed on the shared Card Layout face, where the accepted
 * Common frame and both candidate colors remain visible together. The proof is
 * deliberately byte- and slot-specific: approval of one light-blue or gold artwork-bezel
 * raster cannot authorize a later regeneration or a different frame family.
 */
function runCardRarityFrameOwnerProofIssue(row, proof, surfaceUrl = null) {
  const rarity = runCardRarityFrameSlot(row.slot);
  if (!rarity) return 'Run card rarity-frame proof requires a registered Standard rarity slot';
  if (!isObjectRecord(proof) || proof.schema !== RUN_CARD_RARITY_FRAME_PROOF_SCHEMA) {
    return `Run card rarity-frame review requires ${RUN_CARD_RARITY_FRAME_PROOF_SCHEMA}`;
  }
  if (proof.renderer !== RUN_CARD_RARITY_FRAME_PROOF_RENDERER) {
    return 'Run card rarity-frame proof does not name the shared Card Layout face renderer';
  }
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'Run card rarity-frame proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'Run card rarity-frame proof surfaceUrl is invalid'; }
  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (
    parsedSurface.pathname !== '/studio'
    || parsedSurface.searchParams.get('mode') !== 'viewer'
    || parsedSurface.searchParams.get('vk') !== 'cardlayout'
    || parsedSurface.searchParams.get('rarityStudy') !== '1'
    || normalizedSha(parsedSurface.searchParams.get(`${rarity}Candidate`)) !== candidateSha256
  ) return 'Run card rarity-frame proof must identify the exact Card Layout rarity candidate';
  if (
    proof.rarity !== rarity || proof.frameType !== 'standard'
    || proof.rarityAffects !== 'artwork-bezel-only' || proof.outerFrameTreatment !== 'standard-original'
  ) return 'Run card rarity-frame proof must recolor only the Standard artwork bezel';
  if (
    proof.canonicalScale !== 1 || proof.assetLocalScale !== 1 || proof.spatialResampling !== false
    || !isObjectRecord(proof.decodedNativeRaster)
    || proof.decodedNativeRaster.width !== 1060 || proof.decodedNativeRaster.height !== 1484
  ) return 'Run card rarity-frame proof must cover the decoded native 1060x1484 pixels at exact scale';
  if (!candidateSha256 || !Array.isArray(proof.selectedCandidates) || proof.selectedCandidates.length !== 1) {
    return 'Run card rarity-frame proof must identify exactly one candidate';
  }
  const selected = proof.selectedCandidates[0];
  if (
    !isObjectRecord(selected) || selected.slot !== row.slot || selected.versionId !== String(row.id)
    || normalizedSha(selected.sha256) !== candidateSha256
  ) return 'Run card rarity-frame proof does not identify the reviewed candidate bytes';
  if (!Array.isArray(proof.slotSnapshots) || proof.slotSnapshots.length !== 1) {
    return 'Run card rarity-frame proof must snapshot the candidate semantic slot';
  }
  if (!isObjectRecord(proof.slotSnapshots[0]) || proof.slotSnapshots[0].slot !== row.slot) {
    return 'Run card rarity-frame proof slot snapshot is invalid';
  }
  return null;
}

/**
 * Domain-owned runtime projection for the native icons that name one closed game
 * idea: a unit condition, the card property that grants it, or a repeatable Run
 * position. Their exact semantic slots are closed so an arbitrary ui-kit
 * candidate cannot become runtime UI.
 */
function gameConditionIconMediaIssue(row, projectedRuntime = null) {
  const contract = gameConditionIconSlot(row.slot);
  if (!contract) return 'game condition icons require a registered semantic slot';
  if (row.domain !== 'ui-kit') return 'game condition icons require the ui-kit domain';
  if (row.role !== 'icon') return 'game condition icons require the icon role';
  if (row.media_type !== 'image/png') return 'game condition icons require image/png';
  // Run-position, action and Event Log marks sit unframed beside a label or a line of
  // type and ship trimmed to their own ink; the established unit-ability and
  // card-property icons keep their full frame.
  const trimmed = contract.component === RUN_PROGRESS_ICON_COMPONENT
    || contract.component === RUN_ACTION_ICON_COMPONENT
    || contract.component === BATTLE_LOG_MARK_COMPONENT;
  const rasterIssue = trimmed
    ? trimmedIconRasterIssue(row, 'Run position icons')
    : (Number(row.width) !== 64 || Number(row.height) !== 64
      ? 'game condition icons must be native 64x64 rasters' : null);
  if (rasterIssue) return rasterIssue;

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'game condition icons require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `game condition icon runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== contract.component) {
    return `game condition icon metadata.runtime.component must be ${contract.component}`;
  }
  if (runtime.variant !== contract.variant) return 'game condition icon variant must match its semantic slot';
  const geometryIssue = trimmed
    ? trimmedIconRuntimeGeometryIssue(row, runtime, 'Run position icon')
    : (runtime.frameWidth !== 64 || runtime.frameHeight !== 64 || runtime.frameCount !== 1
      ? 'game condition icon runtime geometry must describe one native 64x64 frame' : null);
  if (geometryIssue) return geometryIssue;
  if (runtime.nativeRole !== contract.component) {
    return `game condition icon metadata.runtime.nativeRole must be ${contract.component}`;
  }
  if (runtime.altText !== '') {
    return 'game condition icon metadata.runtime.altText must be empty because the adjacent label owns its accessible name';
  }
  return null;
}

/**
 * Closed production contract for the four decorative materials behind the
 * Enchiridion's card-type rows. The semantic slot fixes both the card property
 * and native tile geometry so arbitrary ui-kit media cannot enter this seat.
 */
function cardTypeRowTextureMediaIssue(row, projectedRuntime = null) {
  const contract = cardTypeRowTextureSlot(row.slot);
  if (!contract) return 'card-type row textures require a registered semantic slot';
  if (row.domain !== 'ui-kit') return 'card-type row textures require the ui-kit domain';
  if (row.role !== 'media') return 'card-type row textures require the media role';
  if (row.media_type !== 'image/png') return 'card-type row textures require image/png';
  if (Number(row.width) !== contract.width || Number(row.height) !== contract.height) {
    return `card-type row texture geometry must be native ${contract.width}x${contract.height}`;
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'card-type row textures require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'family', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `card-type row texture runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== CARD_TYPE_ROW_TEXTURE_COMPONENT) {
    return `card-type row texture metadata.runtime.component must be ${CARD_TYPE_ROW_TEXTURE_COMPONENT}`;
  }
  if (runtime.nativeRole !== CARD_TYPE_ROW_TEXTURE_COMPONENT) {
    return `card-type row texture metadata.runtime.nativeRole must be ${CARD_TYPE_ROW_TEXTURE_COMPONENT}`;
  }
  if (runtime.variant !== contract.variant) return 'card-type row texture variant must match its semantic slot';
  if (runtime.family !== 'card-type-row-textures') return 'card-type row texture family must identify the complete material set';
  if (
    runtime.frameWidth !== contract.width || runtime.frameHeight !== contract.height
    || runtime.frameCount !== 1
  ) return 'card-type row texture runtime geometry must describe its one native tile';
  if (runtime.altText !== '') {
    return 'card-type row texture metadata.runtime.altText must be empty because the row label owns its accessible name';
  }
  return null;
}

function cardTypeRowTextureAcceptanceGroupIssue(rows, contract) {
  if (!Array.isArray(rows) || !contract || contract.groupId !== CARD_TYPE_ROW_TEXTURE_GROUP_ID) {
    return 'card-type row textures require their registered atomic acceptance group';
  }
  const requiredSlots = Array.isArray(contract.requiredSlots) ? [...contract.requiredSlots].sort() : [];
  if (JSON.stringify(requiredSlots) !== JSON.stringify(CARD_TYPE_ROW_TEXTURE_REQUIRED_SLOTS)) {
    return 'card-type row texture acceptance must contain all four semantic slots';
  }
  const rowSlots = rows.map((row) => row?.slot).sort();
  if (JSON.stringify(rowSlots) !== JSON.stringify(CARD_TYPE_ROW_TEXTURE_REQUIRED_SLOTS)) {
    return 'card-type row texture acceptance rows must match all four semantic slots';
  }
  return null;
}

/** Closed production contract for the Level Editor's actual 20px Brush seat. */
function levelEditorBrushIconMediaIssue(row, projectedRuntime = null) {
  if (!levelEditorBrushIconSlot(row.slot)) return 'Level Editor brush icons require their registered semantic slot';
  if (row.domain !== 'ui-kit') return 'Level Editor brush icons require the ui-kit domain';
  if (row.role !== 'icon') return 'Level Editor brush icons require the icon role';
  if (row.media_type !== 'image/png') return 'Level Editor brush icons require image/png';
  const evidence = isObjectRecord(row.native_evidence) ? row.native_evidence : {};
  const scaledOption01 = evidence.schema === LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SCHEMA;
  if (scaledOption01) {
    if (
      normalizedSha(row.blob_sha256) !== LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SHA256
      || Number(row.width) !== 64 || Number(row.height) !== 64
    ) return 'The ADR-0337 Brush exception is restricted to the exact owner-selected 64px Option 01 bytes';
  } else if (Number(row.width) !== 18 || Number(row.height) !== 18) {
    return 'Level Editor brush icons must be native 18x18 rasters unless they are the exact ADR-0337 Option 01 exception';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Level Editor brush icons require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Level Editor brush runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== LEVEL_EDITOR_BRUSH_ICON_COMPONENT) {
    return `Level Editor brush metadata.runtime.component must be ${LEVEL_EDITOR_BRUSH_ICON_COMPONENT}`;
  }
  if (runtime.variant !== 'brush') return 'Level Editor brush runtime variant must be brush';
  const expectedFrame = scaledOption01 ? 64 : 18;
  if (runtime.frameWidth !== expectedFrame || runtime.frameHeight !== expectedFrame || runtime.frameCount !== 1) {
    return `Level Editor brush runtime geometry must describe one ${expectedFrame}x${expectedFrame} frame`;
  }
  if (runtime.nativeRole !== LEVEL_EDITOR_BRUSH_ICON_COMPONENT) {
    return `Level Editor brush metadata.runtime.nativeRole must be ${LEVEL_EDITOR_BRUSH_ICON_COMPONENT}`;
  }
  if (runtime.altText !== '') {
    return 'Level Editor brush metadata.runtime.altText must be empty because the tool button owns its accessible name';
  }

  if (scaledOption01) {
    if (
      evidence.decision !== 'ADR-0337'
      || evidence.status !== 'owner-approved-production-exception'
      || evidence.native1x !== false || evidence.spatialResampling !== true
      || Number(evidence.sourceWidth) !== 64 || Number(evidence.sourceHeight) !== 64
      || normalizedSha(evidence.sourceSha256) !== LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SHA256
      || Number(evidence.drawWidth) !== 20 || Number(evidence.drawHeight) !== 20
      || evidence.transform !== 'css-background-size-contain-64-to-20'
    ) return 'The ADR-0337 Brush exception evidence is incomplete';
    return null;
  }
  if (evidence.schema !== 'level-editor-brush-icon-native-v1') {
    return 'Level Editor brush native evidence requires level-editor-brush-icon-native-v1';
  }
  if (
    evidence.productionRole !== 'inner-brush-tool'
    || Number(evidence.drawWidth) !== 18 || Number(evidence.drawHeight) !== 18
    || Number(evidence.generatorOutputWidth) !== 32 || Number(evidence.generatorOutputHeight) !== 32
    || evidence.transform !== 'center-crop-18x18-no-spatial-resampling'
  ) return 'Level Editor brush native evidence does not match its exact 18px production role';
  const bounds = evidence.opaqueBounds;
  if (
    !isObjectRecord(bounds)
    || !Number.isSafeInteger(bounds.x) || !Number.isSafeInteger(bounds.y)
    || !Number.isSafeInteger(bounds.width) || !Number.isSafeInteger(bounds.height)
    || bounds.x < 2 || bounds.y < 2 || bounds.width < 1 || bounds.height < 1
    || bounds.x + bounds.width > 16 || bounds.y + bounds.height > 16
  ) return 'Level Editor brush opaque bounds must preserve a two-pixel transparent gutter on every edge';
  if (
    evidence.edgeAlphaMax !== 0 || !Number.isSafeInteger(evidence.opaquePixelCount)
    || evidence.opaquePixelCount < 16 || evidence.opaquePixelCount > 256
  ) return 'Level Editor brush alpha evidence is incomplete or implausible';
  return null;
}

function levelEditorBrushIconOwnerProofIssue(row, proof, surfaceUrl = null) {
  if (!levelEditorBrushIconSlot(row.slot)) return 'Level Editor brush proof requires the registered semantic slot';
  if (!isObjectRecord(proof) || proof.schema !== LEVEL_EDITOR_BRUSH_ICON_PROOF_SCHEMA) {
    return `Level Editor brush review requires ${LEVEL_EDITOR_BRUSH_ICON_PROOF_SCHEMA}`;
  }
  const scaledOption01 = row.native_evidence?.schema === LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SCHEMA;
  const expected = scaledOption01
    ? { assetLocalScale: 0.3125, spatialResampling: true, frame: 64, draw: 20 }
    : { assetLocalScale: 1, spatialResampling: false, frame: 18, draw: 18 };
  if (
    proof.renderer !== LEVEL_EDITOR_BRUSH_ICON_PROOF_RENDERER
    || proof.canonicalScale !== 1 || proof.assetLocalScale !== expected.assetLocalScale
    || proof.spatialResampling !== expected.spatialResampling
    || proof.frameWidth !== expected.frame || proof.frameHeight !== expected.frame
    || proof.drawWidth !== expected.draw || proof.drawHeight !== expected.draw
  ) return 'Level Editor brush proof does not match the exact reviewed tool renderer';
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'Level Editor brush proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'Level Editor brush proof surfaceUrl is invalid'; }
  if (
    parsedSurface.pathname !== '/editor/level'
    || parsedSurface.searchParams.get('brushIconReviewVersion') !== String(row.id)
  ) return 'Level Editor brush proof must identify its exact candidate in the real Level Editor';
  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (!candidateSha256 || !Array.isArray(proof.selectedCandidates) || proof.selectedCandidates.length !== 1) {
    return 'Level Editor brush proof must identify exactly one candidate';
  }
  const selected = proof.selectedCandidates[0];
  if (
    !isObjectRecord(selected) || selected.slot !== row.slot || selected.versionId !== String(row.id)
    || normalizedSha(selected.sha256) !== candidateSha256
  ) return 'Level Editor brush proof does not identify the reviewed candidate bytes';
  if (!Array.isArray(proof.slotSnapshots) || proof.slotSnapshots.length !== 1) {
    return 'Level Editor brush proof must snapshot exactly one semantic slot';
  }
  const snapshot = proof.slotSnapshots[0];
  if (!isObjectRecord(snapshot) || snapshot.slot !== row.slot) {
    return 'Level Editor brush proof slot snapshot is invalid';
  }
  const bounds = row.native_evidence?.opaqueBounds;
  if (
    !isObjectRecord(bounds) || !isObjectRecord(proof.opaqueBounds)
    || proof.opaqueBounds.x !== bounds.x || proof.opaqueBounds.y !== bounds.y
    || proof.opaqueBounds.width !== bounds.width || proof.opaqueBounds.height !== bounds.height
  ) {
    return 'Level Editor brush proof opaque bounds do not match the validated candidate evidence';
  }
  return null;
}

/**
 * Domain-owned runtime projection for one perimeter wall raster. ADR-0086 makes the
 * full-height frame the only wall geometry, so the frame size is the contract: a wall
 * candidate that does not carry it cannot seat on the board's back edges at all.
 */
function wallMaterialMediaIssue(row, projectedRuntime = null) {
  const wall = wallMaterialSlot(row.slot);
  if (!wall) return 'wall slots must match tiles/feature/wall-<material>-<1|8|9|thumb>.png';
  if (row.domain !== 'terrain') return 'wall materials require the terrain domain';
  if (row.media_type !== 'image/png') return 'wall materials require image/png';
  if (wall.thumb) {
    if (row.role !== 'review') return 'wall material thumbnails require the review role';
    const width = Number(row.width);
    const height = Number(row.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width !== height) {
      return 'wall material thumbnails must be square';
    }
    if (width < 1 || width > WALL_MATERIAL_THUMB_MAX) {
      return `wall material thumbnails must be 1-${WALL_MATERIAL_THUMB_MAX}px square`;
    }
  } else {
    if (row.role !== 'media') return 'wall material frames require the terrain media role';
    if (Number(row.width) !== WALL_MATERIAL_FRAME_WIDTH || Number(row.height) !== WALL_MATERIAL_FRAME_HEIGHT) {
      return `ADR-0086 wall frames must be native ${WALL_MATERIAL_FRAME_WIDTH}x${WALL_MATERIAL_FRAME_HEIGHT}`;
    }
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime) || !Object.keys(runtime).length) return null;
  const allowed = new Set(['component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `wall material runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== undefined && runtime.component !== WALL_MATERIAL_COMPONENT) {
    return `wall material metadata.runtime.component must be ${WALL_MATERIAL_COMPONENT}`;
  }
  if (runtime.variant !== undefined && runtime.variant !== wall.material) {
    return 'wall material metadata.runtime.variant must name its own material';
  }
  if (runtime.frameCount !== undefined && runtime.frameCount !== 1) {
    return 'wall material frames are single-frame rasters';
  }
  if (runtime.frameWidth !== undefined && runtime.frameWidth !== Number(row.width)) {
    return 'wall material runtime frameWidth does not match uploaded geometry';
  }
  if (runtime.frameHeight !== undefined && runtime.frameHeight !== Number(row.height)) {
    return 'wall material runtime frameHeight does not match uploaded geometry';
  }
  return null;
}

/**
 * Owner review for a wall candidate is only meaningful mounted on the real board renderer at
 * canonical 1x, seated against live terrain. One proof covers a whole wall batch, so each
 * candidate is checked against its OWN slot entry rather than a single-element proof.
 */
function wallMaterialOwnerProofIssue(row, proof, surfaceUrl = null) {
  const wall = wallMaterialSlot(row.slot);
  if (!wall) return 'wall material proof requires a registered wall slot';
  if (!isObjectRecord(proof) || proof.schema !== WALL_MATERIAL_PROOF_SCHEMA) {
    return `wall material review requires ${WALL_MATERIAL_PROOF_SCHEMA}`;
  }
  if (
    proof.renderer !== WALL_MATERIAL_PROOF_RENDERER
    || proof.canonicalScale !== 1 || proof.assetLocalScale !== 1
    || proof.spatialResampling !== false || proof.deterministicProof !== true
  ) return 'wall material proof must cover exact canonical 1x pixels without resampling';
  if (
    proof.frameWidth !== WALL_MATERIAL_FRAME_WIDTH || proof.frameHeight !== WALL_MATERIAL_FRAME_HEIGHT
  ) return 'wall material proof does not mount the ADR-0086 full-height frame geometry';
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'wall material proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'wall material proof surfaceUrl is invalid'; }
  if (parsedSurface.pathname !== '/studio') {
    return 'wall material proof must come from the game-owned Studio wall surface';
  }
  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (!candidateSha256) return 'wall material proof requires uploaded candidate bytes';
  if (!Array.isArray(proof.selectedCandidates) || !Array.isArray(proof.slotSnapshots)) {
    return 'wall material proof is incomplete';
  }
  const selected = proof.selectedCandidates.filter((item) => isObjectRecord(item) && item.slot === row.slot);
  if (
    selected.length !== 1 || selected[0].versionId !== String(row.id)
    || normalizedSha(selected[0].sha256) !== candidateSha256
  ) return 'wall material proof does not identify the reviewed candidate bytes';
  const snapshots = proof.slotSnapshots.filter((item) => isObjectRecord(item) && item.slot === row.slot);
  if (snapshots.length !== 1) return 'wall material proof must snapshot this wall slot exactly once';
  // A wall face is only judged against the walls it will stand beside, so every frame in the
  // batch has to be mounted on the same board — not reviewed one sprite at a time.
  if (!wall.thumb && !proof.mountedSlots?.includes?.(row.slot)) {
    return 'wall material proof must mount this frame on the reviewed board';
  }
  return null;
}

/**
 * Domain-owned runtime projection for one authored one-shot take. Sound-set
 * labels, gains, and assignments remain in the DB-owned SFX profile.
 */
function sfxSampleMediaIssue(row, projectedRuntime = null) {
  const slot = sfxSampleSlot(row.slot);
  if (!slot) return 'SFX sample slots must match sfx/<sound-set>/v<n>.<supported-audio-format>';
  if (row.domain !== 'sfx') return 'SFX samples require the sfx domain';
  if (row.role !== 'audio') return 'SFX samples require the audio role';
  if (row.media_type !== SFX_MEDIA_TYPE_BY_EXTENSION[slot.extension]) {
    return 'SFX sample media type must match its slot extension';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'SFX samples require metadata.runtime';
  const allowed = new Set(['component', 'variant', 'state', 'durationMs', 'loop']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `SFX sample runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== SFX_SAMPLE_COMPONENT) {
    return `SFX sample metadata.runtime.component must be ${SFX_SAMPLE_COMPONENT}`;
  }
  if (runtime.variant !== slot.soundSetKey) return 'SFX sample variant must match its sound-set slot key';
  if (runtime.state !== 'one-shot') return 'SFX sample runtime state must be one-shot';
  if (!Number.isSafeInteger(runtime.durationMs) || runtime.durationMs < 1 || runtime.durationMs > 3_600_000) {
    return 'SFX sample runtime durationMs must be a positive bounded integer';
  }
  if (runtime.loop !== false) return 'SFX one-shot runtime loop must be false';
  return null;
}

/**
 * Closed production projection for the exact command-archive artwork approved
 * under ADR-0336. The source PNG remains native and unresampled; the named
 * exception is the ShellWorkspace cover presentation, not rewritten pixels.
 */
function strategikonBackgroundMediaIssue(row, projectedRuntime = null) {
  if (!strategikonBackgroundSlot(row.slot)) return 'Strategikon background requires its canonical semantic slot';
  if (row.domain !== 'ui-kit') return 'Strategikon background requires the ui-kit domain';
  if (row.role !== 'background') return 'Strategikon background requires the background role';
  if (row.media_type !== 'image/png') return 'Strategikon background requires image/png';
  if (Number(row.width) !== 688 || Number(row.height) !== 384) {
    return 'Strategikon background must retain its approved 688x384 source raster';
  }
  if (normalizedSha(row.blob_sha256) !== STRATEGIKON_BACKGROUND_SHA256) {
    return 'ADR-0336 authorizes only the exact owner-approved Strategikon background bytes';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Strategikon background requires metadata.runtime';
  const allowed = new Set(['component', 'variant', 'state', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Strategikon background runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== STRATEGIKON_BACKGROUND_COMPONENT) {
    return `Strategikon background metadata.runtime.component must be ${STRATEGIKON_BACKGROUND_COMPONENT}`;
  }
  if (runtime.variant !== 'command-archive') return 'Strategikon background runtime variant must be command-archive';
  if (runtime.state !== 'owner-approved-cover-scaling-exception') {
    return 'Strategikon background runtime state must name the owner-approved cover-scaling exception';
  }
  if (runtime.frameWidth !== 688 || runtime.frameHeight !== 384 || runtime.frameCount !== 1) {
    return 'Strategikon background runtime frame geometry must match the approved PNG';
  }
  if (runtime.nativeRole !== STRATEGIKON_BACKGROUND_COMPONENT) {
    return `Strategikon background nativeRole must be ${STRATEGIKON_BACKGROUND_COMPONENT}`;
  }
  if (runtime.altText !== '') return 'decorative Strategikon background runtime altText must be empty';
  return null;
}

/**
 * Domain-owned runtime projection for one workspace's full-screen backdrop. The art is
 * decorative — it sits behind the workspace's own panels and carries no text — so the
 * contract is the registered workspace id plus frame geometry that matches the uploaded
 * raster, which stops a re-crop from silently changing what the screen paints.
 */
/**
 * The surface the Conflict's lipsanon offers are laid out on (Bona Vacantia). Not a workspace
 * background: that covers the whole screen, while this is ONE object sitting on it, sized
 * against the lipsanon row rather than the viewport, with soft alpha edges so the backdrop
 * reads continuously past it. It therefore carries its own typed contract instead of
 * borrowing the full-bleed one.
 */
function runLipsanonMatMediaIssue(row, projectedRuntime = null) {
  if (!runLipsanonMatSlot(row.slot)) return `run lipsanon mats must be ${LIPSANON_MAT_SLOT}`;
  if (row.domain !== 'ui-kit') return 'run lipsanon mats require the ui-kit domain';
  if (row.role !== 'background') return 'run lipsanon mats require the background role';
  if (row.media_type !== 'image/png') return 'run lipsanon mats require image/png';
  const width = Number(row.width);
  const height = Number(row.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    return 'run lipsanon mats require decoded raster dimensions';
  }
  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'run lipsanon mats require metadata.runtime';
  const allowed = new Set(['component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `run lipsanon mat runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== LIPSANON_MAT_COMPONENT) {
    return `run lipsanon mat metadata.runtime.component must be ${LIPSANON_MAT_COMPONENT}`;
  }
  if (runtime.nativeRole !== LIPSANON_MAT_COMPONENT) {
    return `run lipsanon mat metadata.runtime.nativeRole must be ${LIPSANON_MAT_COMPONENT}`;
  }
  if (typeof runtime.variant !== 'string' || !runtime.variant) return 'run lipsanon mat runtime variant is required';
  if (runtime.frameWidth !== width || runtime.frameHeight !== height || runtime.frameCount !== 1) {
    return 'run lipsanon mat runtime frame geometry must match the uploaded raster';
  }
  if (runtime.altText !== '') return 'decorative run lipsanon mat runtime altText must be empty';
  return null;
}

function workspaceBackgroundMediaIssue(row, projectedRuntime = null) {
  const workspaceId = workspaceBackgroundSlotId(row.slot);
  if (!workspaceId) {
    return `workspace backgrounds must match ui/workspaces/<workspace-id>/background.png for a registered workspace (${WORKSPACE_BACKGROUND_IDS.join(', ')})`;
  }
  if (row.domain !== 'ui-kit') return 'workspace backgrounds require the ui-kit domain';
  if (row.role !== 'background') return 'workspace backgrounds require the background role';
  if (row.media_type !== 'image/png') return 'workspace backgrounds require image/png';
  const width = Number(row.width);
  const height = Number(row.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    return 'workspace backgrounds require decoded raster dimensions';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'workspace backgrounds require metadata.runtime';
  const allowed = new Set(['component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `workspace background runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== WORKSPACE_BACKGROUND_COMPONENT) {
    return `workspace background metadata.runtime.component must be ${WORKSPACE_BACKGROUND_COMPONENT}`;
  }
  if (runtime.nativeRole !== WORKSPACE_BACKGROUND_COMPONENT) {
    return `workspace background metadata.runtime.nativeRole must be ${WORKSPACE_BACKGROUND_COMPONENT}`;
  }
  if (runtime.variant !== workspaceId) return 'workspace background runtime variant must match its semantic slot id';
  if (runtime.frameWidth !== width || runtime.frameHeight !== height || runtime.frameCount !== 1) {
    return 'workspace background runtime frame geometry must match the uploaded raster';
  }
  if (runtime.altText !== '') return 'decorative workspace background runtime altText must be empty';
  return null;
}

function strategikonBackgroundOwnerProofIssue(row, proof, surfaceUrl = null) {
  if (!strategikonBackgroundSlot(row.slot)) return 'Strategikon background proof requires its canonical semantic slot';
  if (!isObjectRecord(proof) || proof.schema !== STRATEGIKON_BACKGROUND_PROOF_SCHEMA) {
    return `Strategikon background review requires ${STRATEGIKON_BACKGROUND_PROOF_SCHEMA}`;
  }
  if (
    proof.renderer !== STRATEGIKON_BACKGROUND_PROOF_RENDERER
    || proof.decision !== 'ADR-0336'
    || proof.coverScalingApproved !== true
    || proof.objectFit !== 'cover'
    || proof.imageRendering !== 'pixelated'
    || proof.opacity !== 0.68
  ) return 'Strategikon background proof must record the exact owner-approved cover presentation';
  if (
    !isObjectRecord(proof.sourceRaster)
    || proof.sourceRaster.width !== 688 || proof.sourceRaster.height !== 384
    || normalizedSha(proof.sourceRaster.sha256) !== STRATEGIKON_BACKGROUND_SHA256
  ) return 'Strategikon background proof does not identify the approved source raster';
  if (
    !isObjectRecord(proof.reviewViewport)
    || proof.reviewViewport.width !== 1440 || proof.reviewViewport.height !== 900
  ) return 'Strategikon background proof must record the approved 1440x900 review viewport';
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'Strategikon background proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'Strategikon background proof surfaceUrl is invalid'; }
  if (
    parsedSurface.pathname !== '/play/strategikon/enchiridion/units'
    || parsedSurface.searchParams.get('strategikonBackgroundReview') !== '1'
    || parsedSurface.searchParams.get('campaignId') !== 'off-c-crown-valoria'
    || parsedSurface.searchParams.get('levelId') !== 'off-l-hold-bridge'
  ) return 'Strategikon background proof must identify the exact reviewed gameplay surface';

  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (!candidateSha256 || !Array.isArray(proof.selectedCandidates) || proof.selectedCandidates.length !== 1) {
    return 'Strategikon background proof must identify exactly one candidate';
  }
  const selected = proof.selectedCandidates[0];
  if (
    !isObjectRecord(selected) || selected.slot !== row.slot || selected.versionId !== String(row.id)
    || normalizedSha(selected.sha256) !== candidateSha256
  ) return 'Strategikon background proof does not identify the reviewed candidate bytes';
  if (!Array.isArray(proof.slotSnapshots) || proof.slotSnapshots.length !== 1) {
    return 'Strategikon background proof must snapshot exactly one semantic slot';
  }
  const snapshot = proof.slotSnapshots[0];
  if (!isObjectRecord(snapshot) || snapshot.slot !== row.slot) {
    return 'Strategikon background proof slot snapshot is invalid';
  }
  return null;
}

function sfxSampleOwnerProofIssue(row, proof, surfaceUrl = null) {
  const slot = sfxSampleSlot(row.slot);
  if (!slot) return 'SFX sample proof requires a typed SFX sample slot';
  if (!isObjectRecord(proof) || proof.schema !== SFX_SAMPLE_PROOF_SCHEMA) {
    return `SFX sample review requires ${SFX_SAMPLE_PROOF_SCHEMA}`;
  }
  if (
    proof.renderer !== SFX_SAMPLE_PROOF_RENDERER
    || proof.exactByteAudition !== true
    || proof.playbackRate !== 1
  ) return 'SFX sample proof must use the exact-byte Studio audition at playback rate 1';
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'SFX sample proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'SFX sample proof surfaceUrl is invalid'; }
  if (
    parsedSurface.pathname !== '/studio'
    || parsedSurface.searchParams.get('mode') !== 'viewer'
    || parsedSurface.searchParams.get('vk') !== 'sfx'
    || parsedSurface.searchParams.get('sfxReview') !== String(row.id)
  ) return 'SFX sample proof must identify its exact Studio candidate audition';

  const runtime = mediaVersionMetadata(row).runtime;
  const decoded = proof.decodedAudio;
  if (
    !isObjectRecord(decoded)
    || !Number.isSafeInteger(decoded.durationMs)
    || Math.abs(decoded.durationMs - Number(runtime?.durationMs)) > 20
    || !Number.isSafeInteger(decoded.sampleRate) || decoded.sampleRate < 8_000 || decoded.sampleRate > 384_000
    || !Number.isSafeInteger(decoded.channels) || decoded.channels < 1 || decoded.channels > 16
  ) return 'SFX sample proof must record valid decoded audio geometry matching the candidate duration';

  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (!candidateSha256 || !Array.isArray(proof.selectedCandidates) || proof.selectedCandidates.length !== 1) {
    return 'SFX sample proof must identify exactly one candidate';
  }
  const selected = proof.selectedCandidates[0];
  if (
    !isObjectRecord(selected) || selected.slot !== row.slot || selected.versionId !== String(row.id)
    || normalizedSha(selected.sha256) !== candidateSha256
  ) return 'SFX sample proof does not identify the reviewed candidate bytes';
  if (!Array.isArray(proof.slotSnapshots) || proof.slotSnapshots.length !== 1) {
    return 'SFX sample proof must snapshot exactly one semantic slot';
  }
  const snapshot = proof.slotSnapshots[0];
  if (!isObjectRecord(snapshot) || snapshot.slot !== row.slot) {
    return 'SFX sample proof slot snapshot is invalid';
  }
  return null;
}

function predrawnBoardOwnerProofIssue(row, proof, surfaceUrl = null) {
  const slug = predrawnBoardSlotSlug(row.slot);
  if (!slug) return 'pre-drawn board proof requires a canonical board slot';
  if (!isObjectRecord(proof) || proof.schema !== PREDRAWN_BOARD_PROOF_SCHEMA) {
    return `pre-drawn board review requires ${PREDRAWN_BOARD_PROOF_SCHEMA}`;
  }
  if (
    proof.renderer !== PREDRAWN_BOARD_PROOF_RENDERER
    || proof.canonicalScale !== 1 || proof.assetLocalScale !== 1
    || proof.alignmentApplied !== true || proof.deterministicProof !== true
  ) return 'pre-drawn board proof must use the Level Editor renderer at exact canonical 1x';
  if (proof.boardSlug !== slug) return 'pre-drawn board proof does not match the semantic slot slug';
  if (proof.frameWidth !== Number(row.width) || proof.frameHeight !== Number(row.height)) {
    return 'pre-drawn board proof frame dimensions do not match the candidate bytes';
  }
  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (!candidateSha256 || normalizedSha(proof.previewSha256) !== candidateSha256) {
    return 'pre-drawn board proof preview hash does not match the candidate bytes';
  }
  const alignmentIssue = predrawnBoardAlignmentIssue(proof.alignment, row.width, row.height);
  if (alignmentIssue) return alignmentIssue;
  const alignmentSha256 = createHash('sha256').update(proof.alignment, 'utf8').digest('hex');
  if (normalizedSha(proof.alignmentSha256) !== alignmentSha256) {
    return 'pre-drawn board proof alignment hash does not match its canonical payload';
  }
  if (typeof proof.levelId !== 'string' || !proof.levelId.trim()) {
    return 'pre-drawn board proof requires the reviewed canonical level id';
  }
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'pre-drawn board proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'pre-drawn board proof surfaceUrl is invalid'; }
  if (parsedSurface.pathname !== '/editor/level' || parsedSurface.searchParams.get('levelId') !== proof.levelId) {
    return 'pre-drawn board proof must identify the reviewed Level Editor level';
  }
  if (!Array.isArray(proof.selectedCandidates) || proof.selectedCandidates.length !== 1) {
    return 'pre-drawn board proof must identify exactly one candidate';
  }
  const selected = proof.selectedCandidates[0];
  if (
    !isObjectRecord(selected) || selected.slot !== row.slot || selected.versionId !== String(row.id)
    || normalizedSha(selected.sha256) !== candidateSha256
  ) return 'pre-drawn board proof does not identify the reviewed candidate bytes';
  if (!Array.isArray(proof.slotSnapshots) || proof.slotSnapshots.length !== 1) {
    return 'pre-drawn board proof must snapshot exactly one semantic slot';
  }
  const snapshot = proof.slotSnapshots[0];
  if (!isObjectRecord(snapshot) || snapshot.slot !== row.slot) {
    return 'pre-drawn board proof slot snapshot is invalid';
  }
  return null;
}

const RUN_CARD_FAMILY_RESAMPLED_EXCEPTION_SCHEMA = 'run-card-family-resampled-v1';
const RUN_CARD_FAMILY_RESAMPLE_TRANSFORM = 'lanczos3-cover-fit-400x280';

// A downscale of a SOURCE is native generation. Every owner-approved exception above exists
// because this general form did not, so each new downscale needed its own branch pinning its own
// bytes; the branches stay for the rows already accepted through them and nothing new needs one.
//
// The line is the one ADR-0578 drew, and it is about what the resampler was handed. A raster the
// generator produced above delivery size, reconstructed down in one named step, has its pixels
// decided by the generator and the filter and is reproducible from the source. An already-accepted
// delivery asset resized is RECAPTURE: the input is finished art, authored decisions are destroyed,
// and the provenance chain is circular. That stays forbidden, which is why the source kind is a
// closed set rather than a free string.
const SUPERSAMPLED_NATIVE_SCHEMA = 'supersampled-native-v1';
const SUPERSAMPLED_NATIVE_SOURCE_KINDS = new Set(['generation', 'render']);

function nativeMediaEvidenceIssue(row) {
  const isRaster = String(row.media_type || '').startsWith('image/') && row.media_type !== 'image/svg+xml';
  if (!isRaster) return null;
  const evidence = isObjectRecord(row.native_evidence) ? row.native_evidence : {};
  if (evidence.schema === RUN_STARTER_SELECTED_DERIVATIVE_EXCEPTION_SCHEMA) {
    const expected = RUN_STARTER_SELECTED_DERIVATIVE_BY_SLOT[String(row.slot || '')];
    if (!expected) return 'ADR-0414 selected-derivative evidence is restricted to its active starter-card runtime slots';
    if (
      normalizedSha(row.blob_sha256) !== expected.outputSha256
      || normalizedSha(evidence.outputSha256) !== expected.outputSha256
    ) return 'ADR-0414 selected-derivative evidence does not authorize these uploaded bytes';
    if (
      normalizedSha(evidence.sourceSha256) !== expected.sourceSha256
      || evidence.sourceVersionId !== expected.sourceVersionId
    ) return 'ADR-0414 selected-derivative evidence does not name its archived generated source';
    if (
      evidence.decision !== 'ADR-0414'
      || evidence.status !== 'owner-approved-production-exception'
      || evidence.native1x !== false
      || evidence.spatialResampling !== true
    ) return 'ADR-0414 selected-derivative evidence is incomplete';
    if (
      Number(row.width) !== expected.outputWidth || Number(row.height) !== expected.outputHeight
      || Number(evidence.outputWidth) !== expected.outputWidth
      || Number(evidence.outputHeight) !== expected.outputHeight
      || Number(evidence.sourceWidth) !== expected.sourceWidth
      || Number(evidence.sourceHeight) !== expected.sourceHeight
      || evidence.transform !== expected.transform
    ) return 'ADR-0414 selected-derivative evidence has invalid geometry or transform';
    return null;
  }
  if (evidence.schema === RUN_CARD_GOLD_TIER_DIVIDER_SCALED_PRODUCTION_EXCEPTION_SCHEMA) {
    if (
      String(row.slot || '') !== RUN_CARD_GOLD_TIER_DIVIDER_SLOT
      || normalizedSha(row.blob_sha256) !== RUN_CARD_GOLD_TIER_DIVIDER_SHA256
      || normalizedSha(evidence.sourceSha256) !== RUN_CARD_GOLD_TIER_DIVIDER_SHA256
    ) return 'ADR-0506 scaled divider evidence is restricted to the exact owner-selected PixelLab bytes';
    if (
      !RUN_CARD_GOLD_TIER_DIVIDER_EVIDENCE_DECISIONS.has(evidence.decision)
      || evidence.status !== 'owner-approved-production-exception'
      || evidence.native1x !== false || evidence.spatialResampling !== true
      || Number(row.width) !== 688 || Number(row.height) !== 384
      || Number(evidence.sourceWidth) !== 688 || Number(evidence.sourceHeight) !== 384
      || Number(evidence.drawHeight) !== RUN_CARD_GOLD_TIER_DIVIDER_DRAW.height
      || Number(evidence.leftCapWidth) !== RUN_CARD_GOLD_TIER_DIVIDER_DRAW.left
      || Number(evidence.rightCapWidth) !== RUN_CARD_GOLD_TIER_DIVIDER_DRAW.right
      || !isObjectRecord(evidence.slice)
      || ['top', 'right', 'bottom', 'left'].some(
        (edge) => evidence.slice[edge] !== RUN_CARD_GOLD_TIER_DIVIDER_SLICE[edge],
      )
      || evidence.transform !== 'svg-three-slice-138-56-139-132-to-38px-47px-20px-stretch'
    ) return 'ADR-0506 scaled divider evidence is incomplete';
    return null;
  }
  if (evidence.schema === LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SCHEMA) {
    if (
      String(row.slot || '') !== LEVEL_EDITOR_BRUSH_ICON_SLOT
      || normalizedSha(row.blob_sha256) !== LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SHA256
      || normalizedSha(evidence.sourceSha256) !== LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SHA256
    ) return 'ADR-0337 scaled Brush evidence is restricted to the exact owner-selected Option 01 bytes';
    if (
      evidence.decision !== 'ADR-0337'
      || evidence.status !== 'owner-approved-production-exception'
      || evidence.native1x !== false || evidence.spatialResampling !== true
      || Number(row.width) !== 64 || Number(row.height) !== 64
      || Number(evidence.sourceWidth) !== 64 || Number(evidence.sourceHeight) !== 64
      || Number(evidence.drawWidth) !== 20 || Number(evidence.drawHeight) !== 20
      || evidence.transform !== 'css-background-size-contain-64-to-20'
    ) return 'ADR-0337 scaled Brush evidence is incomplete';
    return null;
  }
  if (evidence.schema === LIPSANON_RESIZED_PRODUCTION_EXCEPTION_SCHEMA) {
    const expectedSha256 = LIPSANON_RESIZED_PRODUCTION_EXCEPTION_SHA_BY_SLOT[String(row.slot || '')];
    if (!expectedSha256) return 'ADR-0332 resized production evidence is restricted to its eight Run lipsanon slots';
    if (normalizedSha(row.blob_sha256) !== expectedSha256 || normalizedSha(evidence.outputSha256) !== expectedSha256) {
      return 'ADR-0332 resized production evidence does not authorize these uploaded bytes';
    }
    if (
      evidence.decision !== 'ADR-0332'
      || evidence.status !== 'owner-approved-production-exception'
      || evidence.native1x !== false
      || evidence.spatialResampling !== true
    ) return 'ADR-0332 resized production evidence is incomplete';
    if (
      Number(row.width) !== 64 || Number(row.height) !== 64
      || Number(evidence.outputWidth) !== 64 || Number(evidence.outputHeight) !== 64
      || Number(evidence.sourceWidth) !== 1254 || Number(evidence.sourceHeight) !== 1254
    ) return 'ADR-0332 resized production evidence has invalid source or output dimensions';
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(evidence.sourceVersionId || ''))
      || !normalizedSha(evidence.sourceSha256)
      || evidence.transform !== 'chroma-key-crop-nearest-neighbor-fit-52-alpha-threshold-96'
    ) return 'ADR-0332 resized production evidence is missing its archived source or exact transform';
    return null;
  }
  if (evidence.schema === RUN_CARD_FRAME_NORMALISED_EXCEPTION_SCHEMA) {
    const expected = RUN_CARD_FRAME_NORMALISED_EXCEPTION_BY_SLOT[String(row.slot || '')];
    if (!expected) return 'ADR-0360 normalised card-frame evidence is restricted to its two Run card frame slots';
    if (
      normalizedSha(row.blob_sha256) !== expected.outputSha256
      || normalizedSha(evidence.outputSha256) !== expected.outputSha256
    ) return 'ADR-0360 normalised card-frame evidence does not authorize these uploaded bytes';
    if (normalizedSha(evidence.sourceSha256) !== expected.sourceSha256) {
      return 'ADR-0360 normalised card-frame evidence does not name the frame it was normalised from';
    }
    if (
      evidence.decision !== 'ADR-0360'
      || evidence.status !== 'owner-approved-production-exception'
      || evidence.native1x !== false
      || evidence.spatialResampling !== true
    ) return 'ADR-0360 normalised card-frame evidence is incomplete';
    if (Number(row.width) !== 1060 || Number(row.height) !== 1484) {
      return 'ADR-0360 normalised card-frame evidence requires the native 1060x1484 canvas';
    }
    if (
      Number(evidence.paintedWidth) !== 1009 || Number(evidence.paintedHeight) !== 1402
      || Number(evidence.sourcePaintedHeight) !== expected.sourcePaintedHeight
      || evidence.transform !== RUN_CARD_FRAME_NORMALISED_EXCEPTION_TRANSFORM
    ) return 'ADR-0360 normalised card-frame evidence is missing its painted box or exact transform';
    return null;
  }
  // ADR-0520: family card art may come from Codex, which renders far above the 400x280 card
  // window and is downsampled to it. That IS spatial resampling, so it is recorded as such
  // rather than claimed native — the evidence names the source raster it came down from and
  // the exact transform, the same shape the ADR-0332 and ADR-0360 exceptions use.
  if (evidence.schema === RUN_CARD_FAMILY_RESAMPLED_EXCEPTION_SCHEMA) {
    if (!/^ui\/run\/card-art\/[0-9]+-[pkbrq]+\/illustration\.png$/.test(String(row.slot || ''))) {
      return 'ADR-0520 resampled card-art evidence is restricted to family card-art slots';
    }
    if (
      // The batch was promoted while this decision was numbered 0517; main had taken that
      // number, so the ADR is 0520. Accepted rows cannot be patched, so both names are
      // honoured and the stored ones stay truthful about when they were written.
      !['ADR-0520', 'ADR-0517'].includes(evidence.decision)
      || evidence.status !== 'owner-approved-production-exception'
      || evidence.native1x !== false
      || evidence.spatialResampling !== true
      || evidence.generationModel !== 'codex-image-gen'
    ) return 'ADR-0520 resampled card-art evidence is incomplete';
    if (
      Number(row.width) !== 400 || Number(row.height) !== 280
      || Number(evidence.outputWidth) !== 400 || Number(evidence.outputHeight) !== 280
    ) return 'ADR-0520 resampled card-art evidence has invalid output dimensions';
    if (
      !Number.isFinite(Number(evidence.sourceWidth)) || Number(evidence.sourceWidth) <= 400
      || !Number.isFinite(Number(evidence.sourceHeight)) || Number(evidence.sourceHeight) <= 280
    ) return 'ADR-0520 resampled card-art evidence must name a larger source raster';
    if (
      !normalizedSha(evidence.outputSha256)
      || normalizedSha(evidence.outputSha256) !== normalizedSha(row.blob_sha256)
      || evidence.transform !== RUN_CARD_FAMILY_RESAMPLE_TRANSFORM
    ) return 'ADR-0520 resampled card-art evidence must authorize these bytes and its exact transform';
    return null;
  }
  if (evidence.schema === MAIN_MENU_MARK_FITTED_EXCEPTION_SCHEMA) {
    if (!MAIN_MENU_MARK_FITTED_SLOTS.includes(String(row.slot || ''))) {
      return 'ADR-0560 fitted mark evidence is restricted to the main-menu mark slots';
    }
    if (
      // The set was installed while this decision was numbered 0556; main took that number
      // (and 0557-0559) first, so the ADR is 0560. Accepted rows cannot be patched, so both
      // names are honoured and the stored ones stay truthful about when they were written —
      // the same accommodation ADR-0520 records for its own renumber.
      !['ADR-0560', 'ADR-0556'].includes(evidence.decision)
      || evidence.status !== 'owner-approved-production-exception'
      || evidence.native1x !== false
      || evidence.spatialResampling !== true
    ) return 'ADR-0560 fitted mark evidence is incomplete';
    if (
      Number(row.width) !== 64 || Number(row.height) !== 64
      || Number(evidence.outputWidth) !== 64 || Number(evidence.outputHeight) !== 64
      || Number(evidence.inkHeight) !== fittedMarkInkHeight(row.slot)
    ) {
      return `ADR-0560 fitted mark evidence must declare a 64x64 canvas holding exactly ${fittedMarkInkHeight(row.slot)}px of ink`;
    }
    if (
      !Number.isFinite(Number(evidence.sourceWidth)) || Number(evidence.sourceWidth) <= 0
      || !Number.isFinite(Number(evidence.sourceHeight)) || Number(evidence.sourceHeight) <= 0
    ) return 'ADR-0560 fitted mark evidence must name the generator canvas it was fitted from';
    if (
      !normalizedSha(evidence.outputSha256)
      || normalizedSha(evidence.outputSha256) !== normalizedSha(row.blob_sha256)
      || !normalizedSha(evidence.sourceSha256)
      || evidence.transform !== fittedMarkTransform(row.slot)
    ) return 'ADR-0560 fitted mark evidence must authorize these bytes and name its exact transform';
    return null;
  }
  if (evidence.schema === SUPERSAMPLED_NATIVE_SCHEMA) {
    if (!SUPERSAMPLED_NATIVE_SOURCE_KINDS.has(evidence.sourceKind)) {
      return 'supersampled evidence must name a generated or rendered source, never accepted delivery art';
    }
    if (evidence.native1x !== true || evidence.spatialResampling !== false) {
      return 'supersampled evidence is native: native1x must be true and spatialResampling false';
    }
    const outputWidth = Number(evidence.outputWidth);
    const outputHeight = Number(evidence.outputHeight);
    if (
      !Number.isFinite(outputWidth) || outputWidth <= 0
      || !Number.isFinite(outputHeight) || outputHeight <= 0
      || (row.width !== null && Number(row.width) !== outputWidth)
      || (row.height !== null && Number(row.height) !== outputHeight)
    ) return 'supersampled evidence output dimensions must equal the uploaded image dimensions';
    const sourceWidth = Number(evidence.sourceWidth);
    const sourceHeight = Number(evidence.sourceHeight);
    if (
      !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)
      || sourceWidth < outputWidth || sourceHeight < outputHeight
      || (sourceWidth === outputWidth && sourceHeight === outputHeight)
    ) return 'supersampled evidence must come down from a strictly larger source raster';
    if (typeof evidence.transform !== 'string' || !evidence.transform.trim()) {
      return 'supersampled evidence must name its exact downscale transform';
    }
    if (!normalizedSha(evidence.sourceSha256)) {
      return 'supersampled evidence must name the source raster it came down from';
    }
    if (
      !normalizedSha(evidence.outputSha256)
      || normalizedSha(evidence.outputSha256) !== normalizedSha(row.blob_sha256)
    ) return 'supersampled evidence must authorize these exact bytes';
    return null;
  }
  if (evidence.native1x !== true) return 'nativeEvidence.native1x must be true';
  if (evidence.spatialResampling !== false) return 'nativeEvidence.spatialResampling must be false';
  if (row.width !== null || row.height !== null) {
    if (Number(evidence.sourceWidth) !== Number(row.width) || Number(evidence.sourceHeight) !== Number(row.height)) {
      return 'nativeEvidence source dimensions must equal the uploaded image dimensions';
    }
  }
  if (!normalizedSha(evidence.sourceSha256) || normalizedSha(evidence.sourceSha256) !== normalizedSha(row.blob_sha256)) {
    return 'nativeEvidence.sourceSha256 is required and must equal the uploaded content hash';
  }
  return null;
}

function preservesNativeEvidenceForUpload(current, { sha256, mediaType, width, height }) {
  return nativeMediaEvidenceIssue({
    ...current,
    blob_sha256: normalizedSha(sha256),
    media_type: mediaType,
    width,
    height,
  }) === null;
}

function liveCatalogReadinessIssue(catalog, { requireCritical = false } = {}) {
  if (!catalog || !Array.isArray(catalog.slots)) return 'live media catalog is missing slots';
  if (!requireCritical) return null;
  const hasCritical = catalog.slots.some((slot) => (
    slot?.lifecycleState === 'active'
    && slot?.availabilityPolicy === 'critical'
    && slot?.media?.sha256
  ));
  return hasCritical ? null : 'live media catalog has no active critical slot';
}

module.exports = {
  runLipsanonMatMediaIssue,
  runLipsanonMatSlot,
  ATARAXIA_NUMERAL_COMPONENT,
  ATARAXIA_NUMERAL_PROOF_RENDERER,
  ATARAXIA_NUMERAL_PROOF_SCHEMA,
  ataraxiaNumeralMediaIssue,
  ataraxiaNumeralOwnerProofIssue,
  ataraxiaNumeralSlot,
  CARD_TYPE_ROW_TEXTURE_COMPONENT,
  CARD_TYPE_ROW_TEXTURE_GROUP_ID,
  CARD_TYPE_ROW_TEXTURE_REQUIRED_SLOTS,
  PREDRAWN_BOARD_COMPONENT,
  PREDRAWN_BOARD_PROOF_RENDERER,
  PREDRAWN_BOARD_PROOF_SCHEMA,
  LEVEL_EDITOR_BRUSH_ICON_COMPONENT,
  LEVEL_EDITOR_BRUSH_ICON_PROOF_RENDERER,
  LEVEL_EDITOR_BRUSH_ICON_PROOF_SCHEMA,
  LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SCHEMA,
  LIPSANON_ICON_COMPONENT,
  LIPSANON_RESIZED_PRODUCTION_EXCEPTION_SCHEMA,
  MAIN_MENU_MARK_FITTED_EXCEPTION_SCHEMA,
  MAIN_MENU_MARK_FITTED_TRANSFORM,
  MAIN_MENU_MARK_FITTED_SLOTS,
  fittedMarkInkHeight,
  fittedMarkTransform,
  mainMenuMarkSlot,
  mainMenuMarkMediaIssue,
  RUN_CARD_COST_COIN_COMPONENT,
  RUN_CARD_COST_CROWN_COMPONENT,
  RUN_CARD_COST_CROWN_SLOT,
  RUN_CARD_GOLD_TIER_DIVIDER_COMPONENT,
  RUN_CARD_GOLD_TIER_DIVIDER_PROOF_RENDERER,
  RUN_CARD_GOLD_TIER_DIVIDER_PROOF_SCHEMA,
  RUN_CARD_GOLD_TIER_DIVIDER_SCALED_PRODUCTION_EXCEPTION_SCHEMA,
  RUN_CARD_GOLD_TIER_DIVIDER_SHA256,
  RUN_CARD_GOLD_TIER_DIVIDER_SLOT,
  RUN_CARD_BACK_COMPONENT,
  RUN_CARD_BACK_PROOF_RENDERER,
  RUN_CARD_BACK_PROOF_SCHEMA,
  RUN_CARD_BACK_SLOT,
  RUN_CARD_RARITY_FRAME_PROOF_RENDERER,
  RUN_CARD_RARITY_FRAME_PROOF_SCHEMA,
  RUN_STARTER_SELECTED_DERIVATIVE_EXCEPTION_SCHEMA,
  RUN_RESOURCE_ICON_COMPONENT,
  RUN_SECTIO_WRAP_COMPONENT,
  SFX_SAMPLE_COMPONENT,
  SFX_SAMPLE_PROOF_RENDERER,
  SFX_SAMPLE_PROOF_SCHEMA,
  STRATEGIKON_BACKGROUND_COMPONENT,
  STRATEGIKON_BACKGROUND_PROOF_RENDERER,
  STRATEGIKON_BACKGROUND_PROOF_SCHEMA,
  STRATEGIKON_BACKGROUND_SHA256,
  STRATEGIKON_BACKGROUND_SLOT,
  WALL_MATERIAL_COMPONENT,
  WALL_MATERIAL_FRAME_HEIGHT,
  WALL_MATERIAL_FRAME_WIDTH,
  WALL_MATERIAL_PROOF_RENDERER,
  WALL_MATERIAL_PROOF_SCHEMA,
  liveCatalogReadinessIssue,
  cardTypeRowTextureAcceptanceGroupIssue,
  cardTypeRowTextureMediaIssue,
  cardTypeRowTextureSlot,
  gameConditionIconMediaIssue,
  gameConditionIconSlot,
  levelEditorBrushIconMediaIssue,
  levelEditorBrushIconOwnerProofIssue,
  levelEditorBrushIconSlot,
  nativeMediaEvidenceIssue,
  runRailMarkMediaIssue,
  runRailMarkSlot,
  runRailMarkReviewSurface,
  predrawnBoardAlignmentIssue,
  predrawnBoardMediaIssue,
  predrawnBoardOwnerProofIssue,
  predrawnBoardSlotSlug,
  preservesNativeEvidenceForUpload,
  runLipsanonIconMediaIssue,
  runLipsanonIconSlotId,
  runCardCostCoinMediaIssue,
  runCardCostCoinSlot,
  runCardCostCrownMediaIssue,
  runCardCostCrownSlot,
  runCardGoldTierDividerMediaIssue,
  runCardGoldTierDividerOwnerProofIssue,
  runCardGoldTierDividerSlot,
  runCardBackMediaIssue,
  runCardBackOwnerProofIssue,
  runCardBackSlot,
  runCardRarityFrameOwnerProofIssue,
  runCardRarityFrameSlot,
  runResourceIconMediaIssue,
  runResourceIconSlotId,
  runExpunctioReviewSurface,
  runGoldTransactionReviewSurface,
  titleBarMarkReviewSurface,
  titleBarMarkSlot,
  titleBarMarkMediaIssue,
  ADLECTIO_MARK_COMPONENT,
  ADLECTIO_MARK_SLOT,
  adlectioMarkSlot,
  adlectioMarkMediaIssue,
  runSectioWrapMediaIssue,
  workspaceBackgroundSlotId,
  workspaceBackgroundMediaIssue,
  WORKSPACE_BACKGROUND_IDS,
  runSectioWrapSlotId,
  sfxSampleMediaIssue,
  sfxSampleOwnerProofIssue,
  sfxSampleSlot,
  strategikonBackgroundMediaIssue,
  strategikonBackgroundOwnerProofIssue,
  strategikonBackgroundSlot,
  propArtMediaIssue,
  propArtSlot,
  wallMaterialMediaIssue,
  wallMaterialOwnerProofIssue,
  wallMaterialSlot,
};
