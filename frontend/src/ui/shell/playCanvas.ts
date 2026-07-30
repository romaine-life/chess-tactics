export interface PlayCanvasSize {
  width: number;
  height: number;
}

export interface PlayCanvasLayout {
  designSize: PlayCanvasSize;
  scale: number;
  wingWidth: number;
}

export const PLAY_REFERENCE_DESIGN_SIZE = Object.freeze({
  width: 1920,
  height: 1080,
}) satisfies PlayCanvasSize;

export const PLAY_MAX_VIEWPORT_ASPECT = 2.1;
export const PLAY_MAX_DESIGN_WIDTH =
  PLAY_REFERENCE_DESIGN_SIZE.height * PLAY_MAX_VIEWPORT_ASPECT;
export const PLAY_HEADER_HEIGHT = 88;
export const PLAY_HUD_WIDTH = 360;
export const PLAY_REFERENCE_BOARD_VIEW_SIZE = Object.freeze({
  width: PLAY_REFERENCE_DESIGN_SIZE.width - PLAY_HUD_WIDTH,
  height: PLAY_REFERENCE_DESIGN_SIZE.height - PLAY_HEADER_HEIGHT,
}) satisfies PlayCanvasSize;

/**
 * Keeps Play's authored vertical scale and chrome metrics while allowing the board
 * track to consume ordinary wide-browser space. Only viewports wider than 2.1:1
 * receive centered shell-owned wings.
 */
export function playCanvasLayout(viewport: PlayCanvasSize): PlayCanvasLayout {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return {
      designSize: PLAY_REFERENCE_DESIGN_SIZE,
      scale: 1,
      wingWidth: 0,
    };
  }

  const referenceAspect =
    PLAY_REFERENCE_DESIGN_SIZE.width / PLAY_REFERENCE_DESIGN_SIZE.height;
  const viewportAspect = viewport.width / viewport.height;
  const scale = viewportAspect >= referenceAspect
    ? viewport.height / PLAY_REFERENCE_DESIGN_SIZE.height
    : viewport.width / PLAY_REFERENCE_DESIGN_SIZE.width;
  const availableDesignWidth = viewport.width / scale;
  const designWidth = Math.min(
    PLAY_MAX_DESIGN_WIDTH,
    Math.max(PLAY_REFERENCE_DESIGN_SIZE.width, availableDesignWidth),
  );
  const renderedWidth = designWidth * scale;

  return {
    designSize: {
      width: designWidth,
      height: PLAY_REFERENCE_DESIGN_SIZE.height,
    },
    scale,
    wingWidth: Math.max(0, (viewport.width - renderedWidth) / 2),
  };
}

/**
 * Installs Play's bounded-fluid canvas on the existing app shell.
 *
 * The reference 1920×1080 composition expands horizontally until the browser
 * content rectangle reaches 2.1:1. Beyond that cap the composition remains
 * centered and the shell owns the surplus as ultrawide wings.
 */
export function installPlayCanvas(shell: HTMLElement): () => void {
  const root = document.documentElement;
  let frame = 0;

  const apply = (): void => {
    frame = 0;
    const layout = playCanvasLayout({
      width: window.innerWidth,
      height: window.innerHeight,
    });
    root.style.setProperty('--skirmish-canvas-scale', String(layout.scale));
    root.style.setProperty('--skirmish-canvas-width', `${layout.designSize.width}px`);
    root.style.setProperty('--skirmish-canvas-height', `${layout.designSize.height}px`);
    root.style.setProperty('--skirmish-wing-width', `${layout.wingWidth}px`);
    shell.classList.toggle('has-ultrawide-wings', layout.wingWidth >= 0.5);
  };
  const schedule = (): void => {
    if (frame) return;
    frame = window.requestAnimationFrame(apply);
  };

  root.classList.add('skirmish-play-canvas');
  root.style.setProperty('--skirmish-header-height', `${PLAY_HEADER_HEIGHT}px`);
  root.style.setProperty('--skirmish-hud-width', `${PLAY_HUD_WIDTH}px`);
  shell.classList.add('skirmish-active');
  apply();
  window.addEventListener('resize', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule);

  return () => {
    if (frame) window.cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
    root.classList.remove('skirmish-play-canvas');
    root.style.removeProperty('--skirmish-canvas-scale');
    root.style.removeProperty('--skirmish-canvas-width');
    root.style.removeProperty('--skirmish-canvas-height');
    root.style.removeProperty('--skirmish-wing-width');
    root.style.removeProperty('--skirmish-header-height');
    root.style.removeProperty('--skirmish-hud-width');
    shell.classList.remove('has-ultrawide-wings');
    shell.classList.remove('skirmish-active');
  };
}
