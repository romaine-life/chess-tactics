import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { ShellWorkspace } from './shared/ChromeBox';

export function RunWorkspace({
  className = '',
  contentClassName = '',
  edgeAttached = false,
  // The shell's registered slot for workspace artwork; it spans the whole
  // workspace box, including padding an inner layer cannot reach.
  backgroundArtwork = null,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  contentClassName?: string;
  edgeAttached?: boolean;
  backgroundArtwork?: ReactNode;
}): ReactElement {
  return (
    <main className={`run-workspace ${className}`.trim()}>
      <ShellWorkspace
        {...props}
        className="run-shell-workspace"
        bodyClassName={`run-shell-workspace-content ${contentClassName}`.trim()}
        backgroundArtwork={backgroundArtwork}
        edgeAttached={edgeAttached}
      >
        {children}
      </ShellWorkspace>
    </main>
  );
}
