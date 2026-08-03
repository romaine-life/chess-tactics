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
  });

  it('answers with no landing point where there is no document, so the take is committed outright', () => {
    // Server rendering has no strip to measure. The take must still be reachable there
    // rather than throwing or stalling the screen on its own presentation.
    expect(relicStripLandingPoint(0)).toBeNull();
  });
});
