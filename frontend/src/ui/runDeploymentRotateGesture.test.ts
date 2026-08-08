// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewPane = readFileSync(new URL('./shared/ViewPane.tsx', import.meta.url), 'utf8');
const skirmishBoard = readFileSync(new URL('../render/SkirmishBoard.tsx', import.meta.url), 'utf8');
const skirmish = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');
const runScreen = readFileSync(new URL('./RunScreen.tsx', import.meta.url), 'utf8');

describe('Run Deployment secondary-click turn', () => {
  // ADR-0128 kept the secondary DRAG pan-only because the board is wall-to-wall hit targets.
  // A press that never moved carried no navigation, and that is the only part claimed here.
  it('claims only a secondary release that never became a pan', () => {
    expect(viewPane).toContain('onPointerDownCapture={startSecondaryPan}');
    expect(viewPane).toContain('secondary: event.button === 2,');
    expect(viewPane).toMatch(
      /if \(!didDragRef\.current && drag\.secondary\) \{\s*onSecondaryClick\?\.\(\);\s*\}/,
    );
    // The pan itself is untouched: movement past the threshold still marks the gesture a drag.
    expect(viewPane).toContain(
      'if (exceedsViewPanePanThreshold(event.clientX - drag.startX, event.clientY - drag.startY)) {',
    );
    expect(viewPane).toContain('didDragRef.current = true;');
  });

  it('carries the gesture from the shared viewport to the Deployment board', () => {
    expect(skirmishBoard).toContain('onSecondaryClick?: () => void;');
    expect(skirmishBoard).toContain('onSecondaryClick={onSecondaryClick}');
    expect(skirmish).toContain('onBoardSecondaryClick?: () => void;');
    expect(skirmish).toContain('onSecondaryClick={runDeployment?.onBoardSecondaryClick}');
  });

  // The gesture exists to spin the formation on the square being aimed at. Clearing the pointed
  // square the way the rail buttons do would blank the preview until the mouse was jiggled.
  it('turns the formation under the cursor without dropping the aimed square', () => {
    const turn = runScreen.match(
      /const turnArrangementUnderCursor = useCallback\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/,
    )?.[0];

    expect(turn).toBeDefined();
    expect(turn).toContain('nextCardRotation(availableArrangementRotationList, current)');
    expect(turn).not.toContain('setPointedArrangementCell');
    // Nothing is committed by the gesture — placement stays on the primary button.
    expect(turn).not.toContain('placeArrangedDeploymentCard');
    expect(turn).not.toContain('removeArrangedDeploymentCard');
    expect(turn).not.toContain('replace(');
  });

  it('offers the gesture only while a dealt formation is waiting to be placed', () => {
    expect(runScreen).toMatch(
      /onBoardSecondaryClick: stage === 'arrange' && selectedArrangementCard\?\.admitted\s*\? turnArrangementUnderCursor\s*: undefined,/,
    );
    // The rail and the gesture walk one ordered list, so a clicked turn is always a pressable one.
    expect(runScreen).toContain('const availableArrangementRotationList = useMemo<readonly RunFormationRotation[]>');
    expect(runScreen).toContain('new Set<RunFormationRotation>(availableArrangementRotationList),');
    expect(runScreen).toContain("? ' Right-click to turn it.' : ''");
  });
});

describe('Run Deployment aiming', () => {
  // The old model highlighted legal ANCHORS — the corner of the shape's bounding box. For any
  // formation that is not a solid rectangle that corner is a square no unit stands on, so
  // placing His Grace meant clicking the hole in its own L.
  it('takes the pointer on every square, and resolves the seating from it', () => {
    expect(runScreen).toContain('const placeable = arrangementPlaceableCells.has(cellKey);');
    expect(runScreen).toContain('const filled = arrangementFootprint.has(cellKey);');
    expect(runScreen).toContain('onPointerEnter={() => setPointedArrangementCell(cellKey)}');
    // No survivor of the anchor-hunting model.
    expect(runScreen).not.toContain('Place formation from');
    expect(runScreen).not.toContain('hoveredArrangementAnchor');
    expect(runScreen).not.toMatch(/arrangementPlacementOptions\.find\(\(\{ anchor \}\)/);
  });

  it('lights the squares the formation will occupy rather than an anchor square', () => {
    expect(runScreen).toContain("filled ? 'is-move' : ''");
    expect(runScreen).toContain('{filled ? <PredrawnMoveHighlightPaint /> : null}');
    expect(runScreen).toMatch(
      /const arrangementFootprint = useMemo\(\(\) => new Set\(\s*Object\.values\(pointedArrangementOption\?\.placements \?\? \{\}\)/,
    );
  });

  // A click must commit the same seating the player was shown, resolved from the same square.
  it('commits the seating that was previewed under the pointer', () => {
    expect(runScreen).toMatch(
      /const seating = arrangedCardPlacementAtCell\(\s*latest,\s*level,\s*selectedCardId,\s*arrangementRotation,\s*cell,\s*\);/,
    );
    expect(runScreen).toContain('if (!seating) return;');
    expect(runScreen).toContain('seating.anchor,');
  });

  // While the formation is the cursor, the pointer hides under it; when no seating resolves the
  // pointer comes back, so the player is never left with neither.
  it('hides the pointer only while a seating is resolved', () => {
    expect(runScreen).toMatch(
      /boardClassName: pointedArrangementOption\s*\? 'run-deployment-board is-carrying-formation'\s*: 'run-deployment-board',/,
    );
    const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(styles).toContain('.run-deployment-board.is-carrying-formation .run-deployment-cell {');
    expect(styles).toContain('cursor: none;');
    expect(styles).toContain('.run-deployment-cell.is-placeable {');
  });
});
