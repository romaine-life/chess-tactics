import { type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { useScreenEntrance } from './useScreenEntrance';

type ArtRouteChromeTag = 'div' | 'main' | 'footer' | 'section';

interface ArtRouteChromeProps extends HTMLAttributes<HTMLElement> {
  as?: ArtRouteChromeTag;
  children?: ReactNode;
}

// The only public way for an art-background route to enroll chrome in the ADR-0046
// entrance fade. Screens choose a chrome element; this component supplies the hook.
export function ArtRouteChrome({
  as = 'div',
  className = '',
  children,
  ...props
}: ArtRouteChromeProps): ReactElement {
  const entranceClass = useScreenEntrance();
  const Tag = as;

  return (
    <Tag {...props} className={`${className} ${entranceClass}`.trim()}>
      {children}
    </Tag>
  );
}
