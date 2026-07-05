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
