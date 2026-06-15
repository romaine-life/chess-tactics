import { useEffect } from 'react';
import { SkirmishBoard } from '../render/SkirmishBoard';
import { SkirmishHud } from './SkirmishHud';
import { useSkirmish } from '../game/store';

// The skirmish screen: PixiJS board + React HUD over the shared store. This is
// the Phase 2 vertical slice proving core -> Pixi render -> React UI end to end.
export function Skirmish() {
  const newSkirmish = useSkirmish((s) => s.newSkirmish);
  useEffect(() => {
    newSkirmish({ seed: 1 });
  }, [newSkirmish]);

  return (
    <div
      data-testid="skirmish"
      style={{
        display: 'flex',
        gap: 16,
        padding: 16,
        alignItems: 'flex-start',
        position: 'relative',
        zIndex: 5,
        pointerEvents: 'auto',
        color: 'var(--ds-ink-2)',
        fontFamily: 'var(--ds-font-sans)',
      }}
    >
      <SkirmishBoard />
      <SkirmishHud />
    </div>
  );
}
