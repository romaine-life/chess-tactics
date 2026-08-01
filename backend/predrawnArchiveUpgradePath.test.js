const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  migrationChecksum,
  planMigrationExecution,
} = require('./schemaMigrationIntegrity');
const { extractInlineMigrations } = require('./schemaMigrationSource');

const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const smokeSource = fs.readFileSync(path.join(__dirname, 'smoke-test.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const migrationCommandSource = fs.readFileSync(
  path.join(__dirname, 'scripts', 'run-schema-migrations.mjs'),
  'utf8',
);
const inlineMigrations = extractInlineMigrations(serverSource);

function sourceSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `source contract marker must remain inspectable: ${startMarker}`);
  assert.ok(end > start, `source contract end marker must remain inspectable: ${endMarker}`);
  return source.slice(start, end);
}

function inlineMigration(version) {
  const migration = inlineMigrations.find((candidate) => candidate.version === version);
  assert.ok(migration, `inline migration ${version} must exist`);
  return migration;
}

function normalizedSql(sql) {
  return sql.replace(/\r\n/g, '\n').trim().replace(/\s+/g, ' ');
}

function migrationVersions() {
  return inlineMigrations.map((migration) => migration.version);
}

test('already-applied migration 36 remains the immutable drawable-media migration', () => {
  const migration36 = inlineMigration(36);
  assert.equal(
    migration36.name,
    'allow one drawable media slot to satisfy multiple roles',
    'migration 36 was applied under this identity and must never be repurposed',
  );
  assert.equal(
    normalizedSql(migration36.sql),
    normalizedSql(`
      ALTER TABLE drawable_asset_media
        DROP CONSTRAINT IF EXISTS drawable_asset_media_asset_id_slot_key;
    `),
    'migration 36 SQL is immutable historical database state',
  );
  assert.doesNotMatch(
    migration36.sql,
    /generation-attempt-archive|level_working_copy_revisions/,
    'the archive repair must not be smuggled into already-applied migration 36',
  );
});

