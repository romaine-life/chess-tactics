import { describe, expect, it } from 'vitest';
import { levelEditorWallFaceGeometry } from './levelEditorWallFace';

describe('level editor wall-face hit geometry', () => {
  it('covers the full canonical west wall face at the board seat', () => {
    expect(levelEditorWallFaceGeometry('west', { left: 0, top: 0 })).toEqual({
      left: -48,
      top: -188,
      width: 48,
      height: 187,
      viewBox: '0 0 48 187',
      points: '0,27 48,0 48,160 0,187',
    });
  });

  it('uses the same full height for a north wall without inspecting its art', () => {
    expect(levelEditorWallFaceGeometry('north', { left: 120, top: 80 })).toEqual({
      left: 120,
      top: -108,
      width: 48,
      height: 187,
      viewBox: '0 0 48 187',
      points: '0,0 48,27 48,187 0,160',
    });
  });
});
