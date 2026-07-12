// Solver HelpBar — port of bender-world's HelpBar.tsx (the hover-help + S-to-pin + "See in
// Glossary" learning layer), restyled as Studio chrome via SOLVER_CSS classes (no bender
// colors.ts). Any element in the solver surface can carry `data-help` (the sentence shown
// here on hover) and optionally `data-help-glossary` (a SOLVER_GLOSSARY term id — while the
// help is pinned with S, a "See in Glossary →" link appears and jumps to that entry).

import { useEffect, useRef, useState, type ReactElement } from 'react';

const DEFAULT_TEXT = 'Hover over any control, counter or badge to see what it means. Press S to pin the help text.';

export function SolverHelpBar({ onOpenGlossary }: { onOpenGlossary?: (termId: string) => void }): ReactElement {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [held, setHeld] = useState(false);
  const [glossaryTerm, setGlossaryTerm] = useState<string | null>(null);
  const heldRef = useRef(false);
  const lastMouseX = useRef(0);
  const lastMouseY = useRef(0);

  useEffect(() => {
    const glossaryTermFromElement = (el: Element | null): string | null => {
      const target = (el as HTMLElement | null)?.closest?.('[data-help-glossary]');
      return target ? (target as HTMLElement).dataset.helpGlossary! : null;
    };

    const handleMouseOver = (e: MouseEvent): void => {
      if (heldRef.current) return;
      const target = (e.target as HTMLElement).closest?.('[data-help]');
      setText(target ? (target as HTMLElement).dataset.help! : DEFAULT_TEXT);
      setGlossaryTerm(glossaryTermFromElement(e.target as Element));
    };

    const fromPoint = (x: number, y: number): { text: string; term: string | null } => {
      const el = document.elementFromPoint(x, y);
      const helpTarget = (el as HTMLElement | null)?.closest?.('[data-help]');
      return {
        text: helpTarget ? (helpTarget as HTMLElement).dataset.help! : DEFAULT_TEXT,
        term: glossaryTermFromElement(el),
      };
    };

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 's' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey
        && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
          || e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        heldRef.current = !heldRef.current;
        setHeld(heldRef.current);
        if (!heldRef.current) {
          const { text: t, term } = fromPoint(lastMouseX.current, lastMouseY.current);
          setText(t);
          setGlossaryTerm(term);
        }
      }
    };

    const handleMouseMove = (e: MouseEvent): void => {
      lastMouseX.current = e.clientX;
      lastMouseY.current = e.clientY;
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  return (
    <div className="solver-helpbar">
      {held ? <span className="solver-helpbar-pin">HELD</span> : null}
      <span className="solver-helpbar-text">{text}</span>
      {held && glossaryTerm && onOpenGlossary ? (
        <button type="button" className="solver-helpbar-link" onClick={() => onOpenGlossary(glossaryTerm)}>
          See in Glossary →
        </button>
      ) : null}
    </div>
  );
}
