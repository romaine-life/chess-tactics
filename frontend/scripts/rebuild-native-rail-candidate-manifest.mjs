import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const nativeDir = resolve(frontend, 'public/assets/ui/chrome-candidates/native-rails-v1');
const outPath = resolve(frontend, 'src/ui/nativeRailCandidateManifest.json');
const familyConfigPath = resolve(frontend, 'config/native-rail-families.json');
const familyConfig = JSON.parse(readFileSync(familyConfigPath, 'utf8'));
const sources = [];

if (existsSync(nativeDir)) {
  for (const directory of readdirSync(nativeDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const reportPath = resolve(nativeDir, directory.name, 'report.json');
    if (!existsSync(reportPath)) continue;
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    for (let index = 0; index < report.accepted.length; index += 1) {
      const accepted = report.accepted[index];
      sources.push({
        id: `${report.id}-${String(index + 1).padStart(2, '0')}`,
        label: `${report.role === 'outer' ? 'Outer' : 'Inner'} native ${accepted.orientation} ${String(index + 1).padStart(2, '0')}`,
        role: report.role,
        fit: report.fit ?? 'repeat',
        orientation: accepted.orientation,
        src: accepted.src,
        width: accepted.width,
        height: accepted.height,
        nativeThickness: report.nativeThickness,
        nativeScale: 1,
        provider: report.provider,
        attemptId: report.id,
        sourceFile: accepted.file,
        seam: accepted.seam,
      });
    }
  }
}

const sourceById = new Map(sources.map((source) => [source.id, source]));
const assignedSourceIds = new Set();
const families = familyConfig.families.map((family) => {
  if (family.review?.assembledAtNativeScale !== true) {
    throw new Error(`${family.id}: family requires an assembled native-scale visual review`);
  }
  if (!family.review.artifact || !existsSync(resolve(frontend, family.review.artifact))) {
    throw new Error(`${family.id}: assembled review artifact is missing`);
  }
  const horizontalSourceIds = family.members.horizontalSourceIds;
  const verticalSourceIds = family.members.verticalSourceIds;
  if (!family.generationAttemptId) {
    throw new Error(`${family.id}: family must name the one generation attempt that produced every member`);
  }

  if (!horizontalSourceIds.length || !verticalSourceIds.length) {
    throw new Error(`${family.id}: a native rail family requires admitted horizontal and vertical members`);
  }

  for (const sourceId of [...horizontalSourceIds, ...verticalSourceIds]) {
    const source = sourceById.get(sourceId);
    if (!source || source.role !== family.role || source.fit !== family.fit) {
      throw new Error(`${family.id}: ${sourceId} does not match the family's ${family.role}/${family.fit} contract`);
    }
    if (source.attemptId !== family.generationAttemptId) {
      throw new Error(`${family.id}: ${sourceId} came from ${source.attemptId}; cross-attempt family pairing is prohibited`);
    }
    if (assignedSourceIds.has(sourceId)) throw new Error(`${sourceId}: assigned to more than one native rail family`);
    source.familyId = family.id;
    assignedSourceIds.add(sourceId);
  }

  return {
    id: family.id,
    label: family.label,
    role: family.role,
    fit: family.fit,
    generationAttemptId: family.generationAttemptId,
    review: family.review,
    horizontalSourceIds,
    verticalSourceIds,
  };
});

const unassignedSources = sources.filter((source) => !assignedSourceIds.has(source.id));

writeFileSync(outPath, `${JSON.stringify({
  generatedBy: 'scripts/rebuild-native-rail-candidate-manifest.mjs',
  families,
  unpairedSourceIds: unassignedSources.map((source) => source.id),
  sources,
}, null, 2)}\n`);
console.log(`wrote ${outPath} with ${families.length} reviewed families, ${unassignedSources.length} unpaired candidates, and ${sources.length} admitted native rails`);
