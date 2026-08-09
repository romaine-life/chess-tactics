// @ts-nocheck -- source-structure guard alongside the behavioural checks; node built-ins are
// outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LIFTED_UNIT_OPACITY,
  PLANNED_UNIT_OPACITY,
  plannedUnitOpacity,
} from '../render/SkirmishBoard';

const runScreen = readFileSync(new URL('./RunScreen.tsx', import.meta.url), 'utf8');
const appStyles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

const planned = (ids: string[]) => new Set(ids);

describe('a formation picked back up leaves a shadow behind', () => {
  // ADR-0533 draws a seated formation at exactly the strength the carried one is drawn at. That
  // is right while they are DIFFERENT formations and wrong the moment they are the same one:
  // moving a formation already on the board painted it twice, identically, and neither copy said
  // which one the player was deciding about.
  it('draws a lifted unit quieter than a plain seated one', () => {
    expect(LIFTED_UNIT_OPACITY).toBeLessThan(PLANNED_UNIT_OPACITY);
    expect(plannedUnitOpacity('u1', planned(['u1']), new Set())).toBe(PLANNED_UNIT_OPACITY);
    expect(plannedUnitOpacity('u1', planned(['u1']), planned(['u1']))).toBe(LIFTED_UNIT_OPACITY);
  });

  // A lifted unit is still PLANNED — it stays out of the arrival ledger, so picking it up and
  // putting it down spends no entrance. Lifting only changes the strength it is drawn at.
  it('leaves a live piece to the live board', () => {
    expect(plannedUnitOpacity('u1', new Set(), new Set())).toBeNull();
    const skirmishBoard = readFileSync(new URL('../render/SkirmishBoard.tsx', import.meta.url), 'utf8');
    expect(skirmishBoard).toContain('livePieces.filter((piece) => !plannedPieceIds.has(piece.id))');
    expect(skirmishBoard).not.toContain('!liftedPieceIds.has(piece.id))');
  });

  // The whole point of the field: the seats a formation was picked UP from, not every seat it
  // holds. A card merely selected is resting on the board and is drawn as any other plan.
  it('lifts only the formation actually in hand, and only while it is being carried', () => {
    expect(runScreen).toContain('const liftedPieceIds = useMemo(() => new Set(');
    expect(runScreen).toContain('pointedArrangementOption && selectedArrangementCard?.placed');
    expect(runScreen).toContain(
      'runCardUnitIds(selectedArrangementCard.card).filter((unitId) => layout.placements[unitId])',
    );
    expect(runScreen).toContain('liftedPieceIds,');
  });

  // The ground stays marked: it is still this formation's plot until the player seats it
  // somewhere else, and it is where the formation returns to if they never do.
  it('keeps the vacated plot drawn, receded', () => {
    expect(runScreen).toContain(
      'const lifted = !carriedEdges && seated?.cardId === selectedCardId && liftedPieceIds.size > 0;',
    );
    expect(runScreen).toContain("lifted ? 'is-formation-lifted' : ''");
    const rule = appStyles.match(
      /\.run-deployment-cell\.is-formation-lifted \.run-formation-group-paint \{[^}]*\}/,
    )?.[0];
    expect(rule).toBeTruthy();
    expect(rule).toMatch(/opacity: \.\d+;/);
    // The plot recedes; it does not vanish. A block that disappeared on pickup would say the
    // formation had been taken off the board rather than lifted off it.
    expect(rule).not.toContain('display: none');
  });

  // Pointing at a seated formation lifts its plot to say "this is one thing you may pick up".
  // The formation already IN HAND has been picked up, so that invitation is not offered again.
  it('does not also paint the vacated plot as hoverable', () => {
    expect(runScreen).toContain('!lifted && !carriedEdges && seated && hoveredFormationCardId === seated.cardId');
  });
});
