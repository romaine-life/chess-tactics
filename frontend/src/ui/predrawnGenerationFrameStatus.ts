import {
  normalizePredrawnGenerationFrame,
  type PredrawnGenerationFrame,
} from '@chess-tactics/board-render';

export type GenerationFrameCloudState =
  | 'loading'
  | 'local'
  | 'pending'
  | 'saving'
  | 'saved'
  | 'error'
  | 'conflict';

export type PredrawnGenerationFrameStatusKind =
  | 'missing'
  | 'saving'
  | 'working-copy'
  | 'canonical'
  | 'browser-only'
  | 'blocked';

export interface PredrawnGenerationFrameStatus {
  kind: PredrawnGenerationFrameStatusKind;
  title: string;
  detail: string;
  tone: 'neutral' | 'ready' | 'blocked';
}

export function samePredrawnGenerationFrame(
  left: PredrawnGenerationFrame | undefined,
  right: PredrawnGenerationFrame | undefined,
): boolean {
  const a = normalizePredrawnGenerationFrame(left);
  const b = normalizePredrawnGenerationFrame(right);
  if (!a || !b) return a === b;
  return a.version === b.version
    && a.x === b.x
    && a.y === b.y
    && a.width === b.width
    && a.height === b.height;
}

export function predrawnGenerationFrameReadout(frame: PredrawnGenerationFrame): string {
  return `${frame.width} × ${frame.height} · origin ${frame.x}, ${frame.y}`;
}

export function predrawnGenerationFrameStatus({
  frame,
  cloudFrame,
  canonicalFrame,
  cloudState,
  promotionVerb,
}: {
  frame?: PredrawnGenerationFrame;
  cloudFrame?: PredrawnGenerationFrame;
  canonicalFrame?: PredrawnGenerationFrame;
  cloudState: GenerationFrameCloudState;
  promotionVerb: 'publish' | 'save';
}): PredrawnGenerationFrameStatus {
  const current = normalizePredrawnGenerationFrame(frame);
  if (!current) {
    return {
      kind: 'missing',
      title: 'No generation frame',
      detail: `Choose a 16:9 frame before you ${promotionVerb}; the art pipeline has no Image 1 crop yet.`,
      tone: 'blocked',
    };
  }

  const readout = predrawnGenerationFrameReadout(current);
  if (samePredrawnGenerationFrame(current, canonicalFrame)) {
    return {
      kind: 'canonical',
      title: `Canonical pipeline frame · ${readout}`,
      detail: `The ${promotionVerb === 'publish' ? 'published' : 'saved'} level makes this exact crop the Image 1 pipeline input.`,
      tone: 'ready',
    };
  }

  const inCloudWorkingCopy = samePredrawnGenerationFrame(current, cloudFrame);
  if (inCloudWorkingCopy && (cloudState === 'error' || cloudState === 'conflict')) {
    return {
      kind: 'blocked',
      title: `Working-copy frame saved · ${readout}`,
      detail: `This frame is durable, but autosave is paused. Open Status before you ${promotionVerb}.`,
      tone: 'blocked',
    };
  }
  if (inCloudWorkingCopy) {
    return {
      kind: 'working-copy',
      title: `Working-copy frame saved · ${readout}`,
      detail: `This exact crop is autosaved, but it is not the pipeline input until you ${promotionVerb}.`,
      tone: 'neutral',
    };
  }

  if (cloudState === 'error' || cloudState === 'conflict') {
    return {
      kind: 'blocked',
      title: `Frame only in this editor · ${readout}`,
      detail: `Autosave is paused. Keep this editor open and resolve Status before you ${promotionVerb}.`,
      tone: 'blocked',
    };
  }
  if (cloudState === 'local') {
    return {
      kind: 'browser-only',
      title: `Frame saved in this browser only · ${readout}`,
      detail: `Sign in or reconnect before you ${promotionVerb}; this is not yet a durable working-copy frame.`,
      tone: 'blocked',
    };
  }
  return {
    kind: 'saving',
    title: `Saving frame to working copy… · ${readout}`,
    detail: `Keep this editor open until the working copy acknowledges the frame; ${promotionVerb} remains a separate action.`,
    tone: 'neutral',
  };
}
