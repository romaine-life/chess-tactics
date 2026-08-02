import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { ShellWorkspace } from './shared/ChromeBox';

export function RunWorkspace({
  className = '',
  contentClassName = '',
  edgeAttached = false,
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
        edgeAttached={edgeAttached}
        backgroundArtwork={backgroundArtwork}
      >
        {children}
      </ShellWorkspace>
    </main>
  );
}
