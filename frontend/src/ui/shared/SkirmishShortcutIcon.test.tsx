import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SKIRMISH_SHORTCUT_CARD,
  SKIRMISH_SHORTCUT_ICON_SLOT,
  SKIRMISH_SHORTCUT_MEDIA_ROLE,
  SkirmishShortcutIcon,
} from './SkirmishShortcutIcon';
import { SHORTCUT_BINDINGS } from '../SkirmishHud';

const policy = readFileSync(
  fileURLToPath(new URL('../../../../backend/liveMediaPolicy.js', import.meta.url)),
  'utf8',
);

describe('SkirmishShortcutIcon', () => {
  it('derives every app-ui role from its own slot, so two seats cannot drift', () => {
    for (const [variant, slot] of Object.entries(SKIRMISH_SHORTCUT_ICON_SLOT)) {
      expect(SKIRMISH_SHORTCUT_MEDIA_ROLE[variant as keyof typeof SKIRMISH_SHORTCUT_MEDIA_ROLE])
        .toBe(slot.replace(/[/.]/g, '-'));
    }
  });

  it('registers every command-card slot as a fitted seat, so the ten marks share one ink box', () => {
    for (const slot of Object.values(SKIRMISH_SHORTCUT_ICON_SLOT)) {
      expect(policy).toContain(`'${slot}'`);
    }
  });

  it('paints the card the match binds, in the order the match paints it', () => {
    // The review surface composes from SKIRMISH_SHORTCUT_CARD while the match paints from
    // SHORTCUT_BINDINGS. A drift between them would review one mark and install another.
    for (const entry of SKIRMISH_SHORTCUT_CARD) {
      const binding = SHORTCUT_BINDINGS[entry.key];
      expect(binding, `no binding for ${entry.key}`).toBeTruthy();
      expect(binding.icon).toBe(entry.variant);
      expect(binding.label).toBe(entry.label);
    }
    expect(SKIRMISH_SHORTCUT_CARD).toHaveLength(Object.keys(SHORTCUT_BINDINGS).length);
  });

  it('reserves the seat when no art decision exists yet', () => {
    const markup = renderToStaticMarkup(<SkirmishShortcutIcon variant="grid" src={undefined} />);
    expect(markup).toContain('data-skirmish-shortcut-icon="grid"');
    expect(markup).toContain('is-unavailable');
    expect(markup).not.toContain('<img');
  });

  it('draws the candidate a review hands it without touching the installed role', () => {
    const markup = renderToStaticMarkup(
      <SkirmishShortcutIcon variant="zoom-in" src="/api/admin/media/abc" />,
    );
    expect(markup).toContain('src="/api/admin/media/abc"');
    expect(markup).not.toContain('is-unavailable');
  });
});
