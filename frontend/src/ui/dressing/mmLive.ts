// The shipped main-menu / settings-rail chrome baselines the Pages tuner (MainMenuViewer)
// opens at and Resets to. These MIRROR literals baked into src/style.css — a tuner can't
// read CSS source at runtime — so mmLive.test.ts DERIVES each value back out of style.css
// and fails the moment the shipped rules and this constant disagree (ADR-0057: a
// hand-mirrored baseline must not be able to rot silently). When you re-bake the menu
// chrome, update BOTH style.css and this constant; the test names the exact rule.
//
// Sources in style.css (the first/desktop rule of each selector):
//   btnH  → .settings-tab { min-height }
//   icon  → .settings-tab { --settings-tab-icon-size }
//   railW → .settings-shell { grid-template-columns: <railW>px minmax(0, 1fr) }
//   gap   → .settings-rail-frame { gap: clamp(…) } — representative mid value, in-bounds
//   btnX/btnY → .settings-rail-frame { transform: translate(<btnX>px, <btnY>px) }
//   textX → .settings-tab > span:not(.settings-tab-icon) { transform: translateX(<textX>px) }
export const MM_LIVE = { btnH: 56, railW: 487, gap: 11, icon: 64, textX: 37, btnX: -230, btnY: -21 } as const;
