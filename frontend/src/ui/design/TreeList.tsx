// Recursive catalog tree — a faithful React port of app.js's renderTreeList.
// Emits the exact DOM/classes the surviving CSS targets (.prototype-tree-list,
// .prototype-tree-branch, <details>/<summary>, .prototype-tree-launch ↗,
// .prototype-tree-term for glossary mode, .planned tags).
//
// Two behaviours the user fought for in session 930 are preserved here:
//  - expand/collapse is *controlled* (openKeys) so the ＋/− tree-zoom works
//    (turns 66, 70), and the rail stays mounted across content swaps so its
//    open state + scroll survive client-side navigation (turns 56, 59, 60);
//  - clicking a node navigates in place (onNavigate intercepts and prevent...
//    Defaults), never a full reload / game-screen flash.
import type { MouseEvent } from 'react';
import type { TreeNode } from './catalogData';

export interface TreeListProps {
  nodes: TreeNode[];
  activeHref: string;
  flat?: boolean;
  depth?: number;
  parentKey?: string;
  openKeys: Set<string>;
  onToggle: (key: string) => void;
  onNavigate: (href: string, e: MouseEvent<HTMLAnchorElement>) => void;
}

// Branches can share an href (widget → button → Main Menu all point at the same
// page), so open-state is keyed by tree position, not href.
function nodeKey(parentKey: string, node: TreeNode, index: number): string {
  return `${parentKey}/${node.label}#${index}`;
}

export function TreeList({
  nodes,
  activeHref,
  flat = false,
  depth = 0,
  parentKey = '',
  openKeys,
  onToggle,
  onNavigate,
}: TreeListProps): React.ReactElement {
  return (
    <ul className={`prototype-tree-list depth-${depth}`}>
      {nodes.map((node, index) => {
        const key = nodeKey(parentKey, node, index);
        const active = activeHref === node.href;

        // Glossary (flat) mode: every node — parents included — is a link to its
        // entry, with children always shown beneath. No expand/collapse.
        if (node.children && flat) {
          return (
            <li key={key}>
              <a
                className={`prototype-tree-term ${active ? 'active' : ''} ${node.planned ? 'planned' : ''}`.trim()}
                href={node.href}
                onClick={(e) => onNavigate(node.href, e)}
              >
                <span>{node.label}</span>
                {node.planned ? <em>planned</em> : null}
              </a>
              <TreeList
                nodes={node.children}
                activeHref={activeHref}
                flat
                depth={depth + 1}
                parentKey={key}
                openKeys={openKeys}
                onToggle={onToggle}
                onNavigate={onNavigate}
              />
            </li>
          );
        }

        if (node.children) {
          return (
            <li key={key}>
              <details className={`prototype-tree-branch ${active ? 'active' : ''}`.trim()} open={openKeys.has(key)}>
                <summary
                  onClick={(e) => {
                    // React fully controls open-state; stop the native toggle.
                    e.preventDefault();
                    onToggle(key);
                  }}
                >
                  <span>{node.label}</span>
                  {node.planned ? <em>planned</em> : null}
                  <a
                    className="prototype-tree-launch"
                    href={node.href}
                    aria-label={`Open ${node.label}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onNavigate(node.href, e);
                    }}
                  >
                    ↗
                  </a>
                </summary>
                <TreeList
                  nodes={node.children}
                  activeHref={activeHref}
                  depth={depth + 1}
                  parentKey={key}
                  openKeys={openKeys}
                  onToggle={onToggle}
                  onNavigate={onNavigate}
                />
              </details>
            </li>
          );
        }

        return (
          <li key={key}>
            <a
              className={`${active ? 'active' : ''} ${node.planned ? 'planned' : ''}`.trim()}
              href={node.href}
              onClick={(e) => onNavigate(node.href, e)}
            >
              <span>{node.label}</span>
              {node.planned ? <em>planned</em> : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

// Every branch key in a tree — the expand-all set + initial (all-open) state.
export function allBranchKeys(nodes: TreeNode[], parentKey = ''): string[] {
  const keys: string[] = [];
  nodes.forEach((node, index) => {
    if (node.children && node.children.length) {
      const key = nodeKey(parentKey, node, index);
      keys.push(key);
      keys.push(...allBranchKeys(node.children, key));
    }
  });
  return keys;
}
