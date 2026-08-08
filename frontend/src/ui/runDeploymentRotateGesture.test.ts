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
    expect(turn).toContain('nextCardRotation(turnableArrangementRotationList, current)');
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

  // Placing finishes with a formation. The hand must move on by itself, and it must read the
  // document it just wrote — the render-time card list is a placement behind.
  it('hands the next formation to the cursor once one is seated', () => {
    expect(runScreen).toContain('const following = nextArrangedCardToPlace(placed, selectedCardId);');
    expect(runScreen).toMatch(
      /if \(following\) \{\s*setSelectedCardId\(following\);\s*setArrangementRotation\(0\);\s*\}/,
    );
    // Advancing must NOT clear the pointed square: the next formation appears under the cursor.
    const click = runScreen.match(/const placed = placeArrangedDeploymentCard\([\s\S]*?\n {10}\}\}/)?.[0];
    expect(click).toBeDefined();
    expect(click).not.toContain('setPointedArrangementCell');
  });

  // Turning walked the band-wide list, so a turn with no seating over the pointed square blanked
  // the formation the player was holding.
  it('turns through the square\'s own list so the formation cannot vanish', () => {
    expect(runScreen).toMatch(
      /const turnableArrangementRotationList = useMemo<readonly RunFormationRotation\[\]>\(\(\) => \{[\s\S]*?const atCell = cardRotationsAtCell\(prepared, level, selectedCardId, pointedCell\);[\s\S]*?return atCell\.length \? atCell : availableArrangementRotationList;/,
    );
    // Off the board there is no square to preserve, so the rail's own list applies.
    expect(runScreen).toContain('if (!selectedCardId || !pointedCell) return availableArrangementRotationList;');
    // The RAIL stays band-wide — its buttons must not flicker as the cursor moves.
    expect(runScreen).toMatch(/availableRotations=\{availableArrangementRotations\}/);
  });

  // With nothing seated the board went dark, so a turn that found no seating left the player
  // looking at bare ground with no sign of where they could deploy.
  it('keeps the deployable band painted whether or not a seating resolves', () => {
    const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

    // One paint, two strengths — the band under the seating, never a second treatment.
    expect(runScreen).toContain('<PredrawnMoveHighlightPaint />');
    expect(runScreen).not.toContain('{filled ? <PredrawnMoveHighlightPaint /> : null}');
    expect(styles).toContain('.run-deployment-cell.is-placeable > .predrawn-cyan-move-highlight-paint {');
    const band = styles.match(
      /\.run-deployment-cell\.is-placeable > \.predrawn-cyan-move-highlight-paint \{\s*opacity: ([\d.]+);/,
    );
    expect(band).toBeTruthy();
    expect(Number(band[1])).toBeGreaterThan(0);
    expect(Number(band[1])).toBeLessThan(1);
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
