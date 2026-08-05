import { readFileSync } from 'node:fs';
import { applyDrawableCatalog, resetDrawableCatalog } from '@chess-tactics/board-render';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import { craftRunDocument, parseRunCraftSpec } from '../run/craft';
import type { RunWarSnapshot } from '../run/model';
import { RunBonaVacantia, RunBonaVacantiaTarget } from './RunBonaVacantia';
import { DEFAULT_RUN_ARMY_FILTERS } from './RunArmyWorkspace';
import { LIPSANON_HOVER_EMPHASES, LIPSANON_MOTION_COMMITTED, lipsanonHoverAttributes } from './LipsanonMatReview';
import { lipsanonStripLandingPoint } from './runLipsanonFlight';
import { LIPSANON_FLIGHT_MS } from './runLipsanonFlightView';
import { LIPSANON_FLOAT_COMMITTED_TIMING } from './runLipsanonMat';
import { testDrawableCatalog } from '../test/drawableCatalog';

beforeAll(() => applyDrawableCatalog(testDrawableCatalog()));
afterAll(() => resetDrawableCatalog());

function war(battles = 4, lootAt: number[] = []): RunWarSnapshot {
  return {
    id: 'off-w-vacantia',
    name: 'Vacantia Test War',
    description: 'A deterministic test War.',
    battles: Array.from({ length: battles }, (_, index) => {
      const level = createBlankLevel(`battle-${index}`, `Battle ${index + 1}`, 8, 8);
      level.layers.units.push({ x: 4, y: 0, type: 'king', side: 'enemy' });
      level.layers.zones = [{
        id: 'player-zone',
        type: 'player-spawn',
        tiles: Array.from({ length: 16 }, (_cell, offset) => [offset % 8, 6 + Math.floor(offset / 8)] as [number, number]),
      }];
      return { level, loot: lootAt.includes(index) };
    }),
  };
}

function vacantiaRun() {
  const spec = parseRunCraftSpec('?craft=bona-vacantia&battle=1&loot=fair-scales,mercenarys-rifle,quartermasters-ledger');
  if (!spec) throw new Error('craft spec did not parse');
  return craftRunDocument(spec, war(4, [2]));
}

function targetedVacantiaRun() {
  const spec = parseRunCraftSpec('?craft=bona-vacantia&battle=1&loot=conscription-notice,royal-decree,training-linens');
  if (!spec) throw new Error('targeted craft spec did not parse');
  return craftRunDocument(spec, war(4, [2]));
}

