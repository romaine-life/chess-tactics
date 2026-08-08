import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import type { AdlectablePieceType } from './model';

export const RUN_CARD_ART_PROMPT_SCHEMA = 'run-card-art-prompt-v2';
export const RUN_CARD_ART_PLAN_SCHEMA = 'run-card-art-plan-v2';
// ADR-0517: art keyed to (footprint, roster). A v3 plan carries a family id and may come from
// either generator, so the catalog surface has to admit both schema generations at once — the
// roster set stays readable while the family set is reviewed.
export const RUN_CARD_ART_FAMILY_PROMPT_SCHEMA = 'run-card-art-prompt-v3';
export const RUN_CARD_ART_FAMILY_PLAN_SCHEMA = 'run-card-art-plan-v3';
export const RUN_CARD_ART_SLOT_PREFIX = 'ui/run/card-art/';

export interface RunCardArtPromptPlan {
  id: string;
  title: string;
  pieces: readonly AdlectablePieceType[];
  baseCost: number;
  historicalAnchor: string;
  sceneDirection: string;
  unitIdentity: string;
  prompt: string;
  promptSha256: string;
  /** PixelLab job id, or the Codex rollout thread whose log holds the image-generation marker. */
  generationJobId: string;
  generationModel: 'pixellab-pixflux' | 'codex-image-gen';
  version: AdminLiveMediaVersion;
}

const SHA256 = /^[0-9a-f]{64}$/;
const CARD_ID = /^[pkbrq]+$/;
const FAMILY_ID = /^[0-9]+-[pkbrq]+$/;
const PIECES: readonly AdlectablePieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && Boolean(value.trim()) ? value.trim() : null;
}

function promptPlanFrom(version: AdminLiveMediaVersion): RunCardArtPromptPlan | null {
  if (!version.slot?.startsWith(RUN_CARD_ART_SLOT_PREFIX)) return null;
  const metadata = objectValue(version.metadata);
  const provenance = objectValue(version.provenance);
  const family = metadata?.schema === RUN_CARD_ART_FAMILY_PLAN_SCHEMA
    && provenance?.schema === RUN_CARD_ART_FAMILY_PROMPT_SCHEMA;
  const roster = metadata?.schema === RUN_CARD_ART_PLAN_SCHEMA
    && provenance?.schema === RUN_CARD_ART_PROMPT_SCHEMA;
  if (!metadata || !provenance || (!family && !roster)) return null;
  const id = textValue(metadata.cardId);
  const title = textValue(metadata.cardTitle);
  const historicalAnchor = textValue(metadata.historicalAnchor);
  const sceneDirection = textValue(provenance.sceneDirection);
  const unitIdentity = textValue(provenance.unitIdentity);
  const prompt = textValue(provenance.prompt);
  const promptSha256 = textValue(provenance.promptSha256);
  const generationModel = textValue(provenance.generationModel);
  const generationJobId = textValue(provenance.pixelLabJobId) ?? textValue(provenance.codexThreadId);
  const baseCost = metadata.baseCost;
  const rawPieces = metadata.pieces;
  const identified = family ? Boolean(id && FAMILY_ID.test(id)) : Boolean(id && CARD_ID.test(id));
  const modelAllowed = family
    ? generationModel === 'pixellab-pixflux' || generationModel === 'codex-image-gen'
    : generationModel === 'pixellab-pixflux';
  if (
    !identified || version.slot !== `${RUN_CARD_ART_SLOT_PREFIX}${id}/illustration.png`
    || !title || !historicalAnchor || !sceneDirection || !unitIdentity || !prompt
    || !promptSha256 || !SHA256.test(promptSha256) || !generationJobId
    || !Number.isSafeInteger(baseCost) || Number(baseCost) < 1 || Number(baseCost) > 10
    || !Array.isArray(rawPieces) || rawPieces.length < 1
    || rawPieces.some((piece) => typeof piece !== 'string' || !PIECES.includes(piece as AdlectablePieceType))
    || !modelAllowed || metadata.generationModel !== generationModel
    || metadata.nativeWidth !== 400 || metadata.nativeHeight !== 280
  ) {
    throw new Error(`Run card art prompt candidate ${version.id} has invalid typed provenance`);
  }
  return {
    id: id!,
    title: title!,
    pieces: rawPieces as AdlectablePieceType[],
    baseCost: Number(baseCost),
    historicalAnchor: historicalAnchor!,
    sceneDirection: sceneDirection!,
    unitIdentity: unitIdentity!,
    prompt: prompt!,
    promptSha256: promptSha256!,
    generationJobId: generationJobId!,
    generationModel: generationModel as 'pixellab-pixflux' | 'codex-image-gen',
    version,
  };
}

/** Latest prompt plan per stable card-art slot. Older versions remain provenance history. */
export function runCardArtPromptPlans(catalog: AdminLiveMediaCatalog): readonly RunCardArtPromptPlan[] {
  const latestBySlot = new Map<string, RunCardArtPromptPlan>();
  [...catalog.versions]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .forEach((version) => {
      const plan = promptPlanFrom(version);
      if (plan && version.slot) latestBySlot.set(version.slot, plan);
    });
  return [...latestBySlot.values()].sort((left, right) => (
    left.baseCost - right.baseCost || left.id.localeCompare(right.id)
  ));
}

export function runCardPromptComposition(plan: Pick<RunCardArtPromptPlan, 'pieces'>): string {
  const counts = new Map<AdlectablePieceType, number>();
  plan.pieces.forEach((piece) => counts.set(piece, (counts.get(piece) ?? 0) + 1));
  return PIECES
    .filter((piece) => counts.has(piece))
    .map((piece) => {
      const count = counts.get(piece)!;
      const label = `${piece[0].toUpperCase()}${piece.slice(1)}`;
      return `${count} ${label}${count === 1 ? '' : 's'}`;
    })
    .join(' · ');
}
