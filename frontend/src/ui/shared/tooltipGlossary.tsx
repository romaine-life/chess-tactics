import { Children, cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { splitRunGlossaryText, type RunGlossaryEntry } from '../../run/glossary';

/**
 * A tip explains one thing. Three definitions under it is already a reference card, so a
 * body that names more than that stops stacking rather than becoming a wall of prose.
 */
const MAX_GLOSSARY_TERMS = 3;

/** Explanatory prose is shallow; this only stops a pathological caller from recursing. */
const MAX_MARK_DEPTH = 6;

export type TooltipGlossaryReading = Readonly<{
  /** The caller's children with every glossary term wrapped for emphasis. */
  content: ReactNode;
  /** The terms that earn their own definition pop, in reading order. */
  entries: readonly RunGlossaryEntry[];
}>;

/** The plain text of a node, for comparing a tip's title against a glossary term. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

function markString(
  text: string,
  keyPrefix: string,
  onTerm: (entry: RunGlossaryEntry) => boolean,
): ReactNode {
  const segments = splitRunGlossaryText(text);
  if (!segments.some((segment) => segment.entry)) return text;
  return segments.map((segment, index) => {
    // A term is only marked when it actually earns a definition below. Emphasis that
    // points at nothing is worse than plain text.
    if (!segment.entry || !onTerm(segment.entry)) return segment.text;
    return (
      // <b> is the element for a name drawn to the eye without added importance. It is
      // what carries the term to its definition below, with no second control to find.
      <b className="tooltip-keyword" data-glossary-term={segment.entry.id} key={`${keyPrefix}-${index}`}>
        {segment.text}
      </b>
    );
  });
}

function markNode(
  node: ReactNode,
  depth: number,
  keyPrefix: string,
  onTerm: (entry: RunGlossaryEntry) => boolean,
): ReactNode {
  if (typeof node === 'string') return markString(node, keyPrefix, onTerm);
  if (Array.isArray(node)) {
    return Children.map(node, (child, index) => markNode(child, depth, `${keyPrefix}-${index}`, onTerm));
  }
  if (!isValidElement(node) || depth >= MAX_MARK_DEPTH) return node;
  const props = node.props as { children?: ReactNode; dangerouslySetInnerHTML?: unknown };
  if (props.dangerouslySetInnerHTML || props.children === undefined) return node;
  return cloneElement(
    node as ReactElement,
    undefined,
    markNode(props.children, depth + 1, `${keyPrefix}-c`, onTerm),
  );
}

/**
 * Read a tooltip's own body for named Run mechanics (ADR-0369). A tip that says
 * "Grants Discipline to one contained unit" now marks that word and reports Discipline,
 * so the pop can carry its definition instead of leaving the reader to go find it.
 *
 * A term the tip is already ABOUT is dropped: the Cacochymic marker's own tip must not
 * restate Cacochymic underneath itself. Definitions are not scanned in turn — one level
 * of explanation, never a chain.
 */
export function readTooltipGlossary(children: ReactNode, title: ReactNode): TooltipGlossaryReading {
  const subject = textOf(title).trim();
  const entries: RunGlossaryEntry[] = [];
  const seen = new Set<string>();
  const onTerm = (entry: RunGlossaryEntry): boolean => {
    if (entry.forms.includes(subject) || entry.term === subject) return false;
    if (seen.has(entry.id)) return true;
    if (entries.length >= MAX_GLOSSARY_TERMS) return false;
    seen.add(entry.id);
    entries.push(entry);
    return true;
  };
  const content = markNode(children, 0, 'kw', onTerm);
  return { content, entries };
}
