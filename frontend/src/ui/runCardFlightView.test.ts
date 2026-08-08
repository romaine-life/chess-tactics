// @ts-nocheck -- source/CSS contract test; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_FLIGHT_MS,
  runCardFlightGeometry,
  runCardMotionDurationMs,
} from './runCardFlightView';

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

  it('commits immediately and lets independent canonical faces fly without blocking input', () => {
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const source = readFileSync(new URL('./runCardFlightView.tsx', import.meta.url), 'utf8');
    const screen = readFileSync(new URL('./RunScreen.tsx', import.meta.url), 'utf8');
    expect(css).toContain(`--ds-duration-transfer: ${RUN_CARD_FLIGHT_MS}ms;`);
    expect(css).toMatch(/\.run-card-flight\.is-landed\s*\{[\s\S]*?scale:\s*var\(--run-card-flight-scale\);[\s\S]*?translate:\s*var\(--run-card-flight-x\) var\(--run-card-flight-y\);/);
    expect(source).toContain('<RunCard card={flight.offer} mode="reference" />');
    expect(source).toContain("contribution={{ kind: 'shared-element', id: `card:${flight.id}` }}");
    expect(source).toContain('setFlights((current) => [...current, { id, offer, geometry }]);');
    expect(source).toContain('flights.map((flight) => (');
    expect(source).not.toContain('run-card-flight-shield');
    expect(source).not.toContain('createPortal');
    expect(source).toContain("event.propertyName === 'translate'");
    expect(screen).toContain('<RunCardPile');
    // The index is the seat's own drift/light clock (runCardLife.ts), not offer state.
    expect(screen).toContain('sectio.cardOffers.map((offer, index) => {');
    expect(screen).toContain('sectio.adlectedCardOfferIds.includes(offer.offerId)');
    expect(screen).not.toContain('runCardReflowOffset');
    expect(screen).not.toContain('is-reflowing');
    expect(screen).toContain('const adlected = performAdlectio(latest, offer.offerId);');
    expect(screen).toMatch(/launchCardFlight\(offer, source, target\);[\s\S]*?replace\(adlected\);/);
    expect(screen).toContain('useRunCardFlights()');
    expect(screen).not.toContain('adlectioBusy');
    expect(screen).not.toContain('adlectioInFlight');
    expect(screen).not.toContain('landedAdlectioOfferId');
    expect(screen).not.toContain('cardReflowing');
    expect(screen).not.toContain('departingOfferId');
    expect(screen).not.toContain('inert:');
  });
});
