export interface FixedDesignSize {
  width: number;
  height: number;
}

export const PLAY_DESIGN_SIZE = Object.freeze({
  width: 1920,
  height: 1080,
}) satisfies FixedDesignSize;

export const PLAY_HEADER_HEIGHT = 88;
export const PLAY_HUD_WIDTH = 360;
export const PLAY_BOARD_VIEW_SIZE = Object.freeze({
  width: PLAY_DESIGN_SIZE.width - PLAY_HUD_WIDTH,
  height: PLAY_DESIGN_SIZE.height - PLAY_HEADER_HEIGHT,
}) satisfies FixedDesignSize;

export function fixedDesignScale(
  viewport: FixedDesignSize,
  design: FixedDesignSize = PLAY_DESIGN_SIZE,
): number {
  if (
    viewport.width <= 0
    || viewport.height <= 0
    || design.width <= 0
    || design.height <= 0
  ) {
    return 1;
  }
  return Math.min(viewport.width / design.width, viewport.height / design.height);
}

/**
 * Installs the fixed Play composition on the existing app shell.
 *
 * The routed app remains laid out in design pixels. Only this one outer scale responds
 * to the browser rectangle, so window resizing and browser zoom cannot independently
 * reflow the title bar, board seat, and HUD.
 */
export function installPlayDesignCanvas(shell: HTMLElement): () => void {
  const root = document.documentElement;
  let frame = 0;

  const apply = (): void => {
    frame = 0;
    root.style.setProperty(
      '--skirmish-design-scale',
      String(fixedDesignScale({
        width: window.innerWidth,
        height: window.innerHeight,
      })),
    );
  };
  const schedule = (): void => {
    if (frame) return;
    frame = window.requestAnimationFrame(apply);
  };

  root.classList.add('skirmish-design-locked');
  root.style.setProperty('--skirmish-design-width', `${PLAY_DESIGN_SIZE.width}px`);
  root.style.setProperty('--skirmish-design-height', `${PLAY_DESIGN_SIZE.height}px`);
  root.style.setProperty('--skirmish-header-height', `${PLAY_HEADER_HEIGHT}px`);
  root.style.setProperty('--skirmish-hud-width', `${PLAY_HUD_WIDTH}px`);
  shell.classList.add('skirmish-active');
  apply();
  window.addEventListener('resize', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });

  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
    root.classList.remove('skirmish-design-locked');
    root.style.removeProperty('--skirmish-design-scale');
    root.style.removeProperty('--skirmish-design-width');
    root.style.removeProperty('--skirmish-design-height');
    root.style.removeProperty('--skirmish-header-height');
    root.style.removeProperty('--skirmish-hud-width');
    shell.classList.remove('skirmish-active');
  };
}
