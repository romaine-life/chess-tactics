import { describe, expect, it } from 'vitest';
import { isBoardArtRoute, isHeavyRoute, isLightArtRoute, routeScreenKey, routeSurface } from './routeSurfaces';

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

describe('route screen key (ADR-0051 exit-dissolve grouping)', () => {
  it('groups sub-paths handled inside one screen instance', () => {
    expect(routeScreenKey('/settings')).toBe(routeScreenKey('/settings/audio'));
    expect(routeScreenKey('/settings/general')).toBe(routeScreenKey('/settings/audio/tracks'));
    expect(routeScreenKey('/campaign')).toBe(routeScreenKey('/campaign/official-1'));
    expect(routeScreenKey('/lobbies')).toBe(routeScreenKey('/lobbies/abc'));
    expect(routeScreenKey('/campaigns-next')).toBe(routeScreenKey('/campaigns'));
    expect(routeScreenKey('/')).toBe(routeScreenKey('/main-menu'));
  });

  it('keeps /settings AND /campaign in the persistent menu shell (same key as home, no dissolve)', () => {
    // Settings and the Campaign picker both render INSIDE the persistent menu shell — MainMenu fills
    // its second column — so they share the 'menu' screen key with '/'. React keeps the one MainMenu
    // instance mounted across the home↔destination hop, so the button column never dissolves/remounts.
    expect(routeScreenKey('/settings')).toBe(routeScreenKey('/'));
    expect(routeScreenKey('/campaign')).toBe(routeScreenKey('/'));
    expect(routeScreenKey('/settings')).toBe('menu');
    expect(routeScreenKey('/settings/audio')).toBe('menu');
    expect(routeScreenKey('/campaign')).toBe('menu');
    expect(routeScreenKey('/campaign/official-1')).toBe('menu');
  });

  it('separates distinct screens so cross-screen hops dissolve', () => {
    // The campaign EDITOR (/campaigns-next) is its own screen — distinct from the shell and from the
    // campaign PICKER (/campaign, now in the shell).
    expect(routeScreenKey('/')).not.toBe(routeScreenKey('/campaigns-next'));
    expect(routeScreenKey('/campaign')).not.toBe(routeScreenKey('/campaigns-next'));
    // Leaving the menu shell to a full screen (the level editor) still dissolves — different keys.
    expect(routeScreenKey('/settings')).not.toBe(routeScreenKey('/level-editor'));
    expect(routeScreenKey('/skirmish')).not.toBe(routeScreenKey('/play'));
  });

  it('mirrors renderRoute: menu aliases and unmatched paths ARE the menu screen', () => {
    // renderRoute's default renders MainMenu for anything unmatched — the key must
    // agree, or a hop between two menu-rendering paths dissolves a screen that never
    // remounts (blink with no entrance).
    for (const alias of ['/menu-next', '/main-menu', '/no-such-route']) {
      expect(routeScreenKey(alias)).toBe(routeScreenKey('/'));
      expect(routeScreenKey(alias)).toBe('menu');
    }
  });

  it('classifies the menu aliases light-art so leaving them dissolves', () => {
    for (const alias of ['/menu-next', '/main-menu']) {
      expect(isLightArtRoute(alias)).toBe(true);
    }
  });
});
