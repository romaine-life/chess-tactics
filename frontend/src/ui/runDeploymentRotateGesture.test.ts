// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const viewPane = readFileSync(new URL('./shared/ViewPane.tsx', import.meta.url), 'utf8');
const skirmishBoard = readFileSync(new URL('../render/SkirmishBoard.tsx', import.meta.url), 'utf8');
const skirmish = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');
const runScreen = readFileSync(new URL('./RunScreen.tsx', import.meta.url), 'utf8');
const formationKeys = readFileSync(new URL('./formationKeys.ts', import.meta.url), 'utf8');
const appStyles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const runDeployment = readFileSync(
  new URL('../../../packages/board-render/src/run/deployment.ts', import.meta.url),
  'utf8',
);

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
    expect(skirmishBoard).toContain('onSecondaryClick={secondaryClick}');
    // Deployment carries a formation on the cursor, so it OWNS the button while it is arranging;
    // the board's own premove take-back (ADR-0549) is only the fallback.
    expect(skirmishBoard).toContain('const secondaryClick = onSecondaryClick ?? takeBackPremoves;');
    expect(skirmish).toContain('onBoardSecondaryClick?: () => void;');
    expect(skirmish).toContain('onSecondaryClick={runDeployment?.onBoardSecondaryClick}');
  });

  // The gesture exists to spin the formation on the square being aimed at. Clearing the pointed
  // square the way the rail buttons do would blank the preview until the mouse was jiggled.
  it('turns the formation under the cursor without dropping the aimed square', () => {
    const turn = runScreen.match(
      /const turnArrangement = useCallback\(\(direction: FormationTurnDirection\) => \{[\s\S]*?\n {2}\]\);/,
    )?.[0];

    expect(turn).toBeDefined();
    // Where a turn lands and which box it holds are ONE decision, and it is the Run's, not the
    // screen's — see cardTurn and its tests in run/deployment.
    expect(turn).toMatch(
      /const turn = cardTurn\(\s*prepared,\s*level,\s*cardInHandId,\s*arrangementRotation,\s*direction,\s*heldAnchor,\s*pointedCell,\s*\);/,
    );
    expect(turn).toContain('if (!turn) return;');
    expect(turn).toContain('setArrangementRotation(turn.rotation);');
    expect(turn).not.toContain('setPointedArrangementCell');
    // Nothing is committed by a turn — placement stays on the primary button.
    expect(turn).not.toContain('placeArrangedDeploymentCard');
    expect(turn).not.toContain('removeArrangedDeploymentCard');
    expect(turn).not.toContain('replace(');
    // The secondary click is one direction of the same verb, never a second implementation.
    expect(runScreen).toMatch(
      /const turnArrangementUnderCursor = useCallback\(\(\) => \{\s*turnArrangement\('clockwise'\);\s*\}, \[turnArrangement\]\);/,
    );
  });

  it('offers the gesture only while a dealt formation is waiting to be placed', () => {
    // ...and only while that formation is IN HAND. One resting on the board has nothing to turn
    // until it is picked up (ADR-0542).
    expect(runScreen).toMatch(
      /onBoardSecondaryClick: stage === 'arrange' && selectedArrangementCard\?\.admitted && cardInHandId\s*\? turnArrangementUnderCursor\s*: undefined,/,
    );
    // The rail and the gesture walk one ordered list, so a clicked turn is always a pressable one.
    expect(runScreen).toContain('const availableArrangementRotationList = useMemo<readonly RunFormationRotation[]>');
    expect(runScreen).toContain('new Set<RunFormationRotation>(availableArrangementRotationList),');
    expect(runScreen).toContain("? ' Right-click turns it too.' : ''");
  });

  // The pointer gesture turns one way only, so overshooting a quarter turn meant three more
  // presses to get back. Q and E supply both directions of the same verb.
  it('binds Q/E to the turn and W/S to the hand, on the same terms as the controls', () => {
    expect(runScreen).toContain(
      "import { useFormationKeys, type FormationTurnDirection } from './formationKeys';",
    );
    expect(runScreen).toMatch(
      /useFormationKeys\(\{\s*turn: arranging && selectedArrangementCard\?\.admitted && cardInHandId \? turnArrangement : null,\s*step: arranging \? stepArrangementCard : null,\s*begin: arranging \? startArrangedBattle : null,\s*\}\);/,
    );
    // Turning needs a formation in hand; stepping is how one is CHOSEN, so it stays available
    // even while the selection is settling.
    expect(runScreen).toContain("const arranging = stage === 'arrange' && !departureActive;");
    // Both turn directions walk the same list the click does, so no key can turn the formation
    // out of sight either.
    expect(runScreen).not.toMatch(/useFormationKeys\([^)]*availableArrangementRotationList/);
  });

  // Space is the key a player presses without looking, so it is the one that leaves the screen.
  // It is bound for the WHOLE arranging stage rather than only while Begin Battle is pressable:
  // Space natively activates the focused control, and after a placement that is the board square
  // just clicked, which would seat or take back a formation nobody aimed at.
  it('confirms the arrangement on Space through the same action the button runs', () => {
    const begin = runScreen.match(
      /const startArrangedBattle = useCallback\(\(\) => \{[\s\S]*?\n {2}\}, \[[^\]]*\]\);/,
    )?.[0];

    expect(begin).toBeDefined();
    // The key honours the guard the button's `disabled` honours, read off the LATEST run.
    expect(begin).toContain('arrangedDeploymentCanBegin(latest)');
    expect(begin).toContain('replace(beginArrangedBattle(latest));');
    expect(begin).toContain('if (departureActive) return;');
    // One action for the key and the button — never a second path into Battle.
    expect(runScreen).toContain('onBeginBattle={startArrangedBattle}');
    expect((runScreen.match(/beginArrangedBattle\(/g) ?? [])).toHaveLength(1);
    // The listener claims Space so nothing underneath answers it.
    expect(formationKeys).toContain("case ' ': case 'spacebar': return { kind: 'begin' };");
    expect(formationKeys).toMatch(/if \(action\.kind === 'begin' && !begin\) return;\s*if \(deleteKeyIsClaimedByPage/);
    expect(formationKeys).toContain('event.preventDefault();');
  });

  // The keyboard is discovered from the control, so the primary action wears its key too — and
  // keeps the button's own text size while doing it.
  it('wears the Space cap on Begin Battle without shrinking it', () => {
    expect(runScreen).toMatch(
      /data-testid="arrangement-begin-battle"[\s\S]*?<kbd className="skirmish-grid-cap">Space<\/kbd>\s*<span className="skirmish-grid-label">Begin Battle<\/span>/,
    );
    expect(runScreen).toContain("'run-arrangement-begin'");
    expect(appStyles).toMatch(/\.run-arrangement-begin,\s*\.run-arrangement-step,/);
    expect(appStyles).toMatch(
      /\.run-arrangement-begin \.skirmish-grid-label \{\s*font-size: inherit;/,
    );
  });
});

