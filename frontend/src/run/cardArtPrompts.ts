import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import type { PurchasablePieceType } from './model';

export const RUN_CARD_ART_PROMPT_SCHEMA = 'run-card-art-prompt-v1';
export const RUN_CARD_ART_PLAN_SCHEMA = 'run-card-art-plan-v1';
export const RUN_CARD_ART_SLOT_PREFIX = 'ui/run/card-art/';

export type RunCardArtGenerationDisposition = 'pending' | 'existing-art';

export interface RunCardArtPromptPlan {
  id: string;
  title: string;
  pieces: readonly PurchasablePieceType[];
  baseCost: number;
  historicalAnchor: string;
  generationDisposition: RunCardArtGenerationDisposition;
  sceneDirection: string;
  eyeConcealment: string;
  prompt: string;
  promptSha256: string;
  promptExactness: 'exact-authored-plan' | 'reconstructed-description';
  existingArtSha256: string | null;
  version: AdminLiveMediaVersion;
}

const SHA256 = /^[0-9a-f]{64}$/;
const CARD_ID = /^[pkbrq]+$/;
const PIECES: readonly PurchasablePieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];

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
  if (metadata?.schema !== RUN_CARD_ART_PLAN_SCHEMA || provenance?.schema !== RUN_CARD_ART_PROMPT_SCHEMA) return null;
  const id = textValue(metadata.cardId);
  const title = textValue(metadata.cardTitle);
  const historicalAnchor = textValue(metadata.historicalAnchor);
  const sceneDirection = textValue(provenance.sceneDirection);
  const eyeConcealment = textValue(provenance.eyeConcealment);
  const prompt = textValue(provenance.prompt);
  const promptSha256 = textValue(provenance.promptSha256);
  const promptExactness = provenance.promptExactness;
  const generationDisposition = metadata.generationDisposition;
  const baseCost = metadata.baseCost;
  const rawPieces = metadata.pieces;
  if (
    !id || !CARD_ID.test(id) || !title || !historicalAnchor || !sceneDirection || !eyeConcealment || !prompt
    || !promptSha256 || !SHA256.test(promptSha256)
    || !Number.isSafeInteger(baseCost) || Number(baseCost) < 1 || Number(baseCost) > 9
    || !Array.isArray(rawPieces) || rawPieces.length < 1
    || rawPieces.some((piece) => typeof piece !== 'string' || !PIECES.includes(piece as PurchasablePieceType))
    || (generationDisposition !== 'pending' && generationDisposition !== 'existing-art')
    || (promptExactness !== 'exact-authored-plan' && promptExactness !== 'reconstructed-description')
  ) {
    throw new Error(`Run card art prompt candidate ${version.id} has invalid typed provenance`);
  }
  const existingArtSha256 = metadata.existingArtSha256 === undefined
    ? null : textValue(metadata.existingArtSha256);
  if (existingArtSha256 !== null && !SHA256.test(existingArtSha256)) {
    throw new Error(`Run card art prompt candidate ${version.id} has an invalid existing-art hash`);
  }
  return {
    id,
    title,
    pieces: rawPieces as PurchasablePieceType[],
    baseCost: Number(baseCost),
    historicalAnchor,
    generationDisposition,
    sceneDirection,
    eyeConcealment,
    prompt,
    promptSha256,
    promptExactness,
    existingArtSha256,
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
  const counts = new Map<PurchasablePieceType, number>();
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
