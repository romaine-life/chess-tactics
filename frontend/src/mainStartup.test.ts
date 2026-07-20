// @ts-nocheck - source-order regression guard; Vitest transpiles Node built-ins.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');

describe('critical live-content startup ordering', () => {
  it('hydrates media, drawable, and unit catalogs then complete prop seats before importing or rendering App', () => {
    expect(source).not.toMatch(/import\s+\{\s*App\s*\}\s+from\s+['"]\.\/ui\/App['"]/);
    const media = source.indexOf("retryStartup('critical-catalogs', () => Promise.all([loadLiveMediaCatalog(), loadDrawableCatalog(), loadLiveUnitCatalog()]))");
    const seats = source.indexOf("await retryStartup('prop-seats', loadLiveSeats)");
    const fontsStarted = source.indexOf("const criticalFonts = retryStartup('critical-fonts', loadCriticalFonts)");
    const fontsReady = source.indexOf('await criticalFonts;');
    const chrome = source.indexOf("await retryStartup('installed-chrome', composeInstalledChromeCss)");
    const appImport = source.indexOf("await import('./ui/App')");
    const appRender = source.indexOf('reactRoot.render(<App />)');

    expect(media).toBeGreaterThan(-1);
    expect(fontsStarted).toBeGreaterThan(-1);
    expect(fontsStarted).toBeLessThan(media);
    expect(seats).toBeGreaterThan(media);
    expect(fontsReady).toBeGreaterThan(seats);
    expect(chrome).toBeGreaterThan(fontsReady);
    expect(appImport).toBeGreaterThan(chrome);
    expect(appRender).toBeGreaterThan(appImport);
  });
});
