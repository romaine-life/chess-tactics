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

  // The gesture exists to spin the formation on the square being aimed at. Clearing the hover
  // the way the rail buttons do would blank the preview until the mouse was jiggled.
  it('turns the formation under the cursor without dropping the aimed square', () => {
    const turn = runScreen.match(
      /const turnArrangementUnderCursor = useCallback\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/,
    )?.[0];

    expect(turn).toBeDefined();
    expect(turn).toContain('nextCardRotation(availableArrangementRotationList, current)');
    expect(turn).not.toContain('setHoveredArrangementAnchor');
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
    expect(runScreen).toContain('Right-click the battlefield to turn it without leaving the square.');
  });
});
