import manifest from './chromeCandidateManifest.json';

export type ChromeRole = 'outer' | 'inner';
export type ChromeCandidateKind = 'atom' | 'rail-repeat' | 'rail-long' | 'rail-sheet';
export type ImageSize = { w: number; h: number };

export type ChromeCandidateSource = {
  id: string;
  label: string;
  role: ChromeRole;
  kind: ChromeCandidateKind;
  src: string;
  width: number;
  height: number;
  sourceSheetId: string;
  sourceSheetLabel: string;
  sourceSheetPath: string;
  componentIndex: number;
  componentCount: number;
  crop: { x: number; y: number; w: number; h: number };
  recommended: boolean;
};

export const CHROME_CANDIDATE_SOURCES = manifest.sources as ChromeCandidateSource[];

export const chromeSourceById = (id: string): ChromeCandidateSource =>
  CHROME_CANDIDATE_SOURCES.find((source) => source.id === id) ?? CHROME_CANDIDATE_SOURCES[0];

export const chromeSourcesFor = (role: ChromeRole, kind: 'atom' | 'rail'): ChromeCandidateSource[] =>
  CHROME_CANDIDATE_SOURCES.filter((source) => source.role === role && (kind === 'atom' ? source.kind === 'atom' : source.kind !== 'atom'));

export const defaultChromeSourceId = (role: ChromeRole, kind: 'atom' | 'rail', preferredSheetId?: string): string => {
  const sources = chromeSourcesFor(role, kind);
  return (
    sources.find((source) => source.recommended && source.sourceSheetId === preferredSheetId)?.id
    ?? sources.find((source) => source.sourceSheetId === preferredSheetId)?.id
    ?? sources.find((source) => source.recommended)?.id
    ?? sources[0]?.id
    ?? ''
  );
};
