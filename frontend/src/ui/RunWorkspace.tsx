import type { HTMLAttributes, ReactElement } from 'react';
import { ShellWorkspace } from './shared/ChromeBox';

export function RunWorkspace({
  className = '',
  contentClassName = '',
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  contentClassName?: string;
}): ReactElement {
  return (
    <main className={`run-workspace ${className}`.trim()}>
      <ShellWorkspace
        {...props}
        className="run-shell-workspace"
        contentClassName={`run-shell-workspace-content ${contentClassName}`.trim()}
      >
        {children}
      </ShellWorkspace>
    </main>
  );
}
