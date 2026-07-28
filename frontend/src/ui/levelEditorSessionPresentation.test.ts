import { describe, expect, it } from 'vitest';

import {
  levelEditorClientLabel,
  levelEditorSessionActorLabel,
  levelEditorSessionLocationLabel,
  levelEditorSessionPresenceDetail,
  levelEditorSessionServerNow,
  levelEditorSessionTimeLabel,
} from './levelEditorSessionPresentation';

describe('Level Editor session presentation', () => {
  it('derives a best-effort browser and OS label without claiming a machine identity', () => {
    expect(levelEditorClientLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'))
      .toBe('Chrome on Windows');
    expect(levelEditorClientLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Electron/36.0.0 Safari/537.36'))
      .toBe('Electron app on Windows');
    expect(levelEditorClientLabel('Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP3A; wv) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36'))
      .toBe('Embedded WebView on Android');
  });

  it('shows the authenticated display name and immutable email together', () => {
    expect(levelEditorSessionActorLabel({ name: 'Nelson', email: 'nelson@romaine.life' }))
      .toBe('Nelson (nelson@romaine.life)');
    expect(levelEditorSessionActorLabel({ name: '', email: 'nelson@romaine.life' }))
      .toBe('nelson@romaine.life');
  });

  it('names the tab/device relationship without claiming a machine name', () => {
    expect(levelEditorSessionLocationLabel({
      relationship: 'same_device',
      client_label: 'Chrome on Windows',
    })).toBe('another tab in this browser profile · Chrome on Windows');
    expect(levelEditorSessionLocationLabel({
      relationship: 'other_device',
      client_label: null,
    })).toBe('another browser profile or device');
  });

  it('keeps heartbeat time distinct and explicit', () => {
    const now = Date.parse('2026-07-20T08:00:00.000Z');
    expect(levelEditorSessionTimeLabel('2026-07-20T07:59:43.000Z', now)).toBe('17 seconds ago');
    expect(levelEditorSessionPresenceDetail({
      name: 'Nelson',
      email: 'nelson@romaine.life',
      relationship: 'same_device',
      client_label: 'Chrome on Windows',
      opened_at: '2026-07-20T07:25:00.000Z',
      last_seen_at: '2026-07-20T07:59:43.000Z',
    }, now)).toBe('another tab in this browser profile · Chrome on Windows · opened 35 minutes ago · server last saw it 17 seconds ago');
  });

  it('uses the presence response clock instead of a skewed browser clock', () => {
    const fallback = Date.parse('2030-01-01T00:00:00.000Z');
    expect(levelEditorSessionServerNow('2026-07-20T08:00:00.000Z', fallback))
      .toBe(Date.parse('2026-07-20T08:00:00.000Z'));
    expect(levelEditorSessionServerNow('invalid', fallback)).toBe(fallback);
  });
});