describe('Bona Vacantia lipsana', () => {
  it('leaves the room-caption corner empty and relies on the title bar for the phase name', () => {
    const markup = renderToStaticMarkup(
      <RunBonaVacantia
        run={vacantiaRun()}
        replace={() => {}}
        onTargetLipsanon={() => {}}
        launchLipsanon={() => false}
      />,
    );
    expect(markup).toContain('aria-label="Lipsanon offers"');
    expect(markup).not.toContain('<h2');
    expect(markup).not.toContain('run-vacantia-lede');
    expect(markup).not.toContain('Nobody is here to hand these over');
    expect(markup).not.toContain('Bona Vacantia');
  });

  it('fits the runtime mat stage to its scene slot instead of creating an ultrawide scrollbar', () => {
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(css).toMatch(
      /\.run-vacantia-content\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\);[^}]*overflow:\s*hidden;/s,
    );
    expect(css).toMatch(
      /\.run-vacantia-content\s*>\s*\.lipsanon-mat-stage\s*\{[^}]*aspect-ratio:\s*auto;[^}]*block-size:\s*100%;/s,
    );
  });

  it('gives every offer its own float clock so the three do not move as one strip', () => {
    const markup = renderToStaticMarkup(
      <RunBonaVacantia
        run={vacantiaRun()}
        replace={() => {}}
        onTargetLipsanon={() => {}}
        launchLipsanon={() => false}
      />,
    );
    const delays = [...markup.matchAll(/--lipsanon-float-delay:([^;"]+)/g)].map(([, value]) => value.trim());
    const spreads = [...markup.matchAll(/--lipsanon-float-spread:([^;"]+)/g)].map(([, value]) => value.trim());
    expect(delays).toHaveLength(3);
    expect(new Set(delays).size).toBe(3);
    expect(new Set(spreads).size).toBe(3);
  });

  it('rests with no lipsanon in flight and nothing dimmed', () => {
    const markup = renderToStaticMarkup(
      <RunBonaVacantia
        run={vacantiaRun()}
        replace={() => {}}
        onTargetLipsanon={() => {}}
        launchLipsanon={() => false}
      />,
    );
    expect(markup).toContain('data-testid="run-vacantia-offers"');
    expect(markup).not.toContain('data-taking');
    expect(markup).not.toContain('run-lipsanon-flight');
    expect(markup).not.toContain('is-flying');
  });

  it('offers a targeted lipsanon directly instead of asking for a unit before it is taken', () => {
    const markup = renderToStaticMarkup(
      <RunBonaVacantia
        run={targetedVacantiaRun()}
        replace={() => {}}
        onTargetLipsanon={() => {}}
        launchLipsanon={() => false}
      />,
    );
    expect(markup).toContain('aria-label="Take Conscription Notice"');
    expect(markup).not.toContain('Discipline target');
    expect(markup).not.toContain('Adlected target unit');

    const source = readFileSync(new URL('./RunBonaVacantia.tsx', import.meta.url), 'utf8');
    expect(source).toContain('if (lipsanonNeedsUnitTarget(lipsanonId))');
    expect(source).toContain('onTargetLipsanon(lipsanonId);');
    expect(source).toContain('<RunArmyWorkspace');
    expect(source).toContain('label: `Give ${ADLECTED_DISPLAY_NAME} to this unit`');
    expect(source).not.toContain('const [targeting');
    expect(source).not.toContain('const [selectedUnitId');
  });

  it('carries a landed lipsanon outside both scene fades until the incoming strip owns it', () => {
    const bona = readFileSync(new URL('./RunBonaVacantia.tsx', import.meta.url), 'utf8');
    const runScreen = readFileSync(new URL('./RunScreen.tsx', import.meta.url), 'utf8');
    const flight = readFileSync(new URL('./runLipsanonFlightView.tsx', import.meta.url), 'utf8');
    const continuity = readFileSync(new URL('./shell/SceneContinuity.tsx', import.meta.url), 'utf8');
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

    expect(bona).not.toContain('useLipsanonFlight(');
    expect(bona).toContain('launchLipsanon(lipsanonId, icon, destination)');
    expect(runScreen).toContain("{ handoff: 'scene-settled' }");
    expect(runScreen).toMatch(/\{bonaLipsanonFlightElement\}[\s\S]*?\{formSurface\}/);
    expect(runScreen).toContain('launchLipsanon={launchBonaLipsanon}');
    expect(flight).toContain("contribution={{ kind: 'shared-element', id: `lipsanon:${flight.lipsanonId}` }}");
    expect(flight).toContain("options.handoff === 'scene-settled'");
    expect(flight).toContain('if (!retainThroughSceneTransition) setFlight(null);');
    expect(flight).toContain('onSceneSettled={retainThroughSceneTransition ? releaseSettledHandoff : undefined}');
    expect(flight).not.toContain('createPortal');
    expect(continuity).toContain("if (phase !== 'current')");
    expect(continuity).toContain('onSceneSettled();');
    expect(continuity).toContain('data-scene-continuity-contribution={contribution.id}');
    expect(continuity).toContain('data-scene-continuity-host=""');
    expect(app).toContain('<SceneContinuityHost phase={scene.phase} generation={scene.generation}>');
  });

  it('uses the held strip as the sole relic instance and makes unit selection explicit', () => {
    const markup = renderToStaticMarkup(
      <RunBonaVacantiaTarget
        run={targetedVacantiaRun()}
        lipsanonId="conscription-notice"
        selectedUnitId={null}
        filters={{ ...DEFAULT_RUN_ARMY_FILTERS }}
        onFiltersChange={() => {}}
        onSelectUnit={() => {}}
        onBackToUnits={() => {}}
        onBackToOffers={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(markup).toContain('data-run-scene-view="bona-target"');
    expect(markup).not.toContain('run-lipsanon-icon');
    expect(markup).not.toContain('Bona Vacantia');
    expect(markup).toContain('Return to the three offers');
    expect(markup).toContain('Select a unit');
    expect(markup).toContain('>Select<');
    expect(markup).toContain('aria-label="Select ');
  });

  it('keeps the tuner resetting to the numbers style.css actually ships', () => {
    // The viewer resets to LIPSANON_MOTION_COMMITTED and the game runs the custom-property
    // fallbacks. Nothing forces those to agree, so a drift here is silent: the tuner would
    // reset to a look the player never sees. Pin them together.
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(css).toContain(`--lipsanon-float-rise, ${LIPSANON_MOTION_COMMITTED.rise}px`);
    expect(css).toContain(`--lipsanon-float-period, ${LIPSANON_MOTION_COMMITTED.period}s`);
    expect(css).toContain(`--lipsanon-glow, ${LIPSANON_MOTION_COMMITTED.glow}`);
    expect(css).toContain(`--lipsanon-float-timing, ${LIPSANON_FLOAT_COMMITTED_TIMING}`);
    expect(LIPSANON_MOTION_COMMITTED.stepped).toBe(false);
    // The registration is what a settled lipsanon reverts to, so its initial value is the
    // rise that actually governs — a fallback that disagreed with it would never be read.
    expect(css).toMatch(
      new RegExp(`@property --lipsanon-float-rise \\{[^}]*initial-value: ${LIPSANON_MOTION_COMMITTED.rise}px`),
    );
  });

  it('settles a hovered lipsanon onto its seat and leaves a blocked one drifting', () => {
    // Both halves are one decision: hovering removes the amplitude so the lipsanon comes to
    // rest at translate 0 whatever part of the bob it was caught in, and an offer that
    // cannot be taken takes the amplitude back so it never answers the pointer at all.
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(css).toMatch(
      /\.lipsanon-mat-offer:hover \.run-lipsanon-icon,\s*\.lipsanon-mat-offer:focus-within \.run-lipsanon-icon \{\s*--lipsanon-float-rise: 0px;\s*--lipsanon-glow-pulse: 0;/,
    );
    expect(css).toMatch(
      /\.run-vacantia-take:disabled \.run-lipsanon-icon \{\s*--lipsanon-float-rise: inherit;\s*--lipsanon-glow-pulse: inherit;/,
    );
    // Transitioning the amplitudes is what makes the settle smooth AND predictable; freezing
    // the animations instead would stop them at a different height and level every time.
    // Matched inside the whole transition list — the icon transitions several properties and
    // their order is not part of the contract.
    expect(css).toMatch(/transition:[^;]*--lipsanon-float-rise \d+ms/);
    expect(css).toMatch(/transition:[^;]*--lipsanon-glow-pulse \d+ms/);
    // Collapsing the amplitudes is not enough: a zero-amplitude animation is still RUNNING,
    // so the element stays live on the compositor and a pixelated sprite crawls along its
    // edges. The pause must carry !important — the `animation` shorthand above has it, and a
    // shorthand resets animation-play-state to `running`, outranking an unflagged pause.
    expect(css).toMatch(/animation-play-state: paused !important;/);
    expect(css).toMatch(/animation-play-state: running !important;/);
  });

  it('ships every hover emphasis switched off until one is chosen', () => {
    // The emphases exist to be judged in the Studio viewer. Until the owner picks a
    // combination, hovering does what it already did — settle, brighten, enlarge — so an
    // option landing in the tree can never quietly become the game's behaviour.
    expect(Object.values(LIPSANON_MOTION_COMMITTED.hover).every((on) => on === false)).toBe(true);
    expect(LIPSANON_HOVER_EMPHASES.map(({ key }) => key).sort())
      .toEqual(Object.keys(LIPSANON_MOTION_COMMITTED.hover).sort());
    // Each is a no-op at strength 0 rather than a rule that has to be switched off, so any
    // combination composes instead of the last one winning.
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    for (const { key } of LIPSANON_HOVER_EMPHASES) {
      expect(css).toContain(`.lipsanon-mat-stage[data-hover-${key}]`);
    }
    expect(lipsanonHoverAttributes({ flare: true, lift: false, rim: true, focus: false }))
      .toEqual({ 'data-hover-flare': '', 'data-hover-rim': '' });
  });

  it('seats the tray on the table with a stroke of the committed width', () => {
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(css).toContain(`--lipsanon-tray-stroke-width, ${LIPSANON_MOTION_COMMITTED.trayStroke}px`);
    expect(css).toMatch(/\.lipsanon-mat-art \{[^}]*--lipsanon-tray-stroke:/);
  });

  it('flies a taken lipsanon along one straight segment', () => {
    // Splitting x and y across two elements is what curves a path: different easings reach
    // their halfway points at different moments and the lipsanon bows off the line between its
    // endpoints. One translate, on one element, is the whole of the contract.
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.run-lipsanon-flight\.is-landed \{\s*translate: var\(--lipsanon-flight-x\) var\(--lipsanon-flight-y\);/);
    const lift = css.slice(css.indexOf('.run-lipsanon-flight-lift {'));
    const body = lift.slice(0, lift.indexOf('}'));
    expect(body).toContain('scale');
    expect(body).not.toContain('translate');
  });

  it('recedes the lipsana left behind on the flight’s own clock', () => {
    // "In tandem with the move" is the requirement, so the recede borrows the flight's
    // duration and easing rather than picking its own. Nothing in CSS can see
    // LIPSANON_FLIGHT_MS, so the two are pinned here — drift would leave the mat still settling
    // after the lipsanon had arrived, or snapping still before it got there.
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(css).toContain(`--lipsanon-take-duration: ${LIPSANON_FLIGHT_MS}ms;`);
    expect(css).toMatch(/\.lipsanon-mat-offer \{\s*transition:\s*opacity var\(--lipsanon-take-duration\) var\(--lipsanon-take-easing\),\s*scale var\(--lipsanon-take-duration\) var\(--lipsanon-take-easing\);/);
    // They GO, they do not settle at some dimmer size: only one lipsanon was ever going to be
    // taken, so the others must not still be on the mat when it lands.
    expect(css).toMatch(
      /\.lipsanon-mat-cards\[data-taking\] \.lipsanon-mat-offer \{\s*opacity: 0;\s*scale: var\(--lipsanon-recede-scale, [\d.]+\);/,
    );
    expect(css).toContain(`--lipsanon-recede-scale, ${LIPSANON_MOTION_COMMITTED.recede}`);
    expect(LIPSANON_MOTION_COMMITTED.recede).toBe(0);
  });

  it('keeps the untaken lipsana gone through landing while the authored target scene enters', () => {
    // The flight ends when the lipsanon lands, so anything derived from it un-takes the mat in
    // the beat before the authored target scene replaces it — the lipsana reappear at full
    // size mid-exit. The outgoing mat keeps its local animation latch; returning to the
    // offers is a new primary scene instance, not a local screen swap.
    const source = readFileSync(new URL('./RunBonaVacantia.tsx', import.meta.url), 'utf8');
    expect(source).toContain("data-taking={departed ? '' : undefined}");
    expect(source).toContain('const flying = departed === lipsanonId;');
    expect(source).toContain('suppressed={Boolean(departed)}');
    expect(source).toContain('Return to the three offers');
    expect(source).not.toContain('function returnToMat(): void');
    expect(source).not.toMatch(/data-taking=\{flight/);
  });

  it('holds the hovered lipsanon at a whole-pixel size', () => {
    // The icons are 64px sprites drawn 1:1 and rendered nearest-neighbour. A fractional
    // hover size lands the sampling grid between source pixels and the edges shimmer, so the
    // scale has to multiply 64 up to a whole number of pixels.
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const scales = [...css.matchAll(/^\s*scale: (1\.\d+);$/gm)].map(([, value]) => Number(value));
    expect(scales.length).toBeGreaterThan(0);
    for (const scale of scales) expect(Number.isInteger(scale * 64)).toBe(true);
  });

  it('holds the emanation at ONE colour so a settled lipsanon is completely still', () => {
    // An animated filter interpolates every component it is given. Radius and opacity carry
    // the pulse; if the two keyframes also disagreed on RGB, the hue would keep drifting
    // under a lipsanon whose amplitude had been collapsed to zero — still visibly moving.
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const emanate = css.slice(css.indexOf('@keyframes lipsanon-vacantia-emanate'));
    // style.css is CRLF here, and the keyframes' own closing brace is the first one at the
    // start of a line — the frames inside it are indented.
    const body = emanate.slice(0, emanate.search(/\r?\n\}/));
    const glowColours = [...body.matchAll(/rgb\((255 \d+ \d+) \//g)].map(([, rgb]) => rgb);
    expect(glowColours).toHaveLength(4);
    expect(new Set(glowColours).size).toBe(2);
  });

  it('never leaves the Run workspace scrolling on a raw OS scrollbar', () => {
    // .run-shell-workspace-content scrolls whenever a workspace outgrows a short window and
    // sits directly beside the always-skinned Controls rail. Unskinned it renders the
    // platform bar, arrow buttons and all, inside a painted room.
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const rail = css.slice(css.indexOf('.run-shell-workspace-content {'));
    const body = rail.slice(0, rail.indexOf('}'));
    expect(body).toContain('overflow-y: auto');
    expect(body).toMatch(/scrollbar-color: #315160 #071017;/);
    expect(body).toMatch(/scrollbar-width: thin;/);
  });

  it('answers with no landing point where there is no document and keeps both fallback paths reachable', () => {
    // Server rendering has no strip to measure. An ordinary take commits immediately; a
    // targeted take navigates to its authored chooser immediately rather than throwing or stalling.
    expect(lipsanonStripLandingPoint(0)).toBeNull();
    const source = readFileSync(new URL('./RunBonaVacantia.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/if \(!launchLipsanon\([\s\S]*?if \(lipsanonNeedsUnitTarget\(lipsanonId\)\) onTargetLipsanon\(lipsanonId\);[\s\S]*?else replace\(takeVacantiaLipsanon/);
  });
});
