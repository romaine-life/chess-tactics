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

export function levelEditorSessionTimeLabel(
  value: string | null | undefined,
  now = Date.now(),
): string {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return 'time unavailable';
  const elapsedSeconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (elapsedSeconds < 10) return 'just now';
  if (elapsedSeconds < 60) return `${elapsedSeconds} seconds ago`;
  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes} minute${elapsedMinutes === 1 ? '' : 's'} ago`;
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hour${elapsedHours === 1 ? '' : 's'} ago`;
  return new Date(timestamp).toLocaleString();
}

export function levelEditorSessionPresenceDetail(
  attribution: LevelEditorSessionAttribution,
  now = Date.now(),
): string {
  const opened = levelEditorSessionTimeLabel(attribution.opened_at, now);
  const seen = levelEditorSessionTimeLabel(attribution.last_seen_at, now);
  return `${levelEditorSessionLocationLabel(attribution)} · opened ${opened} · server last saw it ${seen}`;
}
