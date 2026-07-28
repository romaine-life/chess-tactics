import { describe, expect, it } from 'vitest';

import { levelEditorRouteIdentity } from './levelEditorRouteIdentity';

describe('levelEditorRouteIdentity', () => {
  it('remounts a same-path editor navigation when the level/document changes', () => {
    const a = levelEditorRouteIdentity('?levelId=off-l-hold-bridge&document=doc-a&generationFrame=1');
    const b = levelEditorRouteIdentity('?levelId=off-l-river-watch&document=doc-b&generationFrame=1');
    expect(a).not.toBe(b);
  });

  it('treats the opaque document as the authority boundary even when level ids match', () => {
    const ownerA = levelEditorRouteIdentity('?levelId=l1&document=doc-owner-a');
    const ownerB = levelEditorRouteIdentity('?levelId=l1&document=doc-owner-b');
    expect(ownerA).toBe('document:doc-owner-a');
    expect(ownerB).toBe('document:doc-owner-b');
    expect(ownerA).not.toBe(ownerB);
  });

  it('keeps one editor lifecycle across presentation-only query changes', () => {
    const editor = levelEditorRouteIdentity('?levelId=off-l-hold-bridge&document=doc-a');
    const framed = levelEditorRouteIdentity('?levelId=off-l-hold-bridge&document=doc-a&generationFrame=1&layer=status');
    expect(framed).toBe(editor);
  });

  it('uses the opaque document when no level id is present and normalizes legacy map links', () => {
    expect(levelEditorRouteIdentity('?document=doc-a')).toBe('document:doc-a');
    expect(levelEditorRouteIdentity('?map=j5kip7ztaipw')).toBe('document:legacy-j5kip7ztaipw');
  });
});
