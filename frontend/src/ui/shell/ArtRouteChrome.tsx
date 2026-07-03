import { useEffect, useRef, useState, useSyncExternalStore, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { useScreenEntrance } from './useScreenEntrance';
import { isScreenExiting, subscribeScreenExit } from './screenExit';

type ArtRouteChromeTag = 'div' | 'main' | 'footer' | 'section';

interface ArtRouteChromeProps extends HTMLAttributes<HTMLElement> {
  as?: ArtRouteChromeTag;
  children?: ReactNode;
  // ADR-0046 C.1 / ADR-0051: a screen whose content arrives async passes false until it
  // has something real to show — the entrance fade holds, then plays once, over content.
  // Omit (true) for synchronous screens; nothing holds and the entrance is unchanged.
  ready?: boolean;
}

// The only public way for an art-background route to enroll chrome in the ADR-0046
// entrance fade and the ADR-0051 light-hop exit dissolve. Screens choose a chrome
// element; this component supplies the hooks.
export function ArtRouteChrome({
  as = 'div',
  className = '',
  ready = true,
  children,
  ...props
}: ArtRouteChromeProps): ReactElement {
  const entranceClass = useScreenEntrance(ready);
  const exiting = useSyncExternalStore(subscribeScreenExit, isScreenExiting);
  // The exit flag stays up past the route swap (until the incoming screen commits), so
  // chrome that MOUNTS under it is the INCOMING screen — it must not wear the exit
  // class. Once that exit episode ends, this chrome is eligible like any other.
  const [mountedMidExit] = useState(exiting);
  const skipExit = useRef(mountedMidExit);
  useEffect(() => {
    if (!exiting) skipExit.current = false;
  }, [exiting]);

  // Stamp the exit fade's START opacity: the exit is a keyframe animation (see
  // .screen-exit in style.css for why not a transition), and a from-less keyframe would
  // snap an interrupted mid-entrance fade back to 1 before fading down. The stamp runs
  // inside the store's SYNCHRONOUS emit — before React re-renders and the exit class
  // replaces the entrance animation — so it reads the still-current animated opacity.
  const node = useRef<HTMLElement | null>(null);
  useEffect(() => subscribeScreenExit(() => {
    if (!isScreenExiting() || skipExit.current || !node.current) return;
    node.current.style.setProperty('--screen-exit-from', getComputedStyle(node.current).opacity);
  }), []);

  const exitClass = exiting && !skipExit.current ? ' screen-exit' : '';
  const Tag = as;

  return (
    <Tag
      {...props}
      ref={(el: HTMLElement | null) => { node.current = el; }}
      className={`${className} ${entranceClass}${exitClass}`.trim()}
    >
      {children}
    </Tag>
  );
}
