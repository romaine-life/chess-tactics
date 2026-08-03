import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import { craftRunDocument, parseRunCraftSpec } from '../run/craft';
import type { RunWarSnapshot } from '../run/model';
import { RunBonaVacantia } from './RunBonaVacantia';
import { RELIC_MOTION_COMMITTED } from './RunRelicMatReview';
import { relicStripLandingPoint } from './runRelicFlight';
import { RELIC_FLOAT_COMMITTED_TIMING } from './runRelicMat';

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

describe('Bona Vacantia relics', () => {
  it('gives every offer its own float clock so the three do not move as one strip', () => {
    const markup = renderToStaticMarkup(
      <RunBonaVacantia run={vacantiaRun()} replace={() => {}} />,
    );
    const delays = [...markup.matchAll(/--relic-float-delay:([^;"]+)/g)].map(([, value]) => value.trim());
    const spreads = [...markup.matchAll(/--relic-float-spread:([^;"]+)/g)].map(([, value]) => value.trim());
    expect(delays).toHaveLength(3);
    expect(new Set(delays).size).toBe(3);
    expect(new Set(spreads).size).toBe(3);
  });

  it('rests with no relic in flight and nothing dimmed', () => {
    const markup = renderToStaticMarkup(
      <RunBonaVacantia run={vacantiaRun()} replace={() => {}} />,
    );
    expect(markup).toContain('data-testid="run-vacantia-offers"');
    expect(markup).not.toContain('data-taking');
    expect(markup).not.toContain('run-relic-flight');
    expect(markup).not.toContain('is-flying');
  });

  it('keeps the tuner resetting to the numbers style.css actually ships', () => {
    // The viewer resets to RELIC_MOTION_COMMITTED and the game runs the custom-property
    // fallbacks. Nothing forces those to agree, so a drift here is silent: the tuner would
    // reset to a look the player never sees. Pin them together.
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(css).toContain(`--relic-float-rise, ${RELIC_MOTION_COMMITTED.rise}px`);
    expect(css).toContain(`--relic-float-period, ${RELIC_MOTION_COMMITTED.period}s`);
    expect(css).toContain(`--relic-glow, ${RELIC_MOTION_COMMITTED.glow}`);
    expect(css).toContain(`--relic-float-timing, ${RELIC_FLOAT_COMMITTED_TIMING}`);
    expect(RELIC_MOTION_COMMITTED.stepped).toBe(false);
    // The registration is what a settled relic reverts to, so its initial value is the
    // rise that actually governs — a fallback that disagreed with it would never be read.
    expect(css).toMatch(
      new RegExp(`@property --relic-float-rise \\{[^}]*initial-value: ${RELIC_MOTION_COMMITTED.rise}px`),
    );
  });

  it('settles a hovered relic onto its seat and leaves a blocked one drifting', () => {
    // Both halves are one decision: hovering removes the amplitude so the relic comes to
    // rest at translate 0 whatever part of the bob it was caught in, and an offer that
    // cannot be taken takes the amplitude back so it never answers the pointer at all.
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(css).toMatch(
      /\.relic-mat-offer:hover \.run-relic-icon,\s*\.relic-mat-offer:focus-within \.run-relic-icon \{\s*--relic-float-rise: 0px;\s*--relic-glow-pulse: 0;/,
    );
    expect(css).toMatch(
      /\.run-vacantia-take:disabled \.run-relic-icon \{\s*--relic-float-rise: inherit;\s*--relic-glow-pulse: inherit;/,
    );
    // Transitioning the amplitudes is what makes the settle smooth AND predictable; freezing
    // the animations instead would stop them at a different height and level every time.
    expect(css).toMatch(/transition:\s*--relic-float-rise \d+ms/);
    expect(css).toMatch(/transition: --relic-glow-pulse \d+ms/);
  });

  it('holds the emanation at ONE colour so a settled relic is completely still', () => {
    // An animated filter interpolates every component it is given. Radius and opacity carry
    // the pulse; if the two keyframes also disagreed on RGB, the hue would keep drifting
    // under a relic whose amplitude had been collapsed to zero — still visibly moving.
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const emanate = css.slice(css.indexOf('@keyframes relic-vacantia-emanate'));
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

  it('answers with no landing point where there is no document, so the take is committed outright', () => {
    // Server rendering has no strip to measure. The take must still be reachable there
    // rather than throwing or stalling the screen on its own presentation.
    expect(relicStripLandingPoint(0)).toBeNull();
  });
});
