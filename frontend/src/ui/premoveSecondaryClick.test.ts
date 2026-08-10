// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSkirmishStore } from '../game/store';
import { exceedsViewPanePanThreshold } from './shared/ViewPane';

const skirmishBoard = readFileSync(new URL('../render/SkirmishBoard.tsx', import.meta.url), 'utf8');
const viewPane = readFileSync(new URL('./shared/ViewPane.tsx', import.meta.url), 'utf8');

const piece = (id, side, type, x, y) => ({ id, side, type, x, y, alive: true, startY: y });

/** A board on the OPPONENT's turn — the window in which a premove chain can be built. */
function waitingBoard() {
  const store = createSkirmishStore();
  store.setState({
    game: {
      size: { cols: 8, rows: 8 },
      pieces: [
        piece('pr', 'player', 'rook', 0, 0),
        piece('pk', 'player', 'king', 0, 7),
        piece('ek', 'enemy', 'king', 7, 7),
      ],
      turn: 'enemy',
      winner: null,
    },
    env: { terrain: undefined, lastMove: undefined },
    objective: 'capture-king',
    objectiveCtx: { kingSide: 'enemy' },
    log: [],
  });
  return store;
}

describe('taking a premove chain back', () => {
  it('drops the whole chain, exactly as Escape does', () => {
    const store = waitingBoard();
    store.getState().queueMove('pr', 0, 5);
    store.getState().queueMove('pr', 3, 5);
    expect(store.getState().premoves).toHaveLength(2);

    store.getState().clearPremoves();

    expect(store.getState().premoves).toEqual([]);
  });

  // The gesture is available on every square of a board covered in hit targets, so on a board
  // with nothing queued it has to be a non-event rather than a quiet state change.
  it('is not an event at all when there is nothing queued', () => {
    const store = waitingBoard();
    const before = store.getState();

    before.clearPremoves();

    expect(store.getState()).toBe(before);
  });
});

describe('the right click that takes it back', () => {
  // ADR-0128 gave the secondary button to the viewport because the board is wall-to-wall hit
  // targets, and the pan threshold is the ONLY thing separating a camera move from a take-back.
  // So the take-back hangs off the seam that applies that threshold — never off a context menu,
  // which fires at the end of a pan too and would clear the chain the player just panned to see.
  it('hangs off the press that never panned, not on a context menu', () => {
    expect(skirmishBoard).toContain('onSecondaryClick={secondaryClick}');
    expect(skirmishBoard).not.toContain('onContextMenu');
    expect(viewPane).toMatch(
      /if \(!didDragRef\.current && drag\.secondary\) \{\s*onSecondaryClick\?\.\(\);\s*\}/,
    );
  });

  it('takes back what Escape takes back, through the same store action', () => {
    const takeBack = skirmishBoard.match(
      /const takeBackPremoves = useCallback\(\(\) => \{[\s\S]*?\n {2}\}, \[[^\]]*\]\);/,
    )?.[0];

    expect(takeBack).toBeDefined();
    // A read-only board has no chain of its own to take back.
    expect(takeBack).toContain('if (!interactionEnabled) return;');
    // The same pair Escape drops: the queued chain, and the selection that was building it.
    expect(takeBack).toContain('clearPremoves();');
    expect(takeBack).toContain('setPremoveSelectedId(null);');
    // And nothing else. A gesture told apart from a pan by four pixels may take back what the
    // player has not played yet; it may never commit, capture, or spend anything (ADR-0550).
    for (const forbidden of ['tryMoveTo', 'queueMove', 'adminKillUnit', 'select(', 'resign']) {
      expect(takeBack).not.toContain(forbidden);
    }
  });

  // Deployment carries a formation on the cursor and turns it with this same press (ADR-0526),
  // so a phase that claims the button keeps it; the take-back is only the unclaimed default.
  it('yields the button to a phase that carries something on the cursor', () => {
    expect(skirmishBoard).toContain('const secondaryClick = onSecondaryClick ?? takeBackPremoves;');
  });

  // A press that MOVED is navigation and nothing else — the chain has to survive it.
  it('leaves a right DRAG as pure navigation', () => {
    expect(exceedsViewPanePanThreshold(0, 0)).toBe(false);
    expect(exceedsViewPanePanThreshold(60, 0)).toBe(true);
    expect(viewPane).toContain(
      'if (exceedsViewPanePanThreshold(event.clientX - drag.startX, event.clientY - drag.startY)) {',
    );
    expect(viewPane).toContain('didDragRef.current = true;');
  });
});
