import { Fragment, type ReactElement, type RefObject } from 'react';
import type { TreeNode } from './catalogData';
import { ASSET_TREE_PROTOTYPE } from './catalogData';

// Recursive tree rail, ported from app.js renderTreeList / renderPrototypeTreePanel.
// Branch nodes are native <details open> (expand-by-default); a panel ref lets the
// Expand/Collapse-all controls toggle every <details open> at once. In flat mode
// (glossary) parents render as links with children always shown — no expand.

interface TreeOpts {
  flat?: boolean;
  hideTools?: boolean;
}

function TreeList({
  nodes,
  activeHref,
  depth,
  opts,
}: {
  nodes: TreeNode[];
  activeHref: string;
  depth: number;
  opts: TreeOpts;
}): ReactElement {
  return (
    <ul className={`prototype-tree-list depth-${depth}`}>
      {nodes.map((node) => {
        const active = activeHref === node.href ? 'active' : '';
        // Glossary (flat) mode: every node — parents included — is a link to its
        // entry, with children always shown beneath. No expand/collapse.
        if (node.children && opts.flat) {
          return (
            <li key={node.href + node.label}>
              <a className={`prototype-tree-term ${active} ${node.planned ? 'planned' : ''}`} href={node.href}>
                <span>{node.label}</span>
                {node.planned ? <em>planned</em> : null}
              </a>
              <TreeList nodes={node.children} activeHref={activeHref} depth={depth + 1} opts={opts} />
            </li>
          );
        }
        if (node.children) {
          return (
            <li key={node.href + node.label}>
              <details className={`prototype-tree-branch ${active}`} open>
                <summary>
                  <span>{node.label}</span>
                  {node.planned ? <em>planned</em> : null}
                  <a
                    className="prototype-tree-launch"
                    href={node.href}
                    data-tree-launch
                    aria-label={`Open ${node.label}`}
                  >
                    ↗
                  </a>
                </summary>
                <TreeList nodes={node.children} activeHref={activeHref} depth={depth + 1} opts={opts} />
              </details>
            </li>
          );
        }
        return (
          <li key={node.href + node.label}>
            <a className={`${active} ${node.planned ? 'planned' : ''}`} href={node.href}>
              <span>{node.label}</span>
              {node.planned ? <em>planned</em> : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function CatalogTreePanel({
  activeHref,
  nodes = ASSET_TREE_PROTOTYPE,
  opts = {},
  panelRef,
}: {
  activeHref: string;
  nodes?: TreeNode[];
  opts?: TreeOpts;
  panelRef?: RefObject<HTMLElement | null>;
}): ReactElement {
  return (
    <aside className="prototype-tree-panel" ref={panelRef}>
      {opts.flat || opts.hideTools ? null : (
        <div className="prototype-tree-tools" aria-label="Tree controls">
          <button type="button" data-action="expand-prototype-tree" onClick={() => setAllOpen(panelRef, true)}>
            Expand all
          </button>
          <button type="button" data-action="collapse-prototype-tree" onClick={() => setAllOpen(panelRef, false)}>
            Collapse all
          </button>
        </div>
      )}
      <TreeList nodes={nodes} activeHref={activeHref} depth={0} opts={opts} />
    </aside>
  );
}

/** Toggle the `open` attribute on every <details> inside the tree panel. */
export function setAllOpen(panelRef: RefObject<HTMLElement | null> | undefined, open: boolean): void {
  const root = panelRef?.current;
  if (!root) return;
  root.querySelectorAll('details.prototype-tree-branch').forEach((el) => {
    (el as HTMLDetailsElement).open = open;
  });
}

export function AssetBreadcrumb({ parts }: { parts: string[] }): ReactElement {
  return (
    <div className="prototype-crumbs">
      {parts.map((part, index) => (
        <Fragment key={part + index}>
          <span>{part}</span>
          {index < parts.length - 1 ? <b>/</b> : null}
        </Fragment>
      ))}
    </div>
  );
}
