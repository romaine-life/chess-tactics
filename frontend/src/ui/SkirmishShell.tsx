import { useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import type { LipsanonId } from '../run/model';
import { defaultBackgroundSet } from '../art/backgroundSets';
import { LipsanonStrip } from './Lipsana';
import { SkirmishHud, type SkirmishHudProps } from './SkirmishHud';
import { SceneSurfaceReadiness } from './shell/PaintedSurfaceBoundary';
import { TitleBarSlot } from './shell/TitleBarSlot';
import { useInstalledChromeCss } from './useInstalledChromeCss';

export interface SkirmishShellProps {
  className?: string;
  testId?: string;
  titleBarContent: ReactNode;
  /** Artwork shared by sibling viewport destinations. It is deliberately outside
   *  the director-faded overlap region so the environment remains continuous. */
  persistentViewportArtwork?: ReactNode;
  lipsanonIds?: readonly LipsanonId[];
  shellWorkspaceCoversLipsana?: boolean;
  controlsContent?: ReactNode;
  hudProps?: SkirmishHudProps;
  hudContent?: ReactNode;
  screenStyle?: CSSProperties | null;
  registerSceneSurface?: boolean;
  /** Stable mounted-surface identity when chrome state changes within one battlefield. */
  surfaceSignature?: string;
  readyToCompose?: boolean;
  children: ReactNode;
}

/**
 * The shared gameplay frame. Run code may only reach it through RunForm; standalone
 * Skirmish owns the other construction path.
 */
export function SkirmishShell({
  className = '',
  testId = 'skirmish',
  titleBarContent,
  persistentViewportArtwork = null,
  lipsanonIds = [],
  shellWorkspaceCoversLipsana = false,
  controlsContent,
  hudProps,
  hudContent,
  screenStyle,
  registerSceneSurface = true,
  surfaceSignature,
  readyToCompose = true,
  children,
}: SkirmishShellProps): ReactElement {
  const installedChromeCss = useInstalledChromeCss();
  const [paintAttempt, setPaintAttempt] = useState(0);
  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('skirmish-active');
    return () => shell?.classList.remove('skirmish-active');
  }, []);
  const resolvedScreenStyle = screenStyle === undefined
    ? {
        '--skirmish-world-bg': `url("${defaultBackgroundSet().world}")`,
      } as CSSProperties
    : screenStyle ?? undefined;
  const surface = (
    <>
      {persistentViewportArtwork ? (
        <div className="shell-persistent-viewport-artwork" aria-hidden="true">
          {persistentViewportArtwork}
        </div>
      ) : null}
      {shellWorkspaceCoversLipsana ? null : <LipsanonStrip lipsanonIds={lipsanonIds} />}
      {children}
      {hudContent === undefined
        ? <SkirmishHud {...hudProps} controlsContent={controlsContent} />
        : hudContent}
    </>
  );

  return (
    <div
      data-testid={testId}
      className={`skirmish-screen${persistentViewportArtwork ? ' has-persistent-viewport-artwork' : ''} ${className}`.trim()}
      style={resolvedScreenStyle}
    >
      {installedChromeCss ? <style data-skirmish-chrome-family dangerouslySetInnerHTML={{ __html: installedChromeCss }} /> : null}
      <TitleBarSlot region="center">{titleBarContent}</TitleBarSlot>
      {registerSceneSurface ? (
        <SceneSurfaceReadiness
          surface="gameplay-hud"
          signature={`${surfaceSignature ?? testId}:${paintAttempt}`}
          readyToCompose={readyToCompose}
          loadingLabel="Preparing Run…"
          onRetry={() => setPaintAttempt((value) => value + 1)}
          showStatus={false}
        >
          {surface}
        </SceneSurfaceReadiness>
      ) : surface}
    </div>
  );
}
