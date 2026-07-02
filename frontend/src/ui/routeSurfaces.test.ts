import { describe, expect, it } from 'vitest';
import { isBoardArtRoute, isHeavyRoute, isLightArtRoute, routeSurface } from './routeSurfaces';

describe('route surface classification', () => {
  it('keeps the skirmish picker in the light art route family', () => {
    expect(routeSurface('/skirmish')).toBe('light-art');
    expect(isLightArtRoute('/skirmish')).toBe(true);
    expect(isHeavyRoute('/skirmish')).toBe(false);
    expect(isBoardArtRoute('/skirmish')).toBe(false);
  });

  it('keeps live play as the only board-art route', () => {
    expect(routeSurface('/play')).toBe('heavy-board');
    expect(isHeavyRoute('/play')).toBe(true);
    expect(isBoardArtRoute('/play')).toBe(true);
    expect(isLightArtRoute('/play')).toBe(false);
  });

  it('keeps heavy editors out of the board-art reveal gate', () => {
    expect(routeSurface('/edit')).toBe('heavy-editor');
    expect(routeSurface('/level-editor')).toBe('heavy-editor');
    expect(isHeavyRoute('/edit')).toBe(true);
    expect(isBoardArtRoute('/edit')).toBe(false);
  });

  it('classifies menu-family art routes explicitly', () => {
    for (const path of ['/', '/campaign', '/campaign/official', '/campaigns-next', '/lobbies', '/party', '/settings/audio']) {
      expect(routeSurface(path)).toBe('light-art');
      expect(isLightArtRoute(path)).toBe(true);
      expect(isHeavyRoute(path)).toBe(false);
    }
  });
});
