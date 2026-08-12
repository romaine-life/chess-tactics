import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { fetchAdminDrawableCatalog, saveDrawableAsset } from '../net/drawableCatalogAdmin';
import { useAdminLiveMediaCatalog } from './studio/useAdminLiveMediaCatalog';
import { ChromeButton } from './shared/ChromeButton';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { CommandCard, COMMAND_CARD_KEY_ROWS } from './shared/CommandCard';
import { SHORTCUT_BINDINGS } from './SkirmishHud';
import {
  SKIRMISH_SHORTCUT_CARD,
  SKIRMISH_SHORTCUT_ICON_SLOT,
  SKIRMISH_SHORTCUT_MEDIA_ROLE,
  SkirmishShortcutIcon,
  skirmishShortcutIconUrl,
  type SkirmishShortcutIconVariant,
} from './shared/SkirmishShortcutIcon';

/**
 * Owner review for the Battle command card's marks, as a Studio CATEGORY.
 *
 * It arrived on `main` as `/studio?commandCardMarkReview=1` while ADR-0588 was converting the six
 * that already did that — written, like each of those, by copying the last one. That is the whole
 * argument for the gate: the pattern reproduces itself faster than it can be cleaned up by hand.
 *
 * The card is composed here rather than picked from finished sets. Each key's candidates
 * were generated independently, so the best Grid and the best Deselect are not the same
 * option number, and a set-at-a-time review would make him take a weak mark to get a
 * strong one. Pressing a candidate arms it in the REAL card above — the same
 * `.skirmish-grid` markup, the same button primitive, the same seat the match paints — so
 * what is on screen is the card, not a contact sheet standing in for it.
 *
 * Nothing is installed until Install is pressed, and installing is one act: approval of
 * those exact bytes, acceptance into the ten slots, and the one drawable edit that binds
 * each slot to the media role the seat resolves.
 */
export const COMMAND_CARD_BATCH_ID = 'battle-command-card-marks-2026-08-12';

const CARD_BY_KEY = new Map(SKIRMISH_SHORTCUT_CARD.map((entry) => [entry.key, entry]));

function metadataString(version: AdminLiveMediaVersion, key: string): string {
  const value = version.metadata[key];
  return typeof value === 'string' ? value : '';
}

