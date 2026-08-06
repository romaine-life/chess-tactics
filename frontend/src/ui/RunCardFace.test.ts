// @ts-nocheck -- source-structure guard also reads CSS through node built-ins.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  requiredRunCardImageKinds,
  runCardContentCanUpdateWithoutMediaLoad,
  runCardUnitSpriteAlphaHit,
  runCardUnitClosestAlphaHit,
  runCardUnitStackLayout,
  runCardContentsDensityStepForCard,
  runCardPresentationCanPromote,
  runCardPresentationSignature,
  type RunCardFaceContent,
  type RunCardImageKind,
} from './RunCardFace';
import {
  RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY,
  RUN_CARD_STANDARD_FRAME_GEOMETRY,
} from './runCardFrameGeometry';
import { runCardFaceContent, runCardSpecimen } from './runCardFaceContent';

// Even a promotion fixture is a projected card. This file opts out of typechecking for
// its node built-ins, so the branded type cannot stop a hand-authored face here — the
// discipline has to be kept on purpose.
const card: RunCardFaceContent = runCardFaceContent(
  runCardSpecimen({ pieces: ['pawn', 'pawn', 'bishop'] }),
);

describe('Run card atomic presentation', () => {
  it('targets the nearest alpha silhouette and its small outline halo', () => {
    const alphaMask = new Uint8Array(12);
    alphaMask[5] = 1; // x 1, y 1
    alphaMask[10] = 1; // x 2, y 2
    const sprite = {
      alphaMask,
      naturalWidth: 4,
      naturalHeight: 3,
      opaqueLeft: 1,
      opaqueWidth: 2,
    };

    expect(runCardUnitSpriteAlphaHit(sprite, .25, .5)).toBe(true);
    expect(runCardUnitSpriteAlphaHit(sprite, .75, .5)).toBe(false);
    expect(runCardUnitSpriteAlphaHit(sprite, .75, .8)).toBe(true);
    expect(runCardUnitSpriteAlphaHit(sprite, -.01, .5)).toBe(false);
    expect(runCardUnitSpriteAlphaHit(sprite, 1, .5)).toBe(false);
    expect(runCardUnitSpriteAlphaHit(sprite, .75, .5, 1)).toBe(true);
    expect(runCardUnitClosestAlphaHit([
      { sprite, inlineRatio: .25, blockRatio: .5, hitSlop: 1 },
      { sprite, inlineRatio: 1.5, blockRatio: .5, hitSlop: 1 },
    ])).toBe(0);
    expect(runCardUnitClosestAlphaHit([
      { sprite, inlineRatio: .25, blockRatio: .5, hitSlop: 1 },
      { sprite, inlineRatio: .75, blockRatio: .5, hitSlop: 1 },
    ])).toBe(0);
    expect(runCardUnitClosestAlphaHit([
      { sprite, inlineRatio: .25, blockRatio: .5, hitSlop: 1 },
      { sprite, inlineRatio: .25, blockRatio: .5, hitSlop: 1 },
    ])).toBe(1);
  });

  it('binds every visible content field and media identity into one generation', () => {
    const signature = runCardPresentationSignature(card, '/frame-a.png', '/art-a.png');
    expect(runCardPresentationSignature({ ...card, grants: [...card.grants] }, '/frame-a.png', '/art-a.png'))
      .toBe(signature);
    expect(runCardPresentationSignature({ ...card, name: 'Another Card' }, '/frame-a.png', '/art-a.png'))
      .not.toBe(signature);
    expect(runCardPresentationSignature({ ...card, showsCost: false }, '/frame-a.png', '/art-a.png'))
      .not.toBe(signature);
    expect(runCardPresentationSignature(card, '/frame-b.png', '/art-a.png')).not.toBe(signature);
    expect(runCardPresentationSignature(card, '/frame-a.png', '/art-b.png')).not.toBe(signature);
    expect(runCardPresentationSignature(
      card,
      '/frame-a.png',
      '/art-a.png',
      RUN_CARD_HIERATIC_STEEL_FRAME_GEOMETRY,
    )).not.toBe(runCardPresentationSignature(
      card,
      '/frame-a.png',
      '/art-a.png',
      RUN_CARD_STANDARD_FRAME_GEOMETRY,
    ));
    expect(runCardPresentationSignature(
      card,
      '/frame-a.png',
      '/art-a.png',
      RUN_CARD_STANDARD_FRAME_GEOMETRY,
      '/coin-b.png',
    )).not.toBe(signature);
    expect(runCardPresentationSignature({
      ...card,
      grants: [{ ...card.grants[0], ability: 'adlected' }, card.grants[1]],
    }, '/frame-a.png', '/art-a.png')).not.toBe(signature);
  });

  it('requires the actual frame, art, and every unit consumer before promotion', () => {
    expect(requiredRunCardImageKinds(card)).toEqual([
      'frame',
      'coin',
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

  it('retains authored density and requires only occupied seat media after a unit leaves', () => {
    const specimen = runCardSpecimen({ pieces: ['pawn', 'pawn'] });
    const full = runCardFaceContent(specimen);
    const oneSeatEmpty = runCardFaceContent(specimen, { emptyPieceIndices: [0] });

    expect(oneSeatEmpty.grants).toEqual([{
      unit: 'pawn',
      count: 2,
      emptyIndices: [0],
      cacochymicIndices: [],
    }]);
    expect(runCardContentsDensityStepForCard(oneSeatEmpty)).toEqual(runCardContentsDensityStepForCard(full));
    expect(requiredRunCardImageKinds(oneSeatEmpty)).toEqual([
      'frame',
      'coin',
      'art',
      'unit:0:pawn:1',
    ]);
    expect(runCardPresentationSignature(oneSeatEmpty, '/frame.png', '/art.png'))
      .not.toBe(runCardPresentationSignature(full, '/frame.png', '/art.png'));
    expect(runCardContentCanUpdateWithoutMediaLoad(full, oneSeatEmpty)).toBe(true);
    expect(runCardContentCanUpdateWithoutMediaLoad(oneSeatEmpty, full)).toBe(false);
  });

  it('can compose the compact post-Alienatio frame without changing the authored default', () => {
    const grant = {
      count: 2,
      emptyIndices: [0],
      cacochymicIndices: [],
    };

    expect(runCardUnitStackLayout(grant, false)).toEqual({
      stackCount: 2,
      stackIndices: [null, 1],
      abilityStackIndex: undefined,
    });
    expect(runCardUnitStackLayout(grant, true)).toEqual({
      stackCount: 1,
      stackIndices: [null, 0],
      abilityStackIndex: undefined,
    });
    const source = readFileSync(new URL('./RunCardFace.tsx', import.meta.url), 'utf8');
    expect(source).toContain('key={selectionId ?? `${grant.unit}-${index}`}');
  });

  it('holds a paired property/state face until both exact icon consumers settle', () => {
    // A card carries one property, so it owes one property icon and the one unit-state
    // icon that property bestows. Each pair is checked on a card that can actually exist.
    const pairs = [
      {
        face: runCardFaceContent(
          runCardSpecimen({ pieces: ['queen'], cardType: 'legatine' }),
          { adlected: true },
        ),
        state: 'unit-state:adlected',
        iconMedia: { propertyUrl: '/tactical.png', unitStateUrls: { discipline: '/discipline.png' } },
      },
      {
        face: runCardFaceContent(
          runCardSpecimen({ pieces: ['queen'], cardType: 'pestiferous', cacochymicPieceIndex: 0 }),
        ),
        state: 'unit-state:cacochymic',
        iconMedia: { propertyUrl: '/pestiferous.png', unitStateUrls: { plagued: '/plagued.png' } },
      },
      {
        face: runCardFaceContent(
          runCardSpecimen({ pieces: ['queen'], cardType: 'hieratic' }),
          { adlected: true },
        ),
        state: 'unit-state:agminate',
        iconMedia: { propertyUrl: '/hieratic.png', unitStateUrls: { marshalled: '/marshalled.png' } },
      },
    ] as const;

    for (const { face, state, iconMedia } of pairs) {
      const kinds = requiredRunCardImageKinds(face, iconMedia);
      expect(kinds).toContain('property-icon');
      expect(kinds).toContain(state);
      const signature = runCardPresentationSignature(
        face,
        '/frame.png',
        '/art.png',
        RUN_CARD_STANDARD_FRAME_GEOMETRY,
        '/coin.png',
        iconMedia,
      );
      const incomplete = new Set<RunCardImageKind>(kinds.filter((kind) => kind !== state));
      expect(runCardPresentationCanPromote(signature, signature, face, incomplete, iconMedia)).toBe(false);
      expect(runCardPresentationCanPromote(signature, signature, face, new Set(kinds), iconMedia)).toBe(true);
    }
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
    expect(source).toContain('key={layer.key}');
    expect(source).toContain('setDisplayedLayerKey(readyLayerKey);');
    expect(source.match(/requestAnimationFrame\(/g)).toHaveLength(2);
    expect(source).toContain('if (!ready || ready.signature !== signature) return;');
    expect(source).toContain('aria-busy={visiblePending ? true : undefined}');
    expect(style).toMatch(/\.run-card-face-layer\.is-pending\s*\{[\s\S]*?opacity:\s*0/);
  });

  it('prints cost only when the canonical face projection says the numeral belongs', () => {
    const source = readFileSync(new URL('./RunCardFace.tsx', import.meta.url), 'utf8');
    expect(source).toContain('card.showsCost ? (');
    expect(source).toContain("presented.card.showsCost ? ` Costs ${presented.card.cost} gold.` : ''");
  });

  it('projects per-property fitting and one shared unit-state fitting into both state seats', () => {
    const source = readFileSync(new URL('./RunCardFace.tsx', import.meta.url), 'utf8');
    const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(source).toContain("'--run-card-property-icon-scale': iconTuning.property.scale");
    expect(source).toContain("'--run-card-unit-state-icon-scale': iconTuning.unitState.scale");
    expect(source).toContain('className="run-card-prototype-unit-marker is-ability"');
    expect(source).not.toContain('run-card-prototype-ledger-ability');
    expect(style.match(/--run-card-unit-state-icon-scale/g)).toHaveLength(1);
    expect(style).toMatch(/\.run-card-prototype-property-icon\s*\{[\s\S]*?--run-card-property-icon-x/);
  });

  it('gives each same-role unit stack one stable larger prose-named hover reading', () => {
    const source = readFileSync(new URL('./RunCardFace.tsx', import.meta.url), 'utf8');
    const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(source).toContain('function UnitGrantStack');
    expect(source).toContain('className="run-card-prototype-unit-tooltip"');
    expect(source).toContain('title={unitName}');
    expect(source).toContain('className="run-card-prototype-unit-tooltip-sprite"');
    expect(source).toMatch(/className="run-card-prototype-unit-tooltip"[\s\S]*?focusable=\{false\}[\s\S]*?trigger=\{placements\.map/);
    expect(source.match(/className="run-card-prototype-unit-tooltip"/g)).toHaveLength(1);
    expect(style).toMatch(/\.run-card-prototype-unit-tooltip-sprite\s*\{[\s\S]*?block-size:\s*112px/);
  });

  it('makes card figures selectable only when a transactional host opts in', () => {
    const source = readFileSync(new URL('./RunCardFace.tsx', import.meta.url), 'utf8');
    const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    const highlightRule = style.match(/\.run-card-prototype-unit-icon-seat\.is-highlighted \.run-card-prototype-unit-icon\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(source).toContain('unitSelection?: RunCardUnitSelection | null;');
    expect(source).toContain('aria-label={selectionLabel}');
    expect(source).toContain('aria-pressed={highlighted}');
    expect(source).toContain("${selectionLabel ? ' is-selectable' : ''}");
    expect(source).toContain('runCardUnitSpriteAlphaHit(');
    expect(source).toContain('runCardUnitStackPointerTarget(');
    expect(source).toContain("button.classList.toggle('is-pixel-hovered', button === target)");
    expect(style).toContain('.run-card-prototype-unit-stack.has-pixel-hover');
    expect(style).not.toContain('.is-selectable:not(.is-highlighted):hover');
    expect(style).toMatch(/\.is-pixel-hovered:not\(\.is-highlighted\)[^{]+,\s*\.run-card-prototype-unit-icon-seat\.is-highlighted/);
    expect(highlightRule).toContain('var(--skirmish-cyan)');
    expect(highlightRule).not.toContain('#ff45d3');
    expect(highlightRule).not.toContain('transform');
  });
});
