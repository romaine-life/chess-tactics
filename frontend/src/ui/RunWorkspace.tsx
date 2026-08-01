import type { HTMLAttributes, ReactElement } from 'react';
import { ShellWorkspace } from './shared/ChromeBox';

export function RunWorkspace({
  className = '',
  contentClassName = '',
  edgeAttached = false,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  contentClassName?: string;
  edgeAttached?: boolean;
}): ReactElement {
  return (
    <main className={`run-workspace ${className}`.trim()}>
      <ShellWorkspace
        {...props}
        className="run-shell-workspace"
        bodyClassName={`run-shell-workspace-content ${contentClassName}`.trim()}
        edgeAttached={edgeAttached}
      >
        {children}
      </ShellWorkspace>
    </main>
  );
}