function candidateIndex(version: AdminLiveMediaVersion): number {
  const value = Number(version.metadata.candidateIndex);
  return Number.isSafeInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

function batchId(version: AdminLiveMediaVersion): string {
  const batch = version.provenance.liveMediaBatch;
  return batch && typeof batch === 'object' && !Array.isArray(batch)
    && typeof (batch as Record<string, unknown>).batchId === 'string'
    ? String((batch as Record<string, unknown>).batchId)
    : '';
}

/** Every uploaded candidate for this batch, grouped by the command it would mark. */
export function commandCardCandidates(
  catalog: AdminLiveMediaCatalog,
): Map<SkirmishShortcutIconVariant, AdminLiveMediaVersion[]> {
  const bySlot = new Map<string, SkirmishShortcutIconVariant>(
    Object.entries(SKIRMISH_SHORTCUT_ICON_SLOT).map(([variant, slot]) => [slot, variant as SkirmishShortcutIconVariant]),
  );
  const grouped = new Map<SkirmishShortcutIconVariant, AdminLiveMediaVersion[]>();
  for (const version of catalog.versions) {
    if (!version.media || version.status !== 'candidate' || !version.slot) continue;
    if (batchId(version) !== COMMAND_CARD_BATCH_ID) continue;
    const variant = bySlot.get(version.slot);
    if (!variant) continue;
    const list = grouped.get(variant) ?? [];
    list.push(version);
    grouped.set(variant, list);
  }
  for (const list of grouped.values()) list.sort((left, right) => candidateIndex(left) - candidateIndex(right));
  return grouped;
}

/**
 * Bind each chosen slot to the `app-ui` media role its seat resolves. The roles are added
 * to the drawable's media map only — never to `requiredRoles` — so a command whose mark is
 * not installed yet keeps a reserved empty seat instead of failing the whole UI closed
 * (ADR-0318).
 */
async function bindShortcutMediaRoles(variants: readonly SkirmishShortcutIconVariant[]): Promise<void> {
  const catalog = await fetchAdminDrawableCatalog();
  const asset = catalog.assets.find((entry) => entry.id === 'app-ui');
  if (!asset) throw new Error('the app-ui drawable is unavailable');
  const media = Object.fromEntries(Object.entries(asset.media).map(([name, binding]) => [name, binding.slot]));
  let changed = false;
  for (const variant of variants) {
    const role = SKIRMISH_SHORTCUT_MEDIA_ROLE[variant];
    const slot = SKIRMISH_SHORTCUT_ICON_SLOT[variant];
    if (media[role] === slot) continue;
    media[role] = slot;
    changed = true;
  }
  if (!changed) return;
  await saveDrawableAsset({
    id: asset.id,
    kind: asset.kind,
    label: asset.label,
    sortOrder: asset.sortOrder,
    lifecycleState: asset.lifecycleState,
    behavior: asset.behavior,
    metadata: asset.metadata,
    media,
    expectedRevision: asset.rowRevision,
  });
}

/** The command card exactly as the Controls tab paints it, wearing the armed marks. */
function CardPreview({
  armed,
  ariaLabel,
}: {
  armed: Map<SkirmishShortcutIconVariant, string>;
  ariaLabel: string;
}): ReactElement {
  return (
    <CommandCard
      className="command-card-review-card"
      ariaLabel={ariaLabel}
      commands={COMMAND_CARD_KEY_ROWS.flat().map((key) => {
        const entry = CARD_BY_KEY.get(key);
        if (!entry) return { key };
        return {
          key,
          label: entry.label,
          hint: SHORTCUT_BINDINGS[entry.key]?.hint,
          icon: entry.variant,
          iconSrc: armed.get(entry.variant),
          testId: `command-card-preview-${key}`,
        };
      })}
    />
  );
}

function InstallCardControl({
  chosen,
  catalog,
  onInstalled,
}: {
  chosen: Map<SkirmishShortcutIconVariant, AdminLiveMediaVersion>;
  catalog: AdminLiveMediaCatalog;
  onInstalled: () => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  // A command with no candidate is only a gap when it has no installed mark either.
  // Accepting a version retires it from `candidate`, so after an install every command
  // reports zero candidates — reading that as a gap would refuse to install the card it
  // just installed.
  const missing = SKIRMISH_SHORTCUT_CARD
    .filter((entry) => !chosen.has(entry.variant) && !skirmishShortcutIconUrl(entry.variant));

  const install = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = [...chosen.entries()];
      setStatus('Recording approval for these exact bytes…');
      // One review call per version, NOT the review batch: ten independent slots share no
      // declared acceptance group, and sending them together is refused with
      // media_review_batch_requires_one_acceptance_group. Acceptance is still one batch,
      // which is what makes the card land whole or not at all.
      const reviewed: AdminLiveMediaVersion[] = [];
      for (const [variant, version] of picked) {
        reviewed.push(await reviewLiveMediaVersion({
          id: version.id,
          expectedRevision: version.rowRevision,
          notes: `Selected the ${metadataString(version, 'treatmentLabel') || 'candidate'} mark for the ${variant} command, `
            + `composed on the live Battle command card. Slot: ${version.slot}.`,
          surfaceUrl: window.location.href,
          evidence: {
            schema: 'live-media-owner-proof-v1',
            batchId: COMMAND_CARD_BATCH_ID,
            variant,
            versionId: version.id,
            contentSha256: version.media!.sha256,
            slot: version.slot,
            canonicalScale: 1,
            surfaceKind: 'Battle command card at the live 26px seat',
          },
        }));
      }
      setStatus('Installing the card…');
      await acceptLiveMediaVersions(reviewed.map((version) => {
        const slot = catalog.slots.find((entry) => entry.slot === version.slot);
        return {
          id: version.id,
          expectedRevision: version.rowRevision,
          expectedSlotRevision: slot?.rowRevision ?? 0,
          expectedActiveVersionId: slot?.activeVersionId ?? null,
        };
      }));
      setStatus('Binding each command to its mark…');
      await bindShortcutMediaRoles(picked.map(([variant]) => variant));
      setStatus('Installed. The Controls tab paints this card now — reload a match to see it.');
      onInstalled();
    } catch (reason) {
      setStatus(reason instanceof Error ? `Install failed: ${reason.message}` : 'Install failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="command-card-review-install">
      <ChromeButton
        unit="inner-text-button"
        disabled={busy || missing.length > 0 || chosen.size === 0}
        data-testid="install-command-card"
        onClick={() => { void install(); }}
      >
        {busy ? 'Installing…' : 'Install this card'}
      </ChromeButton>
      {missing.length ? (
        <p role="status">
          {`No candidate armed and nothing installed for ${missing.map((entry) => entry.label).join(', ')}.`}
        </p>
      ) : null}
      {!missing.length && chosen.size === 0 ? (
        <p role="status">Every command already paints its installed mark; nothing to change.</p>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
    </div>
  );
}

export interface CommandCardMarkState {
  catalog: AdminLiveMediaCatalog | null;
  picked: Record<string, string>;
  pick: (variant: string, id: string) => void;
  error: string;
  refresh: () => void;
}

export function useCommandCardMarks(): CommandCardMarkState {
  const { catalog, error, refresh } = useAdminLiveMediaCatalog();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const pick = useCallback((variant: string, id: string) => {
    setPicked((current) => ({ ...current, [variant]: id }));
  }, []);
  return { catalog, picked, pick, error, refresh };
}

export function CommandCardMarkCatalog({ state }: { state: CommandCardMarkState }): ReactElement {
  const { catalog, picked, pick, error, refresh } = state;

  const candidates = useMemo(
    (): Map<SkirmishShortcutIconVariant, AdminLiveMediaVersion[]> => (
      catalog ? commandCardCandidates(catalog) : new Map()
    ),
    [catalog],
  );

  /**
   * The version armed for each command — ONLY where the owner armed one.
   *
   * Deliberately not "else the first candidate": once a card is installed its chosen marks
   * stop being candidates, so a first-candidate default would arm the runners-up on arrival
   * and Install would silently replace every mark with the option that lost. Arming is an
   * act, and an unarmed command keeps what it already paints.
   */
  const chosen = useMemo(() => {
    const map = new Map<SkirmishShortcutIconVariant, AdminLiveMediaVersion>();
    for (const entry of SKIRMISH_SHORTCUT_CARD) {
      const list = candidates.get(entry.variant) ?? [];
      const armedVersion = list.find((version) => version.id === picked[entry.variant])
        // Nothing is installed for this command yet, so its first candidate is not a
        // replacement for anything — the card would otherwise open with a hole in it.
        ?? (skirmishShortcutIconUrl(entry.variant) ? undefined : list[0]);
      if (armedVersion) map.set(entry.variant, armedVersion);
    }
    return map;
  }, [candidates, picked]);

  /** What the composed card draws: an armed candidate where one exists, else the mark
   *  already installed for that command, so the card is never missing a key it has art for. */
  const armed = useMemo(() => {
    const map = new Map<SkirmishShortcutIconVariant, string>();
    for (const entry of SKIRMISH_SHORTCUT_CARD) {
      const url = chosen.get(entry.variant)?.media!.url ?? skirmishShortcutIconUrl(entry.variant);
      if (url) map.set(entry.variant, url);
    }
    return map;
  }, [chosen]);

  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading candidates…</p>;
  return (
    <div data-testid="command-card-mark-catalog">
          <div className="command-card-review-body">
            <section className="command-card-review-cards" aria-label="Command card">
              <div className="command-card-review-column">
                <h2>Installed</h2>
                <p>What a match paints today.</p>
                <CardPreview
                  ariaLabel="Installed command card"
                  armed={new Map(SKIRMISH_SHORTCUT_CARD
                    .map((entry) => [entry.variant, skirmishShortcutIconUrl(entry.variant)] as const)
                    .filter((pair): pair is readonly [SkirmishShortcutIconVariant, string] => Boolean(pair[1])))}
                />
              </div>
              <div className="command-card-review-column">
                <h2>Composed</h2>
                <p>The armed candidates — not installed.</p>
                <CardPreview ariaLabel="Composed command card" armed={armed} />
                <InstallCardControl chosen={chosen} catalog={catalog} onInstalled={refresh} />
              </div>
            </section>
            <section className="command-card-review-picks" aria-label="Candidates by command">
              {SKIRMISH_SHORTCUT_CARD.map((entry) => {
                const list = candidates.get(entry.variant) ?? [];
                return (
                  <div className="command-card-review-pick" key={entry.variant}>
                    <h3>
                      <kbd className="skirmish-grid-cap">{entry.key.toUpperCase()}</kbd>
                      {entry.label}
                    </h3>
                    {list.length ? (
                      <div className="command-card-review-options">
                        {list.map((version) => {
                          const active = chosen.get(entry.variant)?.id === version.id;
                          return (
                            <ChromeButton
                              unit="inner-text-button"
                              key={version.id}
                              data-testid={`command-card-option-${entry.variant}-${candidateIndex(version)}`}
                              className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'command-card-review-option', active && 'active is-active')}
                              aria-pressed={active}
                              title={`${entry.label} — ${metadataString(version, 'treatmentLabel') || version.label}`}
                              onClick={() => pick(entry.variant, version.id)}
                            >
                              <SkirmishShortcutIcon variant={entry.variant} src={version.media!.url} />
                              <span className="skirmish-grid-label">{metadataString(version, 'treatmentLabel') || version.label}</span>
                            </ChromeButton>
                          );
                        })}
                      </div>
                    ) : (
                      <p role="status">
                        {skirmishShortcutIconUrl(entry.variant)
                          ? 'Installed. No other candidate is waiting for this command.'
                          : 'No candidate uploaded for this command.'}
                      </p>
                    )}
                  </div>
                );
              })}
            </section>
          </div>
    </div>
  );
}

export function CommandCardMarkControls(): ReactElement {
  return (
    <p className="tileset-catalog-note">
      The card on the left is the real one — the same divided box, the same leaf surface, the same
      compartment drawing the 64px canvas the Controls tab paints in a match, at the width the
      Battle rail gives it. Press a candidate to arm it there. Every mark is fitted the same way:
      ink scaled to exactly 52px tall on the 64px canvas, both ink dimensions even, so ten marks in
      a 3&times;5 pad read at one size (ADR-0560). Nothing is installed until you press Install.
    </p>
  );
}
