import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./ChromeLab.tsx', import.meta.url), 'utf8');

describe('Chrome Lab installed-role save', () => {
  it('preserves the installed Chrome role when replacing its tuning', () => {
    expect(source).toMatch(
      /behavior:\s*\{\s*\.\.\.installed\.behavior,\s*\.\.\.payload,\s*roles:\s*installed\.behavior\.roles,\s*\}/,
    );
    expect(source).not.toContain('behavior: payload,');
  });
});
