import { relativeTimeLabel } from './relativeTime';

export type LevelEditorSessionRelationship = 'this_tab' | 'same_device' | 'other_device';

export interface LevelEditorSessionAttribution {
  name?: string | null;
  email: string;
  client_label?: string | null;
  relationship: LevelEditorSessionRelationship;
  opened_at?: string | null;
  last_seen_at?: string | null;
}

const clean = (value: string | null | undefined): string => value?.trim() ?? '';

/** Use the server's presence clock for relative labels; browser clocks may be skewed. */
export function levelEditorSessionServerNow(
  serverTime: string | null | undefined,
  fallback = Date.now(),
): number {
  const parsed = serverTime ? Date.parse(serverTime) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function levelEditorClientLabel(userAgent: string): string {
  const browser = /Codex|OpenAI[^)]*Electron/i.test(userAgent)
    ? 'Codex desktop'
    : /Electron\//.test(userAgent)
      ? 'Electron app'
      : /(?:;\s*wv\)|\bWebView\b)/i.test(userAgent)
        ? 'Embedded WebView'
        : /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const platform = /Windows/i.test(userAgent)
    ? 'Windows'
    : /(?:iPhone|iPad|iPod)/i.test(userAgent)
      ? 'iOS'
      : /Android/i.test(userAgent)
        ? 'Android'
        : /Mac OS X|Macintosh/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : '';
  return platform ? `${browser} on ${platform}` : browser;
}

export function levelEditorSessionActorLabel(
  attribution: Pick<LevelEditorSessionAttribution, 'name' | 'email'>,
): string {
  const email = clean(attribution.email);
  const name = clean(attribution.name);
  if (!name || name.toLocaleLowerCase() === email.toLocaleLowerCase()) return email;
  return `${name} (${email})`;
}

export function levelEditorSessionLocationLabel(
  attribution: Pick<LevelEditorSessionAttribution, 'client_label' | 'relationship'>,
): string {
  const clientLabel = clean(attribution.client_label);
  const relationship = attribution.relationship === 'this_tab'
    ? 'this tab'
    : attribution.relationship === 'same_device'
      ? 'another tab in this browser profile'
      : 'another browser profile or device';
  return clientLabel ? `${relationship} · ${clientLabel}` : relationship;
}

/** How long ago, in the one shared voice — see relativeTime.ts. Kept as a named export
 *  because session attribution reads as its own vocabulary at every call site here. */
export const levelEditorSessionTimeLabel = relativeTimeLabel;

export function levelEditorSessionPresenceDetail(
  attribution: LevelEditorSessionAttribution,
  now = Date.now(),
): string {
  const opened = levelEditorSessionTimeLabel(attribution.opened_at, now);
  const seen = levelEditorSessionTimeLabel(attribution.last_seen_at, now);
  return `${levelEditorSessionLocationLabel(attribution)} · opened ${opened} · server last saw it ${seen}`;
}
