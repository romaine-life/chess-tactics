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
export const PLAY_REFERENCE_STAGE_SIZE = Object.freeze({
  width: PLAY_REFERENCE_DESIGN_SIZE.width,
  height: PLAY_REFERENCE_DESIGN_SIZE.height - PLAY_HEADER_HEIGHT,
}) satisfies PlayCanvasSize;
export const PLAY_REFERENCE_BOARD_VIEW_SIZE = Object.freeze({
  width: PLAY_REFERENCE_STAGE_SIZE.width - PLAY_HUD_WIDTH,
  height: PLAY_REFERENCE_STAGE_SIZE.height,
}) satisfies PlayCanvasSize;

/**
 * Fits only Play's replaceable scene stage beneath the persistent application
 * title bar. The title bar remains in viewport coordinates while the 992px stage
 * retains ADR-0226's authored vertical scale and bounded horizontal expansion.
 */
export function playCanvasLayout(
  viewport: PlayCanvasSize,
  headerHeight = PLAY_HEADER_HEIGHT,
): PlayCanvasLayout {
  const availableHeight = viewport.height - Math.max(0, headerHeight);
  if (viewport.width <= 0 || availableHeight <= 0) {
    return {
      designSize: PLAY_REFERENCE_STAGE_SIZE,
      scale: 1,
      wingWidth: 0,
    };
  }

  const referenceAspect =
    PLAY_REFERENCE_STAGE_SIZE.width / PLAY_REFERENCE_STAGE_SIZE.height;
  const viewportAspect = viewport.width / availableHeight;
  const scale = viewportAspect >= referenceAspect
    ? availableHeight / PLAY_REFERENCE_STAGE_SIZE.height
    : viewport.width / PLAY_REFERENCE_STAGE_SIZE.width;
  const availableDesignWidth = viewport.width / scale;
  const designWidth = Math.min(
    PLAY_MAX_DESIGN_WIDTH,
    Math.max(PLAY_REFERENCE_STAGE_SIZE.width, availableDesignWidth),
  );
  const renderedWidth = designWidth * scale;

  return {
    designSize: {
      width: designWidth,
      height: PLAY_REFERENCE_STAGE_SIZE.height,
    },
    scale,
    wingWidth: Math.max(0, (viewport.width - renderedWidth) / 2),
  };
}

/**
 * Installs Play's bounded-fluid scene stage on the existing app shell.
 *
 * The title bar is measured in viewport coordinates and excluded from the
 * transformed stage. This preserves ADR-0213's persistent application host while
 * the reference 1920×992 Play scene expands horizontally up to ADR-0226's cap.
 */
export function installPlayCanvas(shell: HTMLElement): () => void {
  const root = document.documentElement;
  let frame = 0;

  const apply = (): void => {
    frame = 0;
    const titleBar = document.querySelector<HTMLElement>('.app-shell-titlebar');
    const measuredHeaderHeight = titleBar?.getBoundingClientRect().height ?? 0;
    const headerHeight = measuredHeaderHeight > 0 ? measuredHeaderHeight : PLAY_HEADER_HEIGHT;
    const layout = playCanvasLayout({
      width: window.innerWidth,
      height: window.innerHeight,
    }, headerHeight);
    root.style.setProperty('--skirmish-canvas-scale', String(layout.scale));
    root.style.setProperty('--skirmish-canvas-width', `${layout.designSize.width}px`);
    root.style.setProperty('--skirmish-canvas-height', `${layout.designSize.height}px`);
    root.style.setProperty('--skirmish-canvas-top', `${headerHeight}px`);
    root.style.setProperty('--skirmish-wing-width', `${layout.wingWidth}px`);
    shell.classList.toggle('has-ultrawide-wings', layout.wingWidth >= 0.5);
  };
  const schedule = (): void => {
    if (frame) return;
    frame = window.requestAnimationFrame(apply);
  };

  root.classList.add('skirmish-play-canvas');
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
    root.style.removeProperty('--skirmish-canvas-top');
    root.style.removeProperty('--skirmish-wing-width');
    root.style.removeProperty('--skirmish-hud-width');
    shell.classList.remove('has-ultrawide-wings');
    shell.classList.remove('skirmish-active');
  };
}