describe('Run Deployment hand', () => {
  const hand = readFileSync(new URL('./RunArrangementHand.tsx', import.meta.url), 'utf8');
  const cardStack = readFileSync(new URL('./RunDeploymentCardStack.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

  // A formation card is read by its SHAPE, so laying the whole hand out at once squeezed away
  // the only information on it — and steppers either side took width the card needed.
  it('gives the card the whole panel width and seats its steppers under it', () => {
    expect(hand).toContain('data-testid="arrangement-hand-card"');
    expect(hand).toContain('aria-label="Previous formation"');
    expect(hand).toContain('aria-label="Next formation"');
    expect(hand).toContain('onClick={() => onStep(-1)}');
    expect(hand).toContain('onClick={() => onStep(1)}');
    // The steppers are a row of their own BELOW the card, not columns flanking it — and a
    // component of their own, because the card is PINNED and only they scroll.
    expect(hand).toContain('export function RunArrangementCard(');
    expect(hand).toContain('export function RunArrangementSteppers(');
    expect(styles).toContain('.run-arrangement-steppers {');
    expect(runScreen).toMatch(
      /<RunArrangementCard run=\{run\} cards=\{cards\} selectedCardId=\{selectedCardId\} \/>\s*\) : null\}/,
    );
    // ...and the steppers are inside that rail, so they move while the card holds still.
    expect(runScreen).toMatch(/<KitScroll className="run-arrangement-scroll">[\s\S]*?<RunArrangementSteppers/);
    // No survivor of the grid that squeezed them, nor of the strip that flanked the card.
    expect(hand).not.toContain('run-arrangement-hand-cards');
    expect(hand).not.toContain('run-arrangement-hand-strip');
    expect(hand).not.toContain('cards.map(');
    expect(styles).not.toContain('.run-arrangement-hand-cards');
    expect(styles).not.toContain('.run-arrangement-hand-strip');
  });

  // Begin Battle asks only for His Grace, and the hand shows one card at a time, so nothing else
  // on screen answered "have I put everyone down?".
  //
  // The answer is the BUTTON. It used to be a line of its own under the card, which read as the
  // thing to press once it said the hand was down, and was not pressable — the sentence a player
  // wants to act on and the control that acts are one control.
  it('says how much of the hand is on the board on the control that acts on it', () => {
    expect(runScreen).toContain('data-testid="arrangement-progress"');
    // It took over the row that used to read Place/Placed for the card on screen — which said
    // nothing the board and an enabled Remove formation were not already saying.
    expect(hand).not.toContain('run-arrangement-card-state');
    expect(hand).not.toContain("'Placed' : 'Place'");
    expect(styles).not.toContain('.run-arrangement-card-state');
    expect(runScreen).toContain("data-complete={progress.complete ? 'true' : 'false'}");
    expect(runScreen).toContain("{progress.complete ? '✓' : '·'}");
    expect(runScreen).toContain('`All ${progress.total} on the board`');
    expect(runScreen).toContain('`${progress.placed} of ${progress.total} on the board`');
    // Counted ONCE, by the Run's own helper — reserves cannot be placed this Battle, so
    // completion counts only the admitted hand, and the panel does not recount it.
    expect(runScreen).toContain('const progress = arrangedDeploymentProgress(run);');
    expect(hand).not.toContain('const complete =');
    // The reading and the action are one control, not two things side by side.
    expect(runScreen).toMatch(
      /data-testid="arrangement-begin-battle"[\s\S]*?data-testid="arrangement-progress"[\s\S]*?<\/ChromeButton>/,
    );
    // Always rendered, changing state rather than appearing: a line that arrived on completion
    // would re-lay the panel at the moment the player is reading it.
    expect(runScreen).not.toMatch(/\{progress\.complete \? \(\s*<span\s*className=\{?`?run-arrangement-progress/);
    expect(styles).toMatch(/\.run-arrangement-progress\.is-complete \{\s*color: var\(--good\);\s*\}/);
  });

  // Below the card, the steppers, the turns and Remove there was no height left in the rail, so
  // the one control that leaves the screen sat under the fold: the player finished arranging and
  // had nothing to press.
  it('pins Begin Battle to the foot of the panel, outside the rail', () => {
    expect(runScreen).toMatch(
      /<\/KitScroll>\s*\{\/\*[\s\S]*?\*\/\}\s*<div className="skirmish-view-group run-arrangement-begin-group">/,
    );
    expect(runScreen).toMatch(
      /run-arrangement-begin-group"[\s\S]*?data-testid="arrangement-begin-battle"/,
    );
    // Pinned means it does not shrink with the rail's content.
    expect(styles).toMatch(/\.run-arrangement-begin-group \{[^}]*flex: 0 0 auto;/);
    // No survivor in the rail — one Begin Battle, never two paths into the same action.
    expect((runScreen.match(/data-testid="arrangement-begin-battle"/g) ?? [])).toHaveLength(1);
  });

  // Stepping through a hand gave no way to tell an unplaced formation from one already seated:
  // the card shows one at a time, and the counter it replaced said only where the player stood.
  it('marks which dealt formations are already on the board', () => {
    expect(hand).toContain('className="run-arrangement-hand-marks"');
    expect(hand).toContain("data-placed={placed ? 'true' : 'false'}");
    expect(hand).toContain("data-current={current ? 'true' : 'false'}");
    expect(hand).toContain("{placed ? '●' : '○'}");
    // Reserves cannot be placed this Battle, so the row is the admitted hand.
    expect(hand).toMatch(/const admitted = admittedCards\(cards\);[\s\S]*?admitted\.map\(\(\{ card, placed \}, position\) =>/);
    // Seeing the one you want and going to it are the same act.
    expect(hand).toContain('onClick={() => onSelect(card.id)}');
    expect(runScreen).toContain('onSelectCard={selectArrangementCard}');
    expect(runScreen).toContain('onSelect={onSelectCard}');
    // Placed is the good colour; the one in hand is the brightest thing in the row.
    expect(styles).toMatch(
      /\.run-arrangement-hand-mark\[data-placed='true'\] \{\s*color: var\(--good\);\s*\}/,
    );
    expect(styles).toContain(".run-arrangement-hand-mark[data-current='true'] {");
    // No survivor of the bare counter it replaced.
    expect(hand).not.toContain('run-arrangement-hand-position"');
    expect(hand).not.toMatch(/\$\{Math\.max\(index, 0\) \+ 1\} \/ \$\{admitted\.length\}/);
    expect(styles).not.toContain('.run-arrangement-hand-position {');
  });

  // The deal used to land inside the RAIL, in a pile a third of the card's width, so the hand
  // jumped across the panel and more than doubled in size the instant dealing finished. The
  // deal reads its target rect off this pile, so the pile must be the card's box exactly.
  it('lands the deal in the very seat the arranging card takes over', () => {
    // Both are pinned above the rail, in the same place, and neither is inside it.
    expect(runScreen).toMatch(
      /<RunArrangementCard[^/]*\/>\s*\) : null\}\s*\{stage === 'await-deal' \|\| stage === 'dealing' \? \(\s*<RunDeploymentCardStack/,
    );
    expect(runScreen).toMatch(
      /<RunDeploymentCardStack[\s\S]*?\/>\s*\) : null\}\s*<KitScroll className="run-arrangement-scroll">/,
    );
    // The pile is the panel's whole width, the same width the card takes. Bounded to the rule's
    // own block — `[\s\S]*?` walks straight past the closing brace into the next rule.
    expect(styles).toMatch(/\.run-deployment-card-pile \{[^}]*inline-size: 100%;/);
    expect(styles).not.toMatch(/\.run-deployment-card-pile \{[^}]*inline-size: clamp\(/);
    // Nothing above or around the pile may push the landing off the card's box.
    expect(styles).toMatch(/\.run-deployment-card-stack \{[^}]*padding: 0;/);
    expect(styles).not.toMatch(/\.run-deployment-card-stack \{[^}]*min-block-size:/);
    expect(cardStack).not.toContain('<span className="skirmish-eyebrow">Cards</span>');
    // ...the card's own label included: it was spending the height the card wanted.
    expect(hand).not.toContain('Dealt formations');
  });

  // A control that appears and disappears re-lays the panel under the player's hand.
  it('keeps Remove formation on screen, greyed until there is one to remove', () => {
    expect(runScreen).toContain('data-testid="arrangement-remove-formation"');
    expect(runScreen).toContain('disabled={!arranging || departing || !selected?.placed}');
    // It is never conditionally rendered.
    expect(runScreen).not.toMatch(/\{selected\.placed \? \(\s*<ChromeButton/);
  });

  // Building the panel as the cards landed re-laid the whole of it under the player at the one
  // moment they were watching it, and made the arrival read as a different screen. Everything the
  // panel will hold is known when Deployment is prepared, so it is DRESSED from the start.
  it('holds every control from before the draw, answering nothing until the hand arrives', () => {
    expect(runScreen).toContain("const arranging = stage === 'arrange';");
    expect(runScreen).toContain("const turnable = arranging && Boolean(selected?.admitted);");
    // Steppers, turns, Remove and Begin Battle are all present whatever the stage...
    expect(runScreen).toContain('disabled={!arranging}');
    expect(runScreen).toContain('disabled={!turnable || departing || availableRotations.size < 2}');
    // ...and none of them is gated on the stage or on there being a formation in hand.
    expect(runScreen).not.toMatch(/\{stage === 'arrange' \? \(\s*<>\s*<RunArrangementSteppers/);
    expect(runScreen).not.toMatch(/\{selected\?\.admitted \? \(/);
    expect(runScreen).not.toMatch(/\{stage === 'arrange' \? \(\s*<div className="skirmish-view-group run-arrangement-begin-group"/);
    // The rotation group and the pinned Begin foot are rendered flat, once.
    expect((runScreen.match(/data-testid="arrangement-rotation-control"/g) ?? [])).toHaveLength(1);
    expect((runScreen.match(/run-arrangement-begin-group/g) ?? [])).toHaveLength(1);
    // The count answers before the draw too, which is what lets the foot be dressed rather than
    // built: the hand's size is settled when Deployment is prepared.
    expect(runScreen).toContain('const progress = arrangedDeploymentProgress(run);');
  });

  // The Run's leaf controls carry the installed oak fill, offset per control so neighbours do
  // not repeat one another's grain.
  it('gives every control on the panel the installed wooden fill', () => {
    expect(hand).toContain("import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';");
    // Both steppers, both turns, Remove, Begin Battle and Abandon — nothing bare.
    expect((hand.match(/data-chrome-fill-surface=\{CHROME_LEAF_FILL_SURFACE\}/g) ?? [])).toHaveLength(2);
    const panel = runScreen.match(
      /className="run-meta-controls run-deployment-controls run-arrangement-controls"[\s\S]*?\n {6}<\/section>/,
    )?.[0];
    expect(panel).toBeDefined();
    const buttons = panel.match(/<ChromeButton\b/g) ?? [];
    const filled = panel.match(/data-chrome-fill-surface=\{CHROME_LEAF_FILL_SURFACE\}/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    expect(filled).toHaveLength(buttons.length);
    // Each carries its own index into the surface, so no two neighbours sample the same grain.
    const indices = [...panel.matchAll(/'--run-leaf-control-index' as string\]: (\d+)/g)]
      .map(([, value]) => Number(value));
    expect(indices).toHaveLength(buttons.length);
    expect(new Set(indices).size).toBe(indices.length);
  });

  // Every control that has a key wears it, in the cap the in-match shortcut grid already uses,
  // so the keyboard is discovered from the control rather than from a hint.
  it('wears the shortcut key on the control that shares it', () => {
    for (const [key, label] of [['W', 'Back'], ['S', 'Next']]) {
      expect(hand).toContain(`<kbd className="skirmish-grid-cap">${key}</kbd>`);
      expect(hand).toContain(`<span className="skirmish-grid-label">${label}</span>`);
    }
    for (const [key, label] of [['Q', 'Left'], ['E', 'Right']]) {
      expect(runScreen).toContain(`<kbd className="skirmish-grid-cap">${key}</kbd>`);
      expect(runScreen).toContain(`<span className="skirmish-grid-label">${label}</span>`);
    }
  });

  // Four absolute angles became two turns: the formation on the board already shows which way it
  // faces, so the control is the VERB — and it is the same verb the keys and the click run.
  it('turns from the rail through the one turn verb rather than setting an angle', () => {
    expect(runScreen).toContain("onClick={() => onTurn('counter-clockwise')}");
    expect(runScreen).toContain("onClick={() => onTurn('clockwise')}");
    expect(runScreen).toContain('onTurn: (direction: FormationTurnDirection) => void;');
    expect(runScreen).toContain('onTurn={turnArrangement}');
    // No absolute-angle rail left anywhere.
    expect(runScreen).not.toContain('{value * 90}°');
    // `onRotation` as a prop or handler — not the substring inside `RunFormationRotation`.
    expect(runScreen).not.toMatch(/\bonRotation[=:]/);
    expect(styles).toMatch(
      /\.run-arrangement-rotations \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
    // The rail stays band-wide, so its buttons do not flicker as the cursor moves — and it is
    // present before the hand is, greyed, so the panel does not gain a group as the cards land.
    expect(runScreen).toContain('disabled={!turnable || departing || availableRotations.size < 2}');
  });

  it('steps the hand from the arrows and the keys through one path', () => {
    expect(runScreen).toMatch(
      /const stepArrangementCard = useCallback\(\(step: 1 \| -1\) => \{[\s\S]*?steppedArrangedCard\(arrangementCards, selectedCardId, step\)/,
    );
    expect(runScreen).toContain('onStepCard={stepArrangementCard}');
    expect(runScreen).toContain('onStep={onStepCard}');
  });

  // `pointerenter` does not fire again for a pointer that never moved, so anything that clears
  // the pointed square leaves the new card invisible until the mouse is nudged to a different
  // square. Only the pointer leaving may clear it.
  it('leaves the pointed square to the pointer alone', () => {
    const writes = runScreen.match(/setPointedArrangementCell\([^)]*\)/g) ?? [];

    // Exactly two calls: the pointer entering a square, and the pointer leaving it.
    expect(writes).toHaveLength(2);
    expect(runScreen).toContain(
      'onPointerEnter={() => { setPointedArrangementCell(cellKey); setHeldArrangementAnchor(null); }}',
    );
    expect(runScreen).toContain(
      'onPointerLeave={() => setPointedArrangementCell((current) => current === cellKey ? null : current)}',
    );
    // Changing card, turn, or placement keeps it — each of those still drops the held BOX,
    // which is what makes the new card resolve from the square the cursor is already on.
    for (const owner of [
      /const stepArrangementCard = useCallback\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/,
      /const selectArrangementCard = useCallback\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/,
      /const removeArrangementCard = useCallback\([\s\S]*?\n {2}\}, \[[^\]]*\]\);/,
    ]) {
      const body = runScreen.match(owner)?.[0];
      expect(body).toBeDefined();
      expect(body).not.toContain('setPointedArrangementCell');
      expect(body).toContain('setHeldArrangementAnchor(null);');
    }
  });

  // ADR-0030: the drawn rail is the one scrollbar. The panel must not also scroll, or the
  // browser paints its own bar beside it.
  it('scrolls the controls on the house rail, never the browser bar', () => {
    expect(runScreen).toContain('<KitScroll className="run-arrangement-scroll">');
    expect(styles).toContain('.run-meta-controls.run-arrangement-controls {');
    // Both class names, so this outranks `.run-meta-controls { overflow-y: auto }` whatever the
    // source order — matched on one class it loses and the OS bar comes back.
    expect(styles).toMatch(
      /\.run-meta-controls\.run-arrangement-controls \{[\s\S]*?overflow-y: hidden;[\s\S]*?\}/,
    );
    // The CARD is what is pinned above the rail; everything else scrolls, Abandon Run included.
    // Pinning that took height from the controls the player is actually using, and it is not
    // worth more than them.
    expect(runScreen).toMatch(
      /<div className="skirmish-view-group run-meta-abandon">[\s\S]*?<\/div>\s*<\/KitScroll>/,
    );
    expect(runScreen).not.toMatch(/<\/KitScroll>\s*<div className="skirmish-view-group run-meta-abandon">/);
  });

  // A formation already on the board is still the player's to move. The one exception is the
  // formation already IN HAND: the document still records where it stood, so its own old squares
  // have to take the placement instead of picking it up again (ADR-0542).
  it('takes a seated formation back into the hand when its square is clicked', () => {
    expect(runScreen).toMatch(
      /const standing = arrangedCardAtCell\(latest, cell\);\s*if \(standing && standing !== heldFormationCardId\) \{\s*selectArrangementCard\(standing\);\s*return;\s*\}/,
    );
    expect(runScreen).toContain("standing ? 'is-seated-formation' : ''");
    expect(runScreen).toContain('`Take back the formation at ${cell.x}, ${cell.y}`');
    // Its squares are a real action, so they are reachable and read as pickable.
    expect(runScreen).toContain('const actionable = placeable || Boolean(standing);');
    expect(styles).toMatch(/\.run-deployment-cell\.is-seated-formation \{\s*cursor: grab;\s*\}/);
  });
});

describe('Run Deployment aiming', () => {
  // The old model highlighted legal ANCHORS — the corner of the shape's bounding box. For any
  // formation that is not a solid rectangle that corner is a square no unit stands on, so
  // placing His Grace meant clicking the hole in its own L.
  it('takes the pointer on every square, and resolves the seating from it', () => {
    expect(runScreen).toContain('const placeable = arrangementPlaceableCells.has(cellKey)');
    expect(runScreen).toContain('const filled = arrangementFootprint.has(cellKey);');
    expect(runScreen).toContain('onPointerEnter={() => { setPointedArrangementCell(cellKey); setHeldArrangementAnchor(null); }}');
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
      /const seating = turnedCardPlacement\(\s*latest,\s*level,\s*cardInHandId,\s*arrangementRotation,\s*heldAnchor,\s*cell,\s*\);/,
    );
    expect(runScreen).toContain('if (!seating) return;');
    expect(runScreen).toContain('seating.anchor,');
  });

  // Placing finishes with a formation. The hand must move on by itself, and it must read the
  // document it just wrote — the render-time card list is a placement behind.
  it('hands the next formation to the cursor once one is seated', () => {
    expect(runScreen).toContain('const following = nextArrangedCardToPlace(placed, cardInHandId);');
    expect(runScreen).toMatch(
      /if \(following\) \{\s*setSelectedCardId\(following\);\s*setHeldCardId\(following\);\s*setArrangementRotation\(0\);\s*\}/,
    );
    // Advancing must NOT clear the pointed square: the next formation appears under the cursor.
    const click = runScreen.match(/const placed = placeArrangedDeploymentCard\([\s\S]*?\n {10}\}\}/)?.[0];
    expect(click).toBeDefined();
    expect(click).not.toContain('setPointedArrangementCell');
  });

  // Turning walked the band-wide list, so a turn with no seating anywhere it could hold blanked
  // the formation the player was holding. Narrowing it to the pointed square fixed that and
  // introduced the opposite failure: on a square only ONE turn can cover, the narrowed list named
  // the turn already on screen and every gesture died there. Both halves of that rule now live in
  // cardTurn, where run/deployment tests drive them on a real band rather than on source text.
  it('leaves the turn rule to the Run, and keeps the rail band-wide', () => {
    expect(runDeployment).toContain('export function cardTurn(');
    // The pointed square first, so a turn cannot blank the formation...
    expect(runDeployment).toContain(
      'turnableCardRotations(run, level, cardId, heldAnchor, pointedCell)',
    );
    // ...and the band's own list as the second chance, so a turn is never a dead press.
    expect(runDeployment).toContain('const next = step(held) === rotation ? step(placeable) : step(held);');
    expect(runDeployment).toContain('if (next === rotation) return null;');
    // The screen keeps no turn list of its own to drift out of step with it.
    expect(runScreen).not.toContain('turnableArrangementRotationList');
    expect(runScreen).not.toContain('turnableCardRotations');
    // The RAIL stays band-wide — its buttons must not flicker as the cursor moves.
    expect(runScreen).toMatch(/availableRotations=\{availableArrangementRotations\}/);
    expect(runScreen).toContain('placeableCardRotations(prepared, level, cardInHandId)');
  });

  // Re-seating from the pointed square kept a unit under the cursor but walked the box a square
  // every quarter turn, so an L that only ever covers two by two swept three by three.
  it('turns the formation inside the box it stands in, and lets the pointer choose a new one', () => {
    const decision = runDeployment.match(
      /export function cardTurn\([\s\S]*?\n\}/,
    )?.[0];

    expect(decision).toBeDefined();
    expect(decision).toContain(
      'if (box && arrangedCardPlacementAtAnchor(run, level, cardId, next, box)) {',
    );
    // The band still decides: an unusable box is dropped and the pointed square re-seats it...
    expect(decision).toContain(
      'if (pointedCell && arrangedCardPlacementAtCell(run, level, cardId, next, pointedCell)) {',
    );
    // ...and where neither can hold the new turn the formation shifts to the nearest seating,
    // because a turn the player cannot see is the same as no turn at all.
    expect(decision).toContain('nearestCardPlacementToCell(run, level, cardId, next, aim)');
    // The screen only applies the answer.
    expect(runScreen).toContain(
      'setHeldArrangementAnchor(turn.anchor ? `${turn.anchor.x},${turn.anchor.y}` : null);',
    );
    // Moving the pointer releases the box — the mouse says where, the turn says which way.
    expect(runScreen).toContain(
      'onPointerEnter={() => { setPointedArrangementCell(cellKey); setHeldArrangementAnchor(null); }}',
    );
    // The click commits the box on screen, not a fresh guess from the square under it: after a
    // turn that square may be the corner the formation leaves empty.
    expect(runScreen).toMatch(
      /const seating = turnedCardPlacement\(\s*latest,\s*level,\s*cardInHandId,\s*arrangementRotation,\s*heldAnchor,\s*cell,\s*\);/,
    );
    expect(runScreen).toContain(
      '|| (pointedArrangementOption !== null && cellKey === pointedArrangementCell)',
    );
  });

  // With nothing seated the board went dark, so a turn that found no seating left the player
  // looking at bare ground with no sign of where they could deploy.
  it('keeps the deployable band painted whether or not a seating resolves', () => {
    const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

    // One paint, two strengths — the band under the seating, never a second treatment.
    expect(runScreen).toContain('<PredrawnMoveHighlightPaint />');
    expect(runScreen).not.toContain('{filled ? <PredrawnMoveHighlightPaint /> : null}');
    expect(styles).toContain('.run-deployment-cell.is-band > .predrawn-cyan-move-highlight-paint {');
    const band = styles.match(
      /\.run-deployment-cell\.is-band > \.predrawn-cyan-move-highlight-paint \{\s*opacity: ([\d.]+);/,
    );
    expect(band).toBeTruthy();
    expect(Number(band[1])).toBeGreaterThan(0);
    expect(Number(band[1])).toBeLessThan(1);
  });

  // The wash must key off the BAND, which does not move when the piece is turned. Keying it off
  // the reachable set put out a square at one end of the band as the player turned a formation
  // at the other end.
  it('paints the band from the level and its occupancy, never from the current turn', () => {
    expect(runScreen).toMatch(
      /const arrangementBandCells = useMemo\(\(\) => new Set\(\s*\(cardInHandId \? openDeploymentBandCells\(prepared, level, cardInHandId\) : \[\]\)[\s\S]*?\), \[cardInHandId, level, prepared\]\);/,
    );
    // The rotation is deliberately absent from its dependencies — that is the whole fix.
    // Anchored on the dependency array rather than a line ending: the sources are CRLF, so a
    // bare `\n` after `;` never matches and the guard would silently read `undefined`.
    const memo = runScreen.match(
      /const arrangementBandCells = useMemo\([\s\S]*?\), \[[^\]]*\]\);/,
    )?.[0];
    expect(memo).toBeDefined();
    expect(memo).not.toContain('arrangementRotation');
    expect(runScreen).toContain("band ? 'is-band' : ''");
    // The reachable set stays per-turn: it drives the label, tab order, and crosshair.
    expect(runScreen).toContain("placeable ? 'is-placeable' : ''");
    expect(runScreen).toMatch(/arrangedCardPlaceableCells\(prepared, level, cardInHandId, arrangementRotation\)/);
  });

  // Aim-anywhere needs a hit target on every square, and that opted every square into the shared
  // board's generic hover ring — so a lit tile rode the cursor across ground nothing can be
  // placed on, on the far side of the board from the band.
  it('keeps square-local paint off squares outside the formation\'s reach', () => {
    const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    // A seated formation is exempt: its squares are a real action (take it back), so they keep
    // the shared board's target ring.
    const suppression = styles.match(
      /\.run-deployment-board \.run-deployment-cell:not\(\.is-placeable\):not\(\.is-seated-formation\)::before,\s*\.run-deployment-board \.run-deployment-cell:not\(\.is-placeable\):not\(\.is-seated-formation\)::after \{\s*opacity: 0;\s*\}/,
    );

    expect(suppression).toBeTruthy();
    // It must outrank the shared `:hover` rule, which is why it is scoped to the board. A
    // bare `.run-deployment-cell:not(.is-placeable)::after` ties on specificity and would be
    // decided by source order alone.
    expect(styles).toContain('.skirmish-board-cell-hit:hover::after {');
    expect(styles.indexOf('.run-deployment-board .run-deployment-cell:not(.is-placeable):not(.is-seated-formation)::after'))
      .toBeGreaterThan(styles.indexOf('.skirmish-board-cell-hit:hover::after {'));
    // The square is still a hit target — pointing at one is how a turn finds a fit.
    expect(runScreen).toContain('onPointerEnter={() => { setPointedArrangementCell(cellKey); setHeldArrangementAnchor(null); }}');
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
