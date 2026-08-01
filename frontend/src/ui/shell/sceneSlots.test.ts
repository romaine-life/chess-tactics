import { describe, expect, it } from 'vitest';
import { sceneManifest } from './sceneManifest';
import { sceneSlots } from './sceneSlots';

describe('authored scene slots', () => {
  it('keeps committed and pending instances separate for inspection and reveal authority', () => {
    const slots = sceneSlots(
      sceneManifest('/play/select/skirmish'),
      sceneManifest('/play/select/levels'),
    );
    expect(slots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'root',
        committed: expect.objectContaining({ key: 'main-menu' }),
        pending: expect.objectContaining({ key: 'main-menu' }),
      }),
      expect.objectContaining({
        id: 'play-content',
        committed: expect.objectContaining({ key: 'play/skirmish' }),
        pending: expect.objectContaining({ key: 'play/levels' }),
      }),
    ]));
  });

  it('keeps Editor collection intent pending until the editor-content slot commits', () => {
    const slots = sceneSlots(
      sceneManifest('/editor/wars'),
      sceneManifest('/editor', '?collection=unassigned'),
    );
    expect(slots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'editor-content',
        committed: expect.objectContaining({ key: 'campaign-editor/wars' }),
        pending: expect.objectContaining({ key: 'campaign-editor/unassigned' }),
      }),
    ]));
  });
});
