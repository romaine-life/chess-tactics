import { useEffect, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { installLayoutViewportVar } from './layoutViewport';
import { useSceneParticipant } from './SceneBoundary';

type ArtRouteChromeTag = 'div' | 'main' | 'footer' | 'section';

interface ArtRouteChromeProps extends HTMLAttributes<HTMLElement> {
  as?: ArtRouteChromeTag;
  children?: ReactNode;
  sceneParticipant?: string;
  /**
   * Data/content readiness for this chrome hierarchy. SceneBoundary owns its
   * visibility and transition; this component only reports participation.
   */
  ready?: boolean;
}

export function ArtRouteChrome({
  as = 'div',
  className = '',
  ready = true,
  sceneParticipant,
  children,
  ...props
}: ArtRouteChromeProps): ReactElement {
  useSceneParticipant(sceneParticipant ?? `chrome:${className || as}`, ready ? 'painted' : 'loading');
  useEffect(() => { installLayoutViewportVar(); }, []);
  const Tag = as;
  return <Tag {...props} className={className}>{children}</Tag>;
}