test('the exact sparse numeric legacy history upgrades through migration 49', () => {
  const versions = migrationVersions();
  const appliedBeforeUpgrade = new Set(
    versions.filter((version) => version <= 27 || version === 36),
  );
  const pending = versions.filter((version) => !appliedBeforeUpgrade.has(version));
  assert.ok(!pending.includes(36), 'a normal migration runner correctly skips recorded migration 36');
  assert.deepEqual(
    pending.filter((version) => version < 37),
    [28, 29, 30, 31, 32, 33, 34, 35],
    'the migrations absent from the former sparse registry must remain pending',
  );
  assert.ok(pending.includes(37), 'the archive repair must have its own pending migration 37');
  assert.ok(pending.includes(38), 'the temporary legacy sealing bridge must be closed by migration 38');
  assert.ok(pending.includes(39), 'same-slot warp retry must have its own pending migration 39');
  assert.ok(
    pending.includes(40),
    'cyan move-highlight calibration must have its own pending migration 40',
  );
  assert.ok(
    pending.includes(41),
    'the stable move-highlight constraint identifier must have its own pending migration 41',
  );
  assert.ok(
    pending.includes(42),
    'occlusion-stage discard audit must have its own pending migration 42',
  );
  assert.ok(
    pending.includes(43),
    'forward-compatible attempt schema repair must have its own pending migration 43',
  );
  assert.ok(
    pending.includes(44),
    'War workspaces and account Run persistence must have their own pending migration 44',
  );
  assert.ok(
    pending.includes(45),
    'owner-scoped Run relic statistics must have their own pending migration 45',
  );
  assert.ok(
    pending.includes(46),
    'the installed Play hub-root route must have its own pending migration 46',
  );
  assert.ok(
    pending.includes(47),
    'the applied card-scenes table creation must stay in history as pending migration 47',
  );
  assert.ok(
    pending.includes(48),
    'the card-scenes retirement must be its own append-only pending migration 48',
  );

  const migration37 = inlineMigration(37);
  assert.match(
    migration37.sql,
    /ALTER TABLE\s+schema_migrations[\s\S]*ADD COLUMN IF NOT EXISTS\s+name/i,
    'migration 37 must add durable migration identity metadata',
  );
  assert.match(
    migration37.sql,
    /ALTER TABLE\s+schema_migrations[\s\S]*ADD COLUMN IF NOT EXISTS\s+checksum/i,
    'migration 37 must add durable migration content metadata',
  );
  assert.match(
    migration37.sql,
    /generation-attempt-archive/,
    'migration 37 must admit the archive revision reason',
  );
  assert.match(
    migration37.sql,
    /DROP CONSTRAINT IF EXISTS\s+level_working_copy_revisions_reason_check/i,
    'migration 37 must retire the duplicated inline reason CHECK',
  );
  assert.match(
    migration37.sql,
    /FOREIGN KEY\s*\(\s*reason\s*\)[\s\S]*REFERENCES/i,
    'migration 37 must bind revision reasons to the canonical reason catalog',
  );
  const migration38 = inlineMigration(38);
  assert.match(
    migration38.sql,
    /ALTER COLUMN\s+name\s+SET NOT NULL[\s\S]*ALTER COLUMN\s+checksum\s+SET NOT NULL/i,
    'migration 38 must make numeric-only future history impossible at the database boundary',
  );
  const migration39 = inlineMigration(39);
  assert.match(
    migration39.sql,
    /processing_revision[\s\S]*stage-discarded/,
    'migration 39 must persist the retry epoch and its audit action',
  );
  const migration40 = inlineMigration(40);
  assert.equal(
    migration40.name,
    'attempt-owned cyan move-highlight calibration',
    'migration 40 must retain its recorded identity',
  );
  assert.match(
    migration40.sql,
    /move_highlight_profile[\s\S]*move_highlight_profile_sha256[\s\S]*move_highlight_profile_warped_version_id/,
    'migration 40 must persist the attempt-owned cyan move-highlight profile bundle',
  );
  assert.match(
    migration40.sql,
    /FOREIGN KEY\s*\(\s*move_highlight_profile_warped_version_id,\s*document_id\s*\)[\s\S]*REFERENCES\s+predrawn_background_versions\s*\(\s*id,\s*document_id\s*\)/i,
    'migration 40 must fence the profile to an exact warped background version',
  );
  assert.match(
    migration40.sql,
    /move-highlight-profile-updated/,
    'migration 40 must admit the profile update audit action',
  );
  assert.match(
    migration40.sql,
    /ADD CONSTRAINT\s+predrawn_generation_attempts_move_highlight_profile_bundle_check/i,
    'migration 40 must preserve its historical overlong source identifier instead of being edited in place',
  );
  const migration41 = inlineMigration(41);
  assert.equal(
    migration41.name,
    'use a stable move-highlight constraint identifier',
    'migration 41 must have a durable identity for the append-only correction',
  );
  assert.match(
    migration41.sql,
    /DROP CONSTRAINT IF EXISTS\s+predrawn_generation_attempts_move_highlight_profile_bundle_chec/i,
    'migration 41 must remove the 63-byte catalog identifier PostgreSQL produced for migration 40',
  );
  assert.match(
    migration41.sql,
    /ADD CONSTRAINT\s+predrawn_generation_attempts_move_highlight_bundle_check/i,
    'migration 41 must install the bounded canonical bundle-check identifier',
  );
  assert.doesNotMatch(
    migration41.sql,
    /ADD CONSTRAINT\s+predrawn_generation_attempts_move_highlight_profile_bundle_check/i,
    'migration 41 must not recreate the identifier PostgreSQL truncates',
  );
  const migration42 = inlineMigration(42);
  assert.equal(
    migration42.name,
    'record occlusion-stage discard audit',
    'migration 42 must have a durable identity for mask retry audit',
  );
  assert.match(
    migration42.sql,
    /generation-attempt-occlusion-discard/,
    'migration 42 must register the working-copy revision reason',
  );
  assert.match(
    migration42.sql,
    /attempt-detached/,
    'migration 42 must admit retained-version detachment audit events',
  );
  const migration43 = inlineMigration(43);
  assert.equal(
    migration43.name,
    'repair generation attempt schema from final state',
    'migration 43 must retain its append-only final-state repair identity',
  );
  assert.match(
    migration43.sql,
    /CREATE TABLE IF NOT EXISTS\s+predrawn_generation_attempts[\s\S]*CREATE TABLE IF NOT EXISTS\s+predrawn_generation_attempt_events/i,
    'migration 43 must recreate either missing generation-attempt relation from final state',
  );
  assert.match(
    migration43.sql,
    /origin = 'pipeline-source'[\s\S]*generated_version_id = source_version_id/,
    'migration 43 must accept an already-valid reusable pipeline-source attempt',
  );
  assert.match(
    migration43.sql,
    /CHECK\s*\(\s*warped_version_id IS NULL OR generated_version_id IS NOT NULL\s*\)/,
    'a freshly repaired attempt relation must retain the warped-stage dependency',
  );
  assert.match(
    migration43.sql,
    /CHECK\s*\(\s*occlusion_version_id IS NULL OR warped_version_id IS NOT NULL\s*\)/,
    'a freshly repaired attempt relation must retain the occlusion-stage dependency',
  );
  assert.match(
    migration43.sql,
    /CHECK \(action IN \([\s\S]*'stage-discarded'[\s\S]*'move-highlight-profile-updated'/,
    'migration 43 must install only the final audit action set',
  );
  assert.doesNotMatch(
    migration43.sql,
    /RAISE EXCEPTION[\s\S]*pipeline-source/,
    'final-state repair must not reject a pipeline-source row merely because it exists',
  );
  assert.match(
    migration43.sql,
    /DROP CONSTRAINT[\s\S]*ALTER COLUMN move_highlight_profile TYPE jsonb\s+USING move_highlight_profile::jsonb,\s*ALTER COLUMN move_highlight_profile DROP NOT NULL,\s*ALTER COLUMN move_highlight_profile_sha256 TYPE text\s+USING move_highlight_profile_sha256::text,\s*ALTER COLUMN move_highlight_profile_sha256 DROP NOT NULL,\s*ALTER COLUMN move_highlight_profile_warped_version_id TYPE uuid\s+USING move_highlight_profile_warped_version_id::uuid,\s*ALTER COLUMN move_highlight_profile_warped_version_id DROP NOT NULL;[\s\S]*ADD CONSTRAINT predrawn_generation_attempts_move_highlight_bundle_check/,
    'move-highlight repair must remove dependencies before restoring exact nullable column types',
  );
  const migration44 = inlineMigration(44);
  assert.equal(
    migration44.name,
    'wars in canonical workspaces + account active runs',
    'migration 44 must retain its durable Run feature identity',
  );
  assert.match(
    migration44.sql,
    /UPDATE\s+campaign_workspaces[\s\S]*jsonb_set\(body,\s*'\{wars\}'[\s\S]*UPDATE\s+official_campaigns[\s\S]*jsonb_set\(data,\s*'\{wars\}'/i,
    'migration 44 must upgrade both canonical workspace tiers with a Wars collection',
  );
  assert.match(
    migration44.sql,
    /CREATE TABLE IF NOT EXISTS\s+active_runs[\s\S]*owner_email\s+text\s+PRIMARY KEY[\s\S]*revision\s+integer/i,
    'migration 44 must create one revisioned active Run document per account',
  );
  const migration45 = inlineMigration(45);
  assert.equal(
    migration45.name,
    'owner-scoped idempotent Run relic statistics',
    'migration 45 must retain its applied database identity',
  );
  assert.equal(
    migrationChecksum(migration45),
    '92ac1e06bcc16bc73cadfeb9c0cab39f08bf8b15a106cfe198d434c693fb2e67',
    'migration 45 must match the identity already recorded in the shared development ledger',
  );
  assert.match(
    migration45.sql,
    /CREATE TABLE IF NOT EXISTS\s+run_relic_stat_events[\s\S]*PRIMARY KEY\s*\(\s*owner_email,\s*event_id,\s*relic_id\s*\)/i,
    'migration 45 must make repeated event delivery idempotent per owner and relic',
  );
  assert.match(
    migration45.sql,
    /CHECK\s*\(\s*event_kind IN\s*\(\s*'picked',\s*'battle-win'\s*\)\s*\)/i,
    'migration 45 must keep the relic-stat event vocabulary closed',
  );
  const migration46 = inlineMigration(46);
  assert.equal(
    migration46.name,
    'installed play menu entry lands on the play hub root',
    'migration 46 must retain its applied database identity',
  );
  assert.equal(
    migrationChecksum(migration46),
    '7895259aeadb1a4729e61a2b08ae502f37a6006bdea8327e158fd82cb5bb0549',
    'migration 46 must match the identity already recorded in the shared development ledger',
  );
  assert.match(
    migration46.sql,
    /behavior->>'value' = 'play'[\s\S]*behavior->>'route' = '\/play\/select\/skirmish'/,
    'migration 46 must be guarded to the retired canonical Play route so an owner-authored route survives',
  );
  assert.match(
    migration46.sql,
    /jsonb_set\(behavior,\s*'\{route\}',\s*'"\/play\/select"'::jsonb\)/,
    'migration 46 must land the installed Play entry on the bare selector root',
  );
  assert.match(
    migration46.sql,
    /INSERT INTO drawable_asset_events[\s\S]*UPDATE drawable_catalog_state[\s\S]*EXISTS \(SELECT 1 FROM logged\)/,
    'migration 46 must audit the route change and bump the catalog revision only when a row changed',
  );

  const migration47 = inlineMigration(47);
  assert.equal(
    migration47.name,
    'owner-authored Run card scene overrides',
    'migration 47 was applied under this identity and must never be repurposed after the feature removal',
  );
  assert.equal(
    migrationChecksum(migration47),
    'e6299b756983cfd73be8da6433812f021f5db75c197bd50f52ee0b398670a172',
    'migration 47 must match the identity already recorded in the shared development ledger',
  );
  const migration48 = inlineMigration(48);
  assert.match(
    migration48.sql,
    /DROP TABLE IF EXISTS\s+card_scene_documents/i,
    'migration 48 must retire the card-scenes table append-only instead of editing applied migration 47',
  );
  assert.doesNotMatch(
    migration48.sql,
    /CREATE TABLE/i,
    'migration 48 is a pure retirement and must not smuggle in new schema',
  );
  const migration49 = inlineMigration(49);
  assert.equal(
    migration49.name,
    'account-scoped Ataraxia progression',
    'migration 49 must own the durable cross-Run Ataraxia unlock identity',
  );
  assert.match(
    migration49.sql,
    /CREATE TABLE IF NOT EXISTS\s+run_progression[\s\S]*highest_completed_ataraxia_tier[\s\S]*CHECK \(highest_completed_ataraxia_tier >= -1\)/i,
    'migration 49 must preserve the pre-baseline state and monotonic tier field',
  );

  const migration36 = inlineMigration(36);
  const allMigrations = versions.map(inlineMigration);
  const sealedManifest = allMigrations.map((migration) => ({
    version: migration.version,
    name: migration.name,
    checksum: migrationChecksum(migration),
  }));
  const numericOnlySparseHistory = versions
    .filter((version) => version <= 27 || version === 36)
    .map((version) => ({ version, name: null, checksum: null }));
  const plan = planMigrationExecution(
    allMigrations,
    numericOnlySparseHistory,
    {
      allowUnsealed: true,
      allowLegacySparseVersions: [36],
    },
  );
  assert.deepEqual(
    plan.skipped.map((entry) => entry.version),
    [...versions.filter((version) => version <= 27), 36],
    'the bridge must skip only the exact numeric-only history that actually shipped',
  );
  assert.deepEqual(
    plan.pending.map((entry) => entry.version),
    [28, 29, 30, 31, 32, 33, 34, 35, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49],
    'the bridge must fill the historical gap before applying every post-36 contract',
  );
  assert.throws(
    () => planMigrationExecution(
      allMigrations.map((migration) => migration.version === 36
        ? {
            ...migration36,
            sql: `${migration36.sql}\nALTER TABLE level_working_copy_revisions DROP CONSTRAINT level_working_copy_revisions_reason_check;`,
          }
        : migration),
      sealedManifest.filter((entry) => entry.version <= 36),
    ),
    (error) => (
      error?.code === 'schema_migration_history_invalid'
      && error?.details?.changed_versions?.includes(36)
    ),
    'editing recorded migration 36 must stop startup instead of silently skipping its new contents',
  );

  assert.match(
    serverSource,
    /allowLegacySparseVersions:\s*canSealLegacyHistory[\s\S]*LEGACY_SPARSE_SCHEMA_HISTORY_VERSIONS/,
    'auto migration planning must opt into only the named legacy sparse bridge before sealing',
  );
  assert.match(
    serverSource,
    /allowLegacySparseVersions:\s*!history\.hasIdentity[\s\S]*LEGACY_SPARSE_SCHEMA_HISTORY_VERSIONS/,
    'read-only migration checks must report the real sparse baseline as pending rather than corrupt',
  );
});

test('required-schema readiness and repair enforce the migrations 37 through 49 contracts', () => {
  const relations = sourceSection(
    serverSource,
    'const REQUIRED_SCHEMA_RELATIONS = [',
    '\n];',
  );
  const repairs = sourceSection(
    serverSource,
    'const REQUIRED_SCHEMA_REPAIR_MIGRATIONS = new Map([',
    '\n]);',
  );
  assert.match(
    relations,
    /level_working_copy_revision_reasons/,
    'the reason catalog must be required runtime schema',
  );
  assert.match(
    repairs,
    /\['level_working_copy_revisions',\s*\[24,\s*37\]\]/,
    'relation repair must replay the original table creation and the new reason contract',
  );
  assert.doesNotMatch(
    repairs,
    /\['level_working_copy_revisions',\s*\[[^\]]*\b36\b/,
    'relation repair must not reinterpret immutable migration 36',
  );
  assert.match(
    repairs,
    /\['predrawn_generation_attempts',\s*43\]/,
    'generation-attempt relation repair must use the final-state migration',
  );
  assert.match(
    repairs,
    /\['predrawn_generation_attempt_events',\s*43\]/,
    'generation-attempt event repair must use the final-state migration',
  );
  assert.match(
    relations,
    /run_relic_stat_events/,
    'Run relic-stat events must be required runtime schema once migration 45 is recorded',
  );
  assert.match(
    repairs,
    /\['run_relic_stat_events',\s*45\]/,
    'Run relic-stat relation repair must replay migration 45',
  );
  assert.match(relations, /run_progression/, 'Ataraxia progression must be required runtime schema');
  assert.match(
    repairs,
    /\['run_progression',\s*49\]/,
    'Ataraxia progression relation repair must replay migration 49',
  );
  const relationRepair = sourceSection(
    serverSource,
    'async function repairRequiredSchemaRelations(',
    '\nasync function checkRequiredSchemaRelations(',
  );
  assert.match(
    relationRepair,
    /await executeMigration\([\s\S]*completedSteps\.push\([\s\S]*markInspection\(/,
    'each successful relation repair migration must be reported before a later step can fail',
  );

  const contractReadiness = sourceSection(
    serverSource,
    'async function workingCopyRevisionReasonConstraintRows(',
    '\nasync function checkMigrations()',
  );
  assert.match(
    contractReadiness,
    /FROM pg_constraint/,
    'readiness must inspect the live constraint topology, not only catalog rows',
  );
  assert.match(
    contractReadiness,
    /reason_check_constraints/,
    'a stale inline reason CHECK must keep the database unready',
  );
  assert.match(
    contractReadiness,
    /canonical_reason_foreign_key_count\s*!==\s*1/,
    'readiness must require exactly one canonical reason foreign key',
  );
  assert.match(
    contractReadiness,
    /level_working_copy_revisions_reason_fk/,
    'readiness must verify the exact canonical foreign-key identity',
  );
  assert.match(
    contractReadiness,
    /update_action === 'r'[\s\S]*delete_action === 'r'/,
    'readiness must verify the restrictive update and delete actions',
  );
  assert.match(
    contractReadiness,
    /SELECT column_name,\s*is_nullable,\s*data_type[\s\S]*information_schema\.columns[\s\S]*table_name = 'schema_migrations'/,
    'readiness must inspect whether both migration identity columns are non-null',
  );
  assert.match(
    contractReadiness,
    /local_table\.relname = 'schema_migrations'[\s\S]*constraint_entry\.contype = 'c'/,
    'readiness must inspect the live migration identity CHECK topology',
  );
  assert.match(
    contractReadiness,
    /schemaMigrationIdentityRepair\(issues\)[\s\S]*identityRepair\.migration_version/,
    'auto repair must replay migration 38 when the database identity boundary drifts',
  );
  assert.match(
    contractReadiness,
    /generationAttemptRetryContractIssuesPresent\(issues\)[\s\S]*version === 43/,
    'auto repair must use migration 43 when the same-slot retry boundary drifts',
  );
  assert.match(
    contractReadiness,
    /generationAttemptMoveHighlightContractIssuesPresent\(issues\)[\s\S]*version === 43/,
    'auto repair must use migration 43 when the cyan move-highlight boundary drifts',
  );
  assert.match(
    contractReadiness,
    /await executeMigration\(migration,\s*'repair generation-attempt move-highlight contract'\)/,
    'readiness repair must execute the forward-compatible final-state migration once',
  );
  assert.match(
    contractReadiness,
    /occlusionDiscardReason[\s\S]*version === 42[\s\S]*repair occlusion-discard revision reason contract/,
    'auto repair must restore the migration-42 occlusion-discard revision reason',
  );
  assert.match(
    contractReadiness,
    /await executeMigration\(migration,\s*'repair working-copy revision reason contract'\)[\s\S]*completedSteps\.push\([\s\S]*markInspection\([\s\S]*issues = await requiredSchemaContractIssues\(client\)/,
    'post-repair re-inspection must clear the migration marker and use an explicit inspection phase',
  );

  const historyReader = sourceSection(
    serverSource,
    'async function schemaMigrationHistoryRows(',
    '\nasync function insertSchemaMigrationHistory(',
  );
  assert.match(
    historyReader,
    /!hasIdentity[\s\S]*row\.version\)\s*>=\s*CHECKSUMMED_SCHEMA_HISTORY_MIGRATION_VERSION/,
    'recorded migration 37 must be impossible without its identity columns',
  );
  assert.match(
    historyReader,
    /MigrationIntegrityError/,
    'identity-column corruption must fail closed as migration-history corruption',
  );
});

test('the production runner checks identities and reports what actually ran', () => {
  const runner = sourceSection(
    serverSource,
    'async function runMigrations()',
    '\nclass SchemaMigrationRequiredError',
  );
  assert.match(
    runner,
    /planMigrationExecution\(MIGRATIONS,\s*history\.rows/,
    'the production runner must compare recorded migration identities before choosing work',
  );
  assert.match(
    runner,
    /insertSchemaMigrationHistory\(client,\s*migration\)/,
    'the production runner must record each applied migration through the identity writer',
  );
  assert.match(
    runner,
    /return migrationRunResult\(plan,\s*appliedVersions,\s*activity\(\)\)/,
    'the production runner must return its exact migration and repair activity',
  );
  assert.match(
    runner,
    /migrationExecutionFailure\([\s\S]*appliedVersions[\s\S]*failingMigration[\s\S]*activity\(\)/,
    'a partial-commit failure must retain exact applied, failing, and repair activity',
  );
  assert.match(
    runner,
    /failurePhase = 'verify required schema postconditions'/,
    'postcondition failures must retain the partial migration report',
  );
  assert.match(
    runner,
    /await sealLegacyHistory\(identityMigration,\s*'seal legacy migration identities'\);[\s\S]*markInspectionPhase\('verify sealed legacy migration history'\);[\s\S]*history = await schemaMigrationHistoryRows\(client\)/,
    'initial legacy sealing must clear the migration marker before history reinspection',
  );
  assert.match(
    runner,
    /await sealLegacyHistory\([\s\S]*`seal legacy migration identities after migration \$\{migration\.version\}`[\s\S]*markInspectionPhase\([\s\S]*`verify legacy migration identities sealed after migration \$\{migration\.version\}`[\s\S]*const sealedIdentityHistory = await schemaMigrationHistoryRows\(client\)/,
    'post-migration-37 sealing must use an explicit inspection phase for its follow-up read',
  );
  assert.match(
    runner,
    /completedRelationRepairSteps[\s\S]*completedContractRepairSteps[\s\S]*sealedLegacyVersions/,
    'the production report must expose every schema mutation outside pending migrations',
  );

  const identityWriter = sourceSection(
    serverSource,
    'async function insertSchemaMigrationHistory(',
    '\nasync function sealLegacySchemaMigrationHistory(',
  );
  assert.match(
    identityWriter,
    /INSERT INTO schema_migrations\s*\(version,\s*name,\s*checksum\)/,
    'newly applied migrations must record their immutable identity',
  );
  const legacySealer = sourceSection(
    serverSource,
    'async function sealLegacySchemaMigrationHistory(',
    '\nfunction schemaMigrationHistoryCanSealLegacy(',
  );
  assert.match(
    legacySealer,
    /migration\.version > LEGACY_SCHEMA_HISTORY_MAX_VERSION/,
    'the one-time sealer must never bless an unidentified migration after legacy version 36',
  );

  const readyMessage = sourceSection(
    serverSource,
    'function schemaReadyMessage()',
    '\n// Idempotent, self-healing readiness',
  );
  assert.match(
    readyMessage,
    /formatMigrationRunResult\(schemaMigrationRunReport\)/,
    'startup output must be derived from the actual migration result',
  );
  assert.doesNotMatch(
    readyMessage,
    /schema migrations applied['"]/,
    'startup must not use the old unconditional success message',
  );
});

test('local schema mutation is a dedicated one-shot command, not normal server startup', () => {
  assert.equal(
    packageJson.scripts?.['schema:migrate'],
    'node scripts/run-schema-migrations.mjs',
  );
  assert.match(migrationCommandSource, /SCHEMA_MIGRATIONS:\s*'auto'/);
  assert.match(migrationCommandSource, /SCHEMA_MIGRATION_COMMAND:\s*'1'/);
  assert.match(migrationCommandSource, /spawnSync\([\s\S]*\['server\.js'\]/);

  const startupOffset = serverSource.indexOf('pool = buildPool();');
  assert.ok(startupOffset >= 0, 'server startup contract must remain inspectable');
  const startup = serverSource.slice(startupOffset);
  const targetOutputOffset = startup.indexOf('postgres schema migration target:');
  const migrationRunOffset = startup.indexOf('runMigrations()');
  assert.ok(
    targetOutputOffset >= 0 && targetOutputOffset < migrationRunOffset,
    'the sanitized database target must print before command-mode DDL begins',
  );
  assert.match(
    startup,
    /if \(schemaMigrationCommand\)[\s\S]*runMigrations\(\)[\s\S]*formatMigrationRunResult\(report\)/,
    'command mode must execute the production migration runner and print its exact report',
  );
  assert.match(
    startup,
    /\} else if \(pool\) \{[\s\S]*startServer/,
    'HTTP startup must remain a separate non-command branch',
  );
  assert.match(
    startup,
    /MigrationExecutionError[\s\S]*formatMigrationRunFailure\(error\)/,
    'command and server startup failures must print exact partial migration activity',
  );
});

test('slot archive decodes against a fresh authoritative render snapshot and heals old partial archives', () => {
  const decoder = sourceSection(
    serverSource,
    'function decodedVersionedPredrawnSurface(',
    '\nfunction generationAttemptArchiveLevelPlan(',
  );
  assert.match(
    decoder,
    /if \(!board\)[\s\S]*background_version_reference_check_failed/,
    'an unavailable or stale renderer catalog must fail closed instead of looking like no selection',
  );

  const archiveTransaction = sourceSection(
    serverSource,
    'async function dbArchiveGenerationAttempt(',
    '\nasync function sendBackgroundVersionContent(',
  );
  assert.match(
    archiveTransaction,
    /await withThumbnailRenderInputs\(\(\) => \{[\s\S]*return \[[\s\S]*generationAttemptArchiveLevelPlan\(currentDocument\.body[\s\S]*generationAttemptArchiveLevelPlan\(canonical\.level/,
    'both working and canonical selections must be planned inside one fresh database-owned render snapshot',
  );
  assert.match(
    archiveTransaction,
    /await withThumbnailRenderInputs\(\(\) => \{\s*try \{[\s\S]*background_version_reference_check_failed[\s\S]*\}\);/,
    'only decode/plan validation inside the loaded snapshot may become a Level-reference conflict',
  );
  assert.match(
    archiveTransaction,
    /archivedReplay && !workingChanged && !canonicalChanged[\s\S]*idempotentReplay: true/,
    'a complete archived replay must remain a no-op',
  );
  assert.match(
    archiveTransaction,
    /if \(archivedReplay\)[\s\S]*assertEditorDocumentRevision[\s\S]*repaired_incomplete_selection_detach: archivedReplay/,
    'an old partial archive must use current document authority and leave an explicit repair event',
  );
  assert.match(
    archiveTransaction,
    /if \(!archivedReplay\) \{[\s\S]*UPDATE predrawn_generation_attempts attempt/,
    'repairing a partial archive must not archive or revise the slot a second time',
  );
  assert.match(
    archiveTransaction,
    /canonicalThumbnailRequiresEnsure: Boolean\(canonical\.level\)/,
    'an archived no-op replay must retry canonical thumbnail preparation',
  );

  const archiveRoute = sourceSection(
    serverSource,
    "app.post('/api/editor-documents/:documentId/generation-attempts/:attemptId/archive'",
    "\napp.get('/api/editor-documents/:documentId/background-versions'",
  );
  assert.match(
    archiveRoute,
    /prepareGenerationAttemptArchiveThumbnail\([\s\S]*result,[\s\S]*thumbnailAuthority,[\s\S]*ensureLevelThumbnailDerivative/,
    'the route must ensure a canonical derivative on both detach and archived replay',
  );
});

test('every persisted Level background mutation decodes inside a fresh authoritative render snapshot', () => {
  const requiredWrappedCalls = [
    {
      start: 'async function dbAutosaveEditorDocument(',
      end: '\nfunction editorDocumentCampaignsWithAssignment(',
      call: 'dbTryBindStoredLevelLegacyBackgroundGeometry',
    },
    {
      start: 'async function dbSaveEditorDocument(',
      end: '\nasync function dbDiscardEditorDocument(',
      call: 'dbPublishLevelBackgroundVersions',
    },
    {
      start: 'async function dbArchiveBackgroundVersion(',
      end: '\nasync function dbArchiveGenerationAttempt(',
      call: 'decodedVersionedPredrawnSurface',
    },
    {
      start: 'async function dbCreateBackgroundVersion(',
      end: '\nasync function dbUploadBackgroundVersionContent(',
      call: 'predrawnEnvironmentGeometryDigests',
    },
    {
      start: 'async function dbPutWorkspace(',
      end: "\napp.get('/api/campaign-workspace'",
      call: 'dbApplyWorkspaceBackgroundVersionBoundary',
    },
    {
      start: 'async function dbUpsertOfficialCampaigns(',
      end: '\napp.get(\'/api/official-campaigns',
      call: 'dbApplyWorkspaceBackgroundVersionBoundary',
    },
    {
      start: 'async function dbPublishPublicMap(',
      end: '\napp.post(\'/api/maps/publish\'',
      call: 'dbPublishLevelBackgroundVersions',
    },
  ];
  for (const expected of requiredWrappedCalls) {
    const section = sourceSection(serverSource, expected.start, expected.end);
    assert.match(
      section,
      new RegExp(String.raw`withThumbnailRenderInputs\([\s\S]*${expected.call}\([\s\S]*,\s*client\s*\);`),
      `${expected.call} must decode against the caller's transaction without checking out another connection`,
    );
  }
});

test('transaction renderer snapshots thread one queryable through every catalog reader', () => {
  const loader = sourceSection(
    serverSource,
    'async function loadThumbnailRenderInputs(',
    '\nasync function withThumbnailRenderInputs(',
  );
  assert.match(
    loader,
    /loadRendererSnapshotSources\(\{\s*queryable,/,
    'the production snapshot loader must forward its caller-owned transaction client',
  );
  for (const reader of [
    'dbReadMediaCatalog',
    'dbReadDrawableCatalog',
    'thumbnailPropSeats',
    'dbReadUnitCatalog',
    'thumbnailMediaAvailabilityCatalog',
  ]) {
    assert.match(
      loader,
      new RegExp(String.raw`${reader}\([\s\S]*\bdb\b`),
      `${reader} must receive the same transaction queryable`,
    );
  }

  const wrapper = sourceSection(
    serverSource,
    'async function withThumbnailRenderInputs(',
    '\nfunction thumbnailVersion(',
  );
  assert.match(
    wrapper,
    /loadThumbnailRenderInputs\(queryable\)/,
    'the critical-section wrapper must not discard the transaction queryable',
  );

  const mediaReader = sourceSection(
    serverSource,
    'async function dbReadMediaCatalog(',
    '\nasync function publicMediaCatalog(',
  );
  const drawableReader = sourceSection(
    serverSource,
    'async function dbReadDrawableCatalog(',
    '\nasync function dbUpsertDrawableBatch(',
  );
  for (const [name, reader] of [
    ['media catalog', mediaReader],
    ['drawable catalog', drawableReader],
  ]) {
    assert.match(reader, /let db = queryable;[\s\S]*if \(!db\) \{[\s\S]*pool\.connect\(\)/);
    assert.match(reader, /if \(client\) await client\.query\('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'\)/);
    assert.match(reader, /if \(client\) client\.release\(\)/);
    assert.doesNotMatch(
      reader,
      /const client = await pool\.connect\(\)/,
      `${name} must not unconditionally acquire a second connection`,
    );
  }
});

test('full smoke proves the sparse recorded-36 upgrade and the real authenticated archive transaction', () => {
  assert.match(
    smokeSource,
    /extractInlineMigrations\([\s\S]*server\.js/,
    'the DB-backed fixture must use the canonical cross-platform migration parser',
  );
  assert.doesNotMatch(
    smokeSource,
    /const sqlMarker = 'sql: `'/,
    'the DB-backed fixture must not hand-parse only template-literal migrations',
  );
  assert.match(
    smokeSource,
    /let cachedInlineMigrations = null;[\s\S]*seedSparseNumericMigrationHistoryThrough36\(\);/,
    'the migration parser cache must exist and be initialized before the top-level sparse-history seed invokes it',
  );
  const upgradeSeed = sourceSection(
    smokeSource,
    'function seedSparseNumericMigrationHistoryThrough36()',
    '\nconst sharedBackendEnv = {',
  );
  assert.match(
    upgradeSeed,
    /Array\.from\(\{\s*length:\s*27\s*\}[\s\S]*\b36\b/,
    'the full smoke database must begin with the exact former ledger 1-27 and 36',
  );
  assert.match(
    upgradeSeed,
    /legacyVersions\.map\(\(version\)[\s\S]*sql:\s*inlineMigrationSql\(version\)/,
    'the upgrade fixture must execute the canonical historical SQL, not a hand-built approximation',
  );
  assert.doesNotMatch(
    upgradeSeed,
    /Array\.from\(\{\s*length:\s*36\s*\}/,
    'the upgrade fixture must not fabricate absent version rows 28-35',
  );
  assert.match(
    upgradeSeed,
    /INSERT INTO schema_migrations \(version\) VALUES \(\$1\)/,
    'the upgrade fixture must reproduce the former numeric-only history',
  );
  assert.doesNotMatch(
    upgradeSeed,
    /inlineMigrationSql\(37\)/,
    'migration 37 must remain pending until the production server starts',
  );

  const primaryUpgradeProof = sourceSection(
    smokeSource,
    'async function validatePrimarySparseNumericMigrationUpgrade49()',
    '\nasync function validateEditorMigration16Preservation()',
  );
  assert.match(
    primaryUpgradeProof,
    /expectedVersions\s*=\s*Array\.from\(\{\s*length:\s*49\s*\}/,
    'the production upgrade proof must require a complete 1-49 history',
  );
  assert.match(
    primaryUpgradeProof,
    /identityMismatch[\s\S]*migrationChecksum\(migration\)/,
    'the production upgrade must verify every sealed and newly applied migration identity',
  );
  assert.match(
    primaryUpgradeProof,
    /length:\s*8[\s\S]*index\s*\+\s*28/,
    'the production report must include the filled historical gap 28-35',
  );
  assert.match(
    primaryUpgradeProof,
    /length:\s*13[\s\S]*index\s*\+\s*37/,
    'the production report must include every post-36 migration through 49',
  );
  assert.match(
    primaryUpgradeProof,
    /length:\s*27[\s\S]*\b36\b/,
    'the production report must distinguish the exact already-applied sparse history',
  );
  assert.match(
    primaryUpgradeProof,
    /schema migrations applied: \$\{appliedSummary\}[\s\S]*skipped \(already applied\): \$\{skippedSummary\}/,
    'the production startup report must name the exact applied and skipped plans',
  );

  const migrationProof = sourceSection(
    smokeSource,
    'async function validateEditorRevisionReasonMigration37()',
    '\nasync function waitForServer()',
  );
  assert.match(
    migrationProof,
    /INSERT INTO\s+schema_migrations[\s\S]*\b36\b/i,
    'the migration proof must begin with migration 36 already recorded',
  );
  assert.match(
    migrationProof,
    /inlineMigrationSql\(37\)/,
    'the upgrade proof must apply migration 37, not rerun migration 36',
  );
  assert.doesNotMatch(
    migrationProof,
    /inlineMigrationSql\(36\)/,
    'the upgrade proof must not make an already-applied migration rerunnable',
  );
  assert.match(
    migrationProof,
    /generation-attempt-archive/,
    'the upgraded schema must accept the archive audit reason',
  );

  const archiveRequest = sourceSection(
    smokeSource,
    'async function archiveGenerationAttemptRequest(',
    '\nfunction uploadBackgroundVersionRequest(',
  );
  assert.match(
    archiveRequest,
    /editorMutationBody\(/,
    'the archive smoke request must carry an authenticated editor-session fence',
  );
  assert.match(
    archiveRequest,
    /'POST',[\s\S]*generation-attempts\/\$\{attemptId\}\/archive/,
    'the smoke helper must call the production archive endpoint',
  );

  const dormantArchiveScenario = sourceSection(
    smokeSource,
    'const dormantArchiveWarpId = crypto.randomUUID();',
    '\n  const publishedArchiveAttemptId = crypto.randomUUID();',
  );
  assert.match(
    dormantArchiveScenario,
    /archiveGenerationAttemptRequest\(/,
    'the dormant Legacy scenario must execute the production archive endpoint',
  );
  assert.match(
    dormantArchiveScenario,
    /FROM\s+level_working_copy_revisions/i,
    'the endpoint proof must inspect its retained working-copy audit row',
  );
  assert.match(
    dormantArchiveScenario,
    /generation-attempt-archive/,
    'the endpoint proof must require the exact archive audit reason',
  );
  assert.match(
    dormantArchiveScenario,
    /archivedDormantAttempt\.statusCode\s*!==\s*200/,
    'the endpoint proof must fail unless the authenticated archive succeeds',
  );
  assert.match(
    dormantArchiveScenario,
    /repairedArchivedAttemptBody\.idempotent_replay\s*!==\s*true[\s\S]*repaired_incomplete_selection_detach/,
    'the endpoint proof must reproduce and heal an already-archived dormant selection',
  );
  assert.match(
    dormantArchiveScenario,
    /repairedArchivedRows\.rows\[0\]\?\.row_revision\)\s*!==\s*1/,
    'the repair proof must reject a second slot revision',
  );
  assert.match(
    dormantArchiveScenario,
    /stalePartialArchiveRepair[\s\S]*editor_document_revision_conflict/,
    'the repair proof must reject a stale working-document fence before detaching anything',
  );
  assert.match(
    dormantArchiveScenario,
    /const repairedArchivedAttempt = await archiveGenerationAttemptRequest\(\s*newDocumentId,\s*dormantArchiveAttemptId,\s*0,/,
    'the repair proof must accept the original lost-response attempt revision exactly once',
  );
  assert.match(
    dormantArchiveScenario,
    /workingOnlyArchivedRepairBody\.forgotten_selection\?\.canonical\s*!==\s*false[\s\S]*workingOnlyArchivedRepairBody\.workspace_revision[\s\S]*repairedArchivedAttemptBody\.workspace_revision/,
    'a working-only repair must return the unchanged current canonical workspace revision',
  );
  assert.match(
    dormantArchiveScenario,
    /workingOnlyArchivedReplayBody\.thumbnail_ready\s*!==\s*true/,
    'an archived no-op replay must prove the canonical thumbnail can be ensured',
  );

  const checkModeProof = sourceSection(
    smokeSource,
    'const secondaryReadyLine = secondaryOutput',
    '\n    secondaryChild.kill();',
  );
  assert.match(
    checkModeProof,
    /schema migrations applied: none/,
    'a second check-mode server must prove that the upgraded history needs no mutation',
  );
  assert.match(
    checkModeProof,
    /pending: none/,
    'the check-mode restart must report no pending migration',
  );
});

test('full smoke repairs final attempt topology around retained later-feature rows', () => {
  const historicalReuseLifecycle = sourceSection(
    smokeSource,
    'const historicalSourceAttemptId = crypto.randomUUID();',
    '\n  // Required-schema repair runs against retained current data',
  );
  assert.match(
    historicalReuseLifecycle,
    /archiveRawWhileHistoricalSourceActive[\s\S]*background_version_attempt_in_use/,
    'archiving the processing child must leave its independent historical source guard active',
  );
  assert.match(
    historicalReuseLifecycle,
    /archiveGenerationAttemptRequest\(\s*newDocumentId,\s*historicalSourceAttemptId[\s\S]*archivedHistoricalSource\.statusCode\s*!==\s*200/,
    'the fixture must explicitly archive the independent historical source through the production endpoint',
  );

  const retainedDataRepair = sourceSection(
    smokeSource,
    '// Required-schema repair runs against retained current data',
    '\n  const createMask = async (',
  );
  assert.match(
    retainedDataRepair,
    /DROP TABLE predrawn_generation_attempt_events[\s\S]*inlineMigrationSql\(43\)/,
    'the DB-backed smoke must recreate a missing attempt-event relation through migration 43',
  );
  assert.match(
    retainedDataRepair,
    /pipelineReuseAttempt\.id[\s\S]*origin !== 'pipeline-source'/,
    'the relation repair must prove a retained pipeline-source attempt survives',
  );
  assert.match(
    retainedDataRepair,
    /INSERT INTO predrawn_generation_attempt_events[\s\S]*'move-highlight-profile-updated'/,
    'the retry repair must begin with a later-feature audit event already stored',
  );
  assert.match(
    retainedDataRepair,
    /processing_revision >= -1[\s\S]*inlineMigrationSql\(43\)[\s\S]*\\bprocessing_revision\\b\\s\*>=\\s\*0\\b/,
    'the smoke must drift then restore the processing-revision constraint through migration 43',
  );
  assert.match(
    retainedDataRepair,
    /retainedMoveHighlightEvent[\s\S]*count\)\s*!==\s*1/,
    'the repaired schema must retain the move-highlight audit event',
  );

  const postRepairArchive = sourceSection(
    smokeSource,
    'const archiveSourceWhileActive = await request(',
    '\n  const mismatchedSelectionLevel = {',
  );
  assert.match(
    postRepairArchive,
    /move-highlight-profile-updated,stage-attached,archived/,
    'the final archive proof must verify the audit events retained after the deliberate relation rebuild',
  );

  const invalidAncestorSave = sourceSection(
    smokeSource,
    'const selectedLevel = {',
    '\n  const invalidOcclusionContractSave = await request(',
  );
  assert.match(
    invalidAncestorSave,
    /operation = operation - 'untouched'[\s\S]*invalidWarpedParentSave[\s\S]*predrawn_background_contract_mismatch/,
    'the raw-ancestor proof must corrupt a required field that its verified legacy sidecar cannot supply',
  );

  const invalidAncestorPublish = sourceSection(
    smokeSource,
    'const anonymousAfterWholeUserPut = await get(',
    '\n  const publishedUserMap = await request(',
  );
  assert.match(
    invalidAncestorPublish,
    /operation = operation - 'untouched'[\s\S]*invalidWarpedParentPublish[\s\S]*operation = operation \|\| '\{"untouched":true\}'::jsonb[\s\S]*predrawn_background_contract_mismatch/,
    'the Publish proof must reject and restore a genuinely corrupted raw ancestor',
  );

  const ownerQuotaFixture = sourceSection(
    smokeSource,
    '// Operational bounds are part of the permanent version-store contract.',
    '\n  // Official working copies use the same CAS contract',
  );
  assert.match(
    ownerQuotaFixture,
    /background_version_owner_blob_quota_exceeded[\s\S]*DELETE FROM predrawn_background_versions[\s\S]*label LIKE 'Quota seed %'[\s\S]*DELETE FROM media_blobs/,
    'the synthetic owner-quota rows and Blob metadata must be removed before unrelated owner uploads',
  );

  const directLegacyChain = sourceSection(
    smokeSource,
    'const directV2WarpCreate = await createBackgroundVersionRequest(',
    '\n  const coverChangedBoardCode = boardCodeWith(',
  );
  assert.match(
    directLegacyChain,
    /move-highlight-profile[\s\S]*expected_warped_version_id:\s*directLegacyWarpReady\.id[\s\S]*directV2OcclusionCreate/,
    'the direct legacy-chain smoke must fit its warped cyan profile before creating occlusion',
  );
});
