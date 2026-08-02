// @ts-nocheck -- source-structure guard also reads CSS through node built-ins.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  requiredRunCardImageKinds,
  runCardPresentationCanPromote,
  runCardPresentationSignature,
  type RunCardFaceContent,
  type RunCardImageKind,
} from './RunCardFace';
import {
  RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY,
  RUN_CARD_STANDARD_FRAME_GEOMETRY,
} from './runCardFrameGeometry';

const card: RunCardFaceContent = Object.freeze({
  name: 'The Volunteer',
  cost: 1,
  typeLine: 'Units',
  grants: Object.freeze([{ count: 2, unit: 'pawn' }, { count: 1, unit: 'bishop' }]),
  flavor: 'The road remembered.',
});

describe('Run card atomic presentation', () => {
  it('binds every visible content field and media identity into one generation', () => {
    const signature = runCardPresentationSignature(card, '/frame-a.png', '/art-a.png');
    expect(runCardPresentationSignature({ ...card, grants: [...card.grants] }, '/frame-a.png', '/art-a.png'))
      .toBe(signature);
    expect(runCardPresentationSignature({ ...card, name: 'Another Card' }, '/frame-a.png', '/art-a.png'))
      .not.toBe(signature);
    expect(runCardPresentationSignature(card, '/frame-b.png', '/art-a.png')).not.toBe(signature);
    expect(runCardPresentationSignature(card, '/frame-a.png', '/art-b.png')).not.toBe(signature);
    expect(runCardPresentationSignature(
      card,
      '/frame-a.png',
      '/art-a.png',
      RUN_CARD_CONCINNOUS_STEEL_FRAME_GEOMETRY,
    )).not.toBe(runCardPresentationSignature(
      card,
      '/frame-a.png',
      '/art-a.png',
      RUN_CARD_STANDARD_FRAME_GEOMETRY,
    ));
  });

  it('requires the actual frame, art, and every unit consumer before promotion', () => {
    expect(requiredRunCardImageKinds(card)).toEqual([
      'frame',
      'art',
      'unit:0:pawn:0',
      'unit:0:pawn:1',
      'unit:1:bishop:0',
    ]);
    const signature = runCardPresentationSignature(card, '/frame.png', '/art.png');
    const incomplete = new Set<RunCardImageKind>(['frame', 'art', 'unit:0:pawn:0', 'unit:0:pawn:1']);
    const complete = new Set<RunCardImageKind>(requiredRunCardImageKinds(card));
    expect(runCardPresentationCanPromote(signature, signature, card, incomplete)).toBe(false);
    expect(runCardPresentationCanPromote(signature, signature, card, complete)).toBe(true);
  });

  it('rejects a fully loaded generation after a newer selection supersedes it', () => {
    const stale = runCardPresentationSignature(card, '/frame.png', '/stale.png');
    const current = runCardPresentationSignature({ ...card, name: 'Current' }, '/frame.png', '/current.png');
    const settled = new Set<RunCardImageKind>(requiredRunCardImageKinds(card));
    expect(runCardPresentationCanPromote(stale, current, card, settled)).toBe(false);
  });

  it('keeps the prior layer visible until a hidden pending layer passes two paint opportunities', () => {
    const source = readFileSync(new URL('./RunCardFace.tsx', import.meta.url), 'utf8');
    const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(source).toContain("className={`run-card-face-layer${pending ? ' is-pending' : ' is-presented'}`}");
    expect(source.match(/requestAnimationFrame\(/g)).toHaveLength(2);
    expect(source).toContain('if (!ready || ready.signature !== signature) return;');
    expect(source).toContain('aria-busy={pending ? true : undefined}');
    expect(style).toMatch(/\.run-card-face-layer\.is-pending\s*\{[\s\S]*?opacity:\s*0/);
  });
});
