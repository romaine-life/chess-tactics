// @ts-nocheck -- source/CSS contract test; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_FLIGHT_MS,
  runCardFlightGeometry,
  runCardMotionDurationMs,
  runCardReflowOffset,
} from './runCardFlightView';

const cardRect = (left: number) => ({ left, top: 180, width: 236, height: 330 });

describe('Run card Adlectio transfer', () => {
  it('moves centre to centre and minimizes inside the destination mark', () => {
    const geometry = runCardFlightGeometry(
      { left: 100, top: 200, width: 200, height: 280 },
      { left: 900, top: 120, width: 24, height: 24 },
    );
    expect(geometry).not.toBeNull();
    expect(geometry?.x).toBe(712);
    expect(geometry?.y).toBe(-208);
    expect(geometry?.scale).toBeCloseTo((24 / 280) * 0.82);
  });

  it('fails closed on an unmeasurable endpoint', () => {
    expect(runCardFlightGeometry(
      { left: 0, top: 0, width: 0, height: 280 },
      { left: 20, top: 20, width: 24, height: 24 },
    )).toBeNull();
  });

  it('reads the shared CSS duration token without cloning its value into JS', () => {
    expect(runCardMotionDurationMs('350ms')).toBe(350);
    expect(runCardMotionDurationMs('.56s')).toBeNull();
    expect(runCardMotionDurationMs('0.56s')).toBe(560);
    expect(runCardMotionDurationMs('')).toBeNull();
  });

  it.each([
    {
      position: 'first of three',
      before: { b: 252, c: 504 },
      after: { b: 126, c: 378 },
      offsets: { b: 126, c: 126 },
    },
    {
      position: 'middle of three',
      before: { a: 0, c: 504 },
      after: { a: 126, c: 378 },
      offsets: { a: -126, c: 126 },
    },
    {
      position: 'last of three',
      before: { a: 0, b: 252 },
      after: { a: 126, b: 378 },
      offsets: { a: -126, b: -126 },
    },
    {
      position: 'first of two',
      before: { b: 378 },
      after: { b: 252 },
      offsets: { b: 126 },
    },
    {
      position: 'last of two',
      before: { a: 126 },
      after: { a: 252 },
      offsets: { a: -126 },
    },
  ])('inverts every survivor before settling after the $position Adlectio', ({ before, after, offsets }) => {
    for (const [id, previousLeft] of Object.entries(before)) {
      expect(runCardReflowOffset(cardRect(previousLeft), cardRect(after[id]))).toEqual({
        x: offsets[id],
        y: 0,
      });
    }
  });

  it('keeps the source seat stable and flies the canonical face on one transfer clock', () => {
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const source = readFileSync(new URL('./runCardFlightView.tsx', import.meta.url), 'utf8');
    const screen = readFileSync(new URL('./RunScreen.tsx', import.meta.url), 'utf8');
    expect(css).toContain(`--ds-duration-transfer: ${RUN_CARD_FLIGHT_MS}ms;`);
    expect(css).toMatch(/\.run-card-offer\.is-departing\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?pointer-events:\s*none;/);
    expect(css).toMatch(/\.run-card-flight\.is-landed\s*\{[\s\S]*?scale:\s*var\(--run-card-flight-scale\);[\s\S]*?translate:\s*var\(--run-card-flight-x\) var\(--run-card-flight-y\);/);
    expect(source).toContain('<RunCard card={flight.offer} mode="reference" />');
    expect(source).toContain("<SceneContinuityPortal contribution={{ kind: 'shared-element', id: `card:${flight.offer.offerId}` }}>");
    expect(source).not.toContain('createPortal');
    expect(source).toContain("event.propertyName === 'translate'");
    expect(css).toMatch(/\.run-card-offer\.is-reflowing\s*\{[\s\S]*?will-change:\s*translate;/);
    expect(screen).toContain('const offset = previous ? runCardReflowOffset(previous, rect) : null;');
    expect(screen).toContain("rowStyle.getPropertyValue('--ds-duration-fade')");
    expect(screen).toContain("rowStyle.getPropertyValue('--ds-ease-standard')");
    expect(screen).toContain('return element.animate(');
    expect(screen).toContain('onReflowingChange(true);');
    expect(screen).toContain('setLandedAdlectioOfferId(offer.offerId);');
    expect(screen).toContain('departingOfferId={cardFlight?.offer.offerId ?? landedAdlectioOfferId}');
    expect(screen).toContain('const adlectioBusy = Boolean(cardFlight) || Boolean(landedAdlectioOfferId) || cardReflowing;');
    expect(screen).toContain('inert={adlectioInFlight ? true : undefined}');
    expect(screen).not.toContain('disabled={adlectioInFlight}');
  });
});
