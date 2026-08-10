// The shipped main-menu / settings-rail chrome baselines the Pages tuner (MainMenuViewer)
// opens at and Resets to. These MIRROR literals baked into src/style.css — a tuner can't
// read CSS source at runtime — so mmLive.test.ts DERIVES each value back out of style.css
// and fails the moment the shipped rules and this constant disagree (ADR-0057: a
// hand-mirrored baseline must not be able to rot silently). When you re-bake the menu
// chrome, update BOTH style.css and this constant; the test names the exact rule.
//
// Sources in style.css (the first/desktop rule of each selector):
//   btnH  → .main-menu-mode-tab { min-height } — the MENU tab's REAL border-box height (the menu runs
//           shorter buttons than the .settings-tab base); mirrored so the tuner opens at the true size
//   icon  → .settings-tab { --settings-tab-icon-size }
//   railW → .settings-shell { grid-template-columns: <railW>px minmax(0, 1fr) }
//   gap   → .settings-rail-frame { gap: clamp(…) } — representative mid value, in-bounds
//   btnX/btnY → .settings-rail-frame { transform: translate(<btnX>px, <btnY>px) }; |btnX| is ALSO the
//           .settings-shell margin floor (max(<|btnX|>px, …)) — the zoom-safety coupling (ADR-0062)
//   textX → .settings-tab > span:not(.settings-tab-icon) { transform: translateX(<textX>px) }
export const MM_LIVE = { btnH: 61, railW: 322, gap: 11, icon: 64, textX: 16, btnX: -238, btnY: -21 } as const;

// The label's TEXT TREATMENT, mirrored from the same stylesheet on the same terms (the tuner's
// "Button label" group opens here and Resets here). Sources:
//   shadow* → .settings-row h4, .settings-tab strong { text-shadow: <x> <y> <blur> <colour> }
//             — the ONE shipped treatment: a hard drop shadow straight down, zero blur. It reads
//             as a dark edge UNDER the glyphs and nothing on the other three sides.
//   stroke  → nothing ships an outline: no -webkit-text-stroke, no paint-order, no shadow ring.
//             So the stroke controls open at 0 and mmLive.test.ts asserts the shipped rule still
//             carries no stroke — the mirror has to stay honest in BOTH directions, or "0" would
//             silently stop meaning "what ships".
export const MM_LABEL_LIVE = {
  shadowX: 0,
  shadowY: 2,
  shadowBlur: 0,
  shadowColor: '#02070b',
  outline: 'off',
  strokeW: 0,
  strokeColor: '#02070b',
} as const;

/** CSS shorthand length: a zero term is written bare (`0`), matching how the shipped rule reads. */
export const cssLen = (n: number): string => (n === 0 ? '0' : `${n}px`);
