import { useEffect, useState } from 'react';

// Screen entrance transition (ADR-0046). The single built-in primitive for fading a screen's
// chrome in when you navigate to it. Spread the returned className onto the screen's CHROME
// ROOT only (e.g. .settings-shell) — never the screen's outer element, which also hosts the
// persistent ambience backdrop: the homepage rain must stay continuous across art-background
// screens, so it lives OUTSIDE the faded chrome and never re-fades (ADR-0046 B/G).
//
// Behaviour: on a NAVIGATION-driven mount the chrome paints at opacity 0, then fades to 1 over
// the entrance tier (slow + decelerate, ADR-0043) and is inert (pointer-events:none) until the
// fade settles (ADR-0046 D — no starting a new transition mid-transition). CSS owns the
// opacity keyframes so the start value is tied to element insertion, not to a one-frame React
// class flip. A pure opacity fade is reduced-motion-safe, so it is NOT gated on
// prefers-reduced-motion (ADR-0043).
//
// Readiness (ADR-0046 C.1 / ADR-0051): reveal is decoupled from mount. A screen whose content
// arrives async (e.g. the Campaign play screen hydrating the campaign store) passes
// `ready:false` until it has something real to show; the chrome HOLDS invisible-and-inert, then
// plays the one deterministic fade when readiness lands — never a fade over an empty frame with
// content popping in after. Screens with synchronous content (or a designed in-chrome loading
// state) simply omit the flag. A generous failsafe force-starts the fade so a dead fetch can
// never strand a screen invisible. A hold applies on COLD loads too (a cold-loaded /campaign is
// as empty as a navigated-to one); ready cold mounts still skip the fade — the main menu's
// cold-load reveal owns that first appearance, and a second fade would double up. App flips the
// nav flag on the first navigation.

let appHasNavigated = false;

// Call once per navigation (from App's nav handler), BEFORE the destination screen mounts.
export function markScreenNavigation(): void {
  appHasNavigated = true;
}

// MUST match --ds-duration-fade in style.css: the inert-during-motion window == the fade length.
const SCREEN_FADE_MS = 350;

// Failsafe for a screen whose `ready` never lands (hung fetch): force the reveal rather than
// strand an invisible screen. Generous on purpose — real readiness drives the reveal; this
// only rescues a genuinely stuck load (same posture as shell/coldReveal's failsafe).
const READY_FAILSAFE_MS = 4000;

type EntrancePhase = 'hold' | 'fade' | 'settled';

export function useScreenEntrance(ready: boolean = true): string {
  // Freeze the mount conditions: did we arrive via navigation, and was content ready?
  const [initial] = useState(() => ({ navMount: appHasNavigated, ready }));
  const [phase, setPhase] = useState<EntrancePhase>(() => {
    if (!initial.ready) return 'hold';
    return initial.navMount ? 'fade' : 'settled';
  });

  // Held: start the fade when readiness lands (or the failsafe fires).
  useEffect(() => {
    if (phase !== 'hold') return undefined;
    if (ready) {
      setPhase('fade');
      return undefined;
    }
    const failsafe = window.setTimeout(() => setPhase('fade'), READY_FAILSAFE_MS);
    return () => window.clearTimeout(failsafe);
  }, [phase, ready]);

  // Fading: settle (and unlock) once the fade completes. The timer starts when the fade
  // STARTS — after any hold — so a held screen isn't unlocked while still invisible.
  useEffect(() => {
    if (phase !== 'fade') return undefined;
    const timer = window.setTimeout(() => setPhase('settled'), SCREEN_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === 'hold') return 'screen-enter-hold';
  if (phase === 'fade') return 'screen-enter screen-enter-lock';
  // Settled: keep .screen-enter (its `both` fill is the resting opacity-1 state) on any
  // chrome that faded in; a ready cold mount never faded and stays classless.
  return initial.navMount || !initial.ready ? 'screen-enter' : '';
}
