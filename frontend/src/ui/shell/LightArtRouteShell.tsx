import { useEffect, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { HomepageBackdrop } from '../HomepageBackdrop';
import { ArtRouteChrome } from './ArtRouteChrome';
import { TitleBarSlot } from './TitleBarSlot';

interface LightArtRouteShellProps {
  rootClassName: string;
  chromeClassName: string;
  shellClassName: string;
  children: ReactNode;
  chromeAriaLabel?: string;
  centerSlot?: ReactNode;
  centerSlotClassName?: string;
  style?: CSSProperties;
  testId?: string;
}

// Managed route shell for light art screens (ADR-0049): the shared ambience backdrop is
// outside the faded chrome, while the chrome root is automatically enrolled in ADR-0046.
export function LightArtRouteShell({
  rootClassName,
  chromeClassName,
  shellClassName,
  children,
  chromeAriaLabel,
  centerSlot,
  centerSlotClassName = '',
  style,
  testId,
}: LightArtRouteShellProps): ReactElement {
  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add(shellClassName);
    return () => shell?.classList.remove(shellClassName);
  }, [shellClassName]);

  return (
    <div data-testid={testId} className={rootClassName} style={style}>
      {/* A light-art route is, by definition, the main-menu scene + rain (routeSurfaces.ts):
          the one shared HomepageBackdrop, under the faded chrome. */}
      <HomepageBackdrop />
      {centerSlot ? (
        <TitleBarSlot region="center">
          <ArtRouteChrome className={centerSlotClassName}>{centerSlot}</ArtRouteChrome>
        </TitleBarSlot>
      ) : null}
      <ArtRouteChrome as="section" className={chromeClassName} aria-label={chromeAriaLabel}>{children}</ArtRouteChrome>
    </div>
  );
}
