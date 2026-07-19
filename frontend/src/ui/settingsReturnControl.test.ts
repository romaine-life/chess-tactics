// @ts-nocheck - node built-ins are untyped in the app tsconfig; vitest runs this
// through esbuild, matching the repo's existing source-structure guard tests.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./Settings.tsx', import.meta.url), 'utf8');

describe('Settings return control', () => {
  it('keeps the title-bar back control mounted in the embedded menu shell', () => {
    expect(src).toContain('const returnControl = returnTo ? (');
    expect(src).toContain('<TitleBarControlContribution');
    expect(src).toContain("kind: 'navigation'");
    expect(src.replace(/\s+/g, '')).toContain('if(embedded)return<>{returnControl}{inner}</>;');
  });
});
