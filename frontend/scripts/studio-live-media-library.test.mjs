import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const designRoot = path.join(frontendRoot, 'src', 'ui', 'design');

describe('Studio live-media inventory guard', () => {
  it('keeps generated media rosters deleted and unimported', () => {
    const retired = ['artworkManifest.json', 'kitManifest.json', 'kitProvenance.json', 'kitUsage.json'];
    for (const file of retired) expect(fs.existsSync(path.join(designRoot, file)), file).toBe(false);

    const productionFiles = [
      path.join(designRoot, 'ArtworkLibraryStudio.tsx'),
      path.join(designRoot, 'AssetLibraryStudio.tsx'),
      path.join(designRoot, 'catalogData.ts'),
      path.join(frontendRoot, 'src', 'ui', 'TilePreview.tsx'),
    ];
    for (const file of productionFiles) {
      const source = fs.readFileSync(file, 'utf8');
      for (const retiredFile of retired) {
        expect(source, `${path.relative(frontendRoot, file)} imports ${retiredFile}`).not.toContain(retiredFile);
      }
    }
  });
});
