#!/usr/bin/env node
// GUARD: the layout mode has ONE width, and a responsive rule may not be dead on arrival.
//
// Two assertions, both paid for by the same bug.
//
// 1. ONE WIDTH. `src/ui/shell/layoutMode.ts` decides whether the app composes for desktop or for
//    mobile. `index.html` sets the same answer inline before first paint, and `style.css` styles
//    the same band. Three places, one number: if they drift, a phone gets a mobile tree inside a
//    desktop stylesheet, which is worse than either.
//
// 2. NO DEAD OVERRIDES. `@media` adds NOTHING to specificity. A rule inside a media query beats a
//    later rule only if it is more specific — never because it is "the mobile one". The Controls
//    panel frame was removed four times by a narrow-band rule that read:
//
//        @media (max-width: 860px) {
//          :root:has(…) :is(…) [data-shell-controls-panel]::before {
//            border-width: 0 !important;
//
//    …while the offscreen-rails contract ~8000 lines later set `border-width` on the SAME selector
//    with the SAME `!important`. Later wins. The panel kept a rail down one side, every capture and
//    every unit test stayed green, and the only detector was the owner looking at his phone.
//
//    So: for every declaration inside a media query, if the identical selector sets the identical
//    property LATER in the file at no lower importance, that declaration can never take effect.
//    Selector text must match exactly, which keeps this free of specificity guesswork and free of
//    false positives — it reports only the case where a rule was literally written twice and the
//    responsive one lost.
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const SHEET = 'src/style.css';
const MODE_MODULE = 'src/ui/shell/layoutMode.ts';
const BOOTSTRAP = 'index.html';

const failures = [];

// ---------------------------------------------------------------- one width

const modeSource = readFileSync(MODE_MODULE, 'utf8');
const declared = /export const MOBILE_LAYOUT_MAX_WIDTH = (\d+);/.exec(modeSource);
if (!declared) {
  failures.push(`${MODE_MODULE}: MOBILE_LAYOUT_MAX_WIDTH is not declared as a plain number.`);
}
const width = declared ? Number(declared[1]) : null;

if (width !== null) {
  const bootstrap = readFileSync(BOOTSTRAP, 'utf8');
  const bootstrapWidths = [...bootstrap.matchAll(/matchMedia\('\(max-width: (\d+)px\)'\)/g)]
    .map((match) => Number(match[1]));
  if (!bootstrapWidths.length) {
    failures.push(`${BOOTSTRAP}: no inline layout-mode bootstrap found; a phone will flash the desktop composition.`);
  } else if (bootstrapWidths.some((value) => value !== width)) {
    failures.push(
      `${BOOTSTRAP}: bootstrap width ${bootstrapWidths.join(', ')} does not match `
      + `MOBILE_LAYOUT_MAX_WIDTH ${width} in ${MODE_MODULE}.`,
    );
  }
}

const css = readFileSync(SHEET, 'utf8');
if (width !== null && !css.includes(`@media (max-width: ${width}px)`)) {
  failures.push(
    `${SHEET}: no \`@media (max-width: ${width}px)\` band; the stylesheet is not styling the mode `
    + `that ${MODE_MODULE} publishes.`,
  );
}

// ------------------------------------------------------- no dead overrides

const root = postcss.parse(css, { from: SHEET });

const normalize = (selector) => selector.replace(/\s+/g, ' ').trim();

/** Every declaration in the sheet, in source order, with the media query it sits in (if any). */
const declarations = [];
root.walkDecls((decl) => {
  const rule = decl.parent;
  if (!rule || rule.type !== 'rule') return;
  let media = null;
  for (let node = rule.parent; node; node = node.parent) {
    if (node.type === 'atrule' && node.name === 'media') { media = node; break; }
  }
  for (const selector of rule.selectors) {
    declarations.push({
      key: `${normalize(selector)}||${decl.prop.toLowerCase()}`,
      important: Boolean(decl.important),
      media,
      line: decl.source?.start?.line ?? 0,
      selector: normalize(selector),
      prop: decl.prop,
      params: media?.params ?? null,
    });
  }
});

const laterByKey = new Map();
for (const entry of declarations) {
  const seen = laterByKey.get(entry.key) ?? [];
  seen.push(entry);
  laterByKey.set(entry.key, seen);
}

// Only an UNCONDITIONAL later rule proves deadness. A later rule inside another media query may
// simply be narrower — `(max-width: 860px)` followed by `(max-width: 960px) and (max-height: 540px)`
// is a phone-landscape refinement, and the first still applies in portrait. Restricting the winner
// to a rule with no media context at all makes every report certain: an unconditional rule matches
// whenever the media one does, so the media one can never take effect anywhere.
const dead = [];
for (const entry of declarations) {
  if (!entry.media) continue;
  const siblings = laterByKey.get(entry.key) ?? [];
  const winner = siblings.find((other) => (
    other.line > entry.line
    && !other.media
    && (other.important || !entry.important)
  ));
  if (winner) dead.push({ entry, winner });
}

for (const { entry, winner } of dead) {
  failures.push(
    `${SHEET}:${entry.line}: \`${entry.prop}\` inside \`@media ${entry.params}\` can never apply — `
    + `${SHEET}:${winner.line} sets the same property on the identical selector `
    + `\`${entry.selector}\`${winner.important ? ' with !important' : ''}, and a media query adds no `
    + 'specificity, so the later rule wins. Express the difference structurally (see '
    + 'src/ui/shell/layoutMode.ts) or raise the responsive selector above the one it must beat.',
  );
}

if (failures.length) {
  console.error('check-layout-mode: FAILED\n');
  for (const failure of failures) console.error(`  - ${failure}\n`);
  process.exit(1);
}

console.log(`check-layout-mode: ok (mobile layout at max-width ${width}px; ${declarations.length} declarations checked)`);
