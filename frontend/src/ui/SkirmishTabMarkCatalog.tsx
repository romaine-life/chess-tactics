import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { useAdminLiveMediaCatalog } from './studio/useAdminLiveMediaCatalog';
import { ChromeButton } from './shared/ChromeButton';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ShellControlsPanel } from './shared/ChromeBox';
import { leafSurfacePhase } from './shared/chromeSurfacePolicy';
import { HUD_TABS } from './SkirmishHud';
import {
  SKIRMISH_TAB_MARKS,
  SKIRMISH_TAB_MARK_SLOT,
  SkirmishTabIcon,
  skirmishTabIconUrl,
  type SkirmishTabId,
  type SkirmishTabMarkSeat,
} from './shared/SkirmishTabIcon';

/**
 * Owner review for the Battle HUD's section-tab marks, as a Studio CATEGORY (ADR-0058).
 *
 * The strip is what is being judged, not the art. Four of its five marks came from the old
 * codex kit — a pale knight, two pale pawns, a blue info disc and a dark blue CRT — and beside
 * a gear that fills its own canvas they read as a blank, a smudge and two dark squares. So the
 * page mounts the REAL Controls head through `ShellControlsPanel`, at the real 20px seat, with
 * the gear standing in the strip exactly where a Battle puts it. A contact sheet of 64px art
 * cannot show any of that: these marks fail or succeed at 20px, against each other.
 *
 * Each seat's candidates were generated on their own, so the strip is COMPOSED here rather than
 * picked as a finished set — the best knight and the best info mark are not the same option
 * number, and a set-at-a-time review would make him take a weak mark to get a strong one.
 *
 * Nothing is installed until Install is pressed. Installing is approval of those exact bytes
 * plus acceptance into their slots; no drawable edit follows, because every one of these roles
 * is already bound to the slot it draws.
 */

/**
 * Which batch each seat offers, PER SEAT and not one flat list.
 *
 * ONE BATCH IS ONE CONCEPT (ADR-0637). The View seat is offered two subjects, because "a screen"
 * is a stock UI symbol rather than an object this world owns (ADR-0035) and the tab it marks is
 * about how the board is SEEN — so a spyglass is offered beside a redrawn plate, and whichever
 * loses can come off this page without taking the other with it.
 */
export const SKIRMISH_TAB_MARK_BATCH_IDS: Readonly<Record<SkirmishTabMarkSeat, readonly string[]>> =
  Object.freeze({
    unit: ['hud-tab-unit-bone-knight-2026-08-12-v1'],
    roster: ['hud-tab-roster-bone-ebony-pawns-2026-08-12-v1'],
    log: ['hud-tab-log-brass-roundel-2026-08-12-v1'],
    view: [
      'hud-tab-view-spyglass-2026-08-12-v1',
      'hud-tab-view-slate-plate-2026-08-12-v1',
    ],
  });

const SEAT_LABEL: Readonly<Record<SkirmishTabMarkSeat, string>> = Object.freeze({
  unit: 'Unit',
  roster: 'Roster',
  log: 'Log',
  view: 'View',
});

/** What each seat's mark also draws, so Install is pressed knowing what else moves. */
const SEAT_ALSO_DRAWS: Readonly<Record<SkirmishTabMarkSeat, string>> = Object.freeze({
  unit: 'Also the Strategikon’s Prosopography mark and the Enchiridion’s units bullet.',
  roster: 'Also the account menu’s player glyph.',
  log: 'Also the Strategikon’s Lipsanotheca mark, the Enchiridion’s lipsana bullet, and the editor level row’s info control.',
  view: 'Drawn nowhere else.',
});

/** Which compartment is which, read left to right — the strip itself carries no labels. */
const TAB_LEGEND = HUD_TABS.map((tab) => tab.label).join(' · ');

function metadataString(version: AdminLiveMediaVersion, key: string): string {
  const value = version.metadata[key];
  return typeof value === 'string' ? value : '';
}

function candidateIndex(version: AdminLiveMediaVersion): number {
  const value = Number(version.metadata.candidateIndex);
  return Number.isSafeInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

/**
 * A seat's concepts are numbered from 1 each, so the candidate index alone is not an identity: the
 * View seat's two batches both run 01..16 and a bare `view-1` named two different marks.
 */
function conceptOrdinal(seat: SkirmishTabMarkSeat, version: AdminLiveMediaVersion): number {
  return SKIRMISH_TAB_MARK_BATCH_IDS[seat].indexOf(batchId(version)) + 1;
}

function batchId(version: AdminLiveMediaVersion): string {
  const batch = version.provenance.liveMediaBatch;
  return batch && typeof batch === 'object' && !Array.isArray(batch)
    && typeof (batch as Record<string, unknown>).batchId === 'string'
    ? String((batch as Record<string, unknown>).batchId)
    : '';
}

/**
 * Every uploaded candidate, grouped by the seat it would mark.
 *
 * Keyed on the BATCH and not only on the slot: `info.png` and the others are long-lived kit
 * slots with their own history, so a slot filter alone would put every candidate any surface
 * ever uploaded for them on this page.
 */
export function skirmishTabMarkCandidates(
  catalog: AdminLiveMediaCatalog,
): Map<SkirmishTabMarkSeat, AdminLiveMediaVersion[]> {
  const grouped = new Map<SkirmishTabMarkSeat, AdminLiveMediaVersion[]>();
  for (const version of catalog.versions) {
    if (!version.media || version.status !== 'candidate' || !version.slot) continue;
    const seat = SKIRMISH_TAB_MARKS.find((candidate) => (
      SKIRMISH_TAB_MARK_SLOT[candidate] === version.slot
      && SKIRMISH_TAB_MARK_BATCH_IDS[candidate].includes(batchId(version))
    ));
    if (!seat) continue;
    const list = grouped.get(seat) ?? [];
    list.push(version);
    grouped.set(seat, list);
  }
  // Concepts in the order the seat declares them, then candidates in generation order. Ordered
  // against the SEAT's own batch list — one shared list would sort every seat by the View seat's.
  for (const [seat, list] of grouped) {
    list.sort((left, right) => (
      conceptOrdinal(seat, left) - conceptOrdinal(seat, right)
      || candidateIndex(left) - candidateIndex(right)
    ));
  }
  return grouped;
}

/**
 * The Controls head exactly as a Battle paints it — the same panel, the same divided block, the
 * same five compartments, the same 20px seat. The panel carries no body: the head IS the subject,
 * and the panel still lays its own rails around it, which is what makes this the strip rather than
 * a row of buttons that looks like one.
 */
function StripPreview({
  armed,
  ariaLabel,
  testId,
}: {
  armed: Map<SkirmishTabId, string>;
  ariaLabel: string;
  testId: string;
}): ReactElement {
  return (
    <ShellControlsPanel
      className="skirmish-tab-mark-strip"
      aria-label={ariaLabel}
      data-testid={testId}
      titleStrip={{ role: 'tablist', ariaLabel: 'HUD sections' }}
      titleSections={HUD_TABS.map((tab, index) => ({
        id: tab.id,
        className: 'skirmish-hud-tab',
        attrs: { role: 'tab', 'aria-selected': tab.id === 'unit' },
        style: leafSurfacePhase(index),
        // The review paints the strip to be LOOKED at, so its compartments select nothing. They
        // are still the strip's own compartments — a preview built from something else would be
        // a review of a lookalike.
        content: <SkirmishTabIcon tab={tab.id} src={armed.get(tab.id)} />,
      }))}
    />
  );
}

function InstallStripControl({
  chosen,
  catalog,
  onInstalled,
}: {
  chosen: Map<SkirmishTabMarkSeat, AdminLiveMediaVersion>;
  catalog: AdminLiveMediaCatalog;
  onInstalled: () => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const install = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = [...chosen.entries()];
      setStatus('Recording approval for these exact bytes…');
      // One review call PER VERSION, never the review batch: these are independent slots sharing
      // no declared acceptance group, and sending them together is refused with
      // media_review_batch_requires_one_acceptance_group. Acceptance is still one batch, so the
      // strip lands whole or not at all.
      const reviewed: AdminLiveMediaVersion[] = [];
      for (const [seat, version] of picked) {
        reviewed.push(await reviewLiveMediaVersion({
          id: version.id,
          expectedRevision: version.rowRevision,
          notes: `Selected the ${metadataString(version, 'treatmentLabel') || 'candidate'} mark for the Battle HUD `
            + `${SEAT_LABEL[seat]} tab, composed on the live Controls head at its 20px seat. Slot: ${version.slot}.`,
          surfaceUrl: window.location.href,
          evidence: {
            schema: 'live-media-owner-proof-v1',
            batchId: batchId(version),
            variant: seat,
            versionId: version.id,
            contentSha256: version.media!.sha256,
            slot: version.slot,
            canonicalScale: 1,
            surfaceKind: 'Battle HUD Controls head at the live 20px tab seat',
          },
        }));
      }
      setStatus('Installing the strip…');
      await acceptLiveMediaVersions(reviewed.map((version) => {
        const slot = catalog.slots.find((entry) => entry.slot === version.slot);
        return {
          id: version.id,
          expectedRevision: version.rowRevision,
          expectedSlotRevision: slot?.rowRevision ?? 0,
          expectedActiveVersionId: slot?.activeVersionId ?? null,
        };
      }));
      setStatus(
        'Installed. Reload to see the strip. Run `npm run verify:icon-seats` next — the Strategikon’s '
        + 'Prosopography and Lipsanotheca seats declare the OLD ink numbers by hand, and the gate '
        + 'prints the two it wants instead.',
      );
      onInstalled();
    } catch (reason) {
      setStatus(reason instanceof Error ? `Install failed: ${reason.message}` : 'Install failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="skirmish-tab-mark-install">
      <ChromeButton
        unit="inner-text-button"
        disabled={busy || chosen.size === 0}
        data-testid="install-skirmish-tab-marks"
        onClick={() => { void install(); }}
      >
        {busy ? 'Installing…' : `Install ${chosen.size || 'no'} mark${chosen.size === 1 ? '' : 's'}`}
      </ChromeButton>
      {chosen.size === 0 ? <p role="status">Arm a candidate to compose the strip.</p> : null}
      {status ? <p role="status">{status}</p> : null}
    </div>
  );
}

export interface SkirmishTabMarkState {
  catalog: AdminLiveMediaCatalog | null;
  picked: Record<string, string>;
  pick: (seat: string, id: string) => void;
  error: string;
  refresh: () => void;
}

export function useSkirmishTabMarks(): SkirmishTabMarkState {
  const { catalog, error, refresh } = useAdminLiveMediaCatalog();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const pick = useCallback((seat: string, id: string) => {
    setPicked((current) => (current[seat] === id
      // Pressing the armed candidate again disarms it, so a seat can be left alone without
      // reloading the page — every seat here already has an installed mark to fall back to.
      ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== seat))
      : { ...current, [seat]: id }));
  }, []);
  return { catalog, picked, pick, error, refresh };
}

export function SkirmishTabMarkCatalog({ state }: { state: SkirmishTabMarkState }): ReactElement {
  const { catalog, picked, pick, error, refresh } = state;

  const candidates = useMemo(
    (): Map<SkirmishTabMarkSeat, AdminLiveMediaVersion[]> => (
      catalog ? skirmishTabMarkCandidates(catalog) : new Map()
    ),
    [catalog],
  );

  /**
   * The version armed for each seat — ONLY where one was armed.
   *
   * Deliberately not "else the first candidate": every seat already paints an installed mark, so
   * a first-candidate default would arm sixteen runners-up on arrival and Install would replace
   * four working marks with whatever happened to be option 01. Arming is an act.
   */
  const chosen = useMemo(() => {
    const map = new Map<SkirmishTabMarkSeat, AdminLiveMediaVersion>();
    for (const seat of SKIRMISH_TAB_MARKS) {
      const armed = (candidates.get(seat) ?? []).find((version) => version.id === picked[seat]);
      if (armed) map.set(seat, armed);
    }
    return map;
  }, [candidates, picked]);

  const installedStrip = useMemo(() => {
    const map = new Map<SkirmishTabId, string>();
    for (const tab of HUD_TABS) {
      const url = skirmishTabIconUrl(tab.id);
      if (url) map.set(tab.id, url);
    }
    return map;
  }, []);

  /** The composed strip: an armed candidate where one exists, else the installed mark. */
  const composedStrip = useMemo(() => {
    const map = new Map<SkirmishTabId, string>(installedStrip);
    for (const [seat, version] of chosen) map.set(seat, version.media!.url);
    return map;
  }, [chosen, installedStrip]);

  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading candidates…</p>;
  return (
    // The grid goes on an INNER body, never on the element the Studio pane places: that pane gives
    // its child a constrained height, and a grid there has its auto rows crushed — the strips row
    // measured 0px tall with the candidate list painted on top of it.
    <div data-testid="skirmish-tab-mark-catalog">
      <div className="skirmish-tab-mark-review">
      <section className="skirmish-tab-mark-strips" aria-label="Controls head">
        <div className="skirmish-tab-mark-column">
          <h2>Installed</h2>
          <p>What a Battle paints today.</p>
          <StripPreview
            ariaLabel="Installed Controls head"
            testId="skirmish-tab-strip-installed"
            armed={installedStrip}
          />
          <p className="skirmish-tab-mark-legend">{TAB_LEGEND}</p>
        </div>
        <div className="skirmish-tab-mark-column">
          <h2>Composed</h2>
          <p>The armed candidates — not installed.</p>
          <StripPreview
            ariaLabel="Composed Controls head"
            testId="skirmish-tab-strip-composed"
            armed={composedStrip}
          />
          <p className="skirmish-tab-mark-legend">{TAB_LEGEND}</p>
          <InstallStripControl chosen={chosen} catalog={catalog} onInstalled={refresh} />
        </div>
      </section>
      <section className="skirmish-tab-mark-picks" aria-label="Candidates by tab">
        {SKIRMISH_TAB_MARKS.map((seat) => {
          const list = candidates.get(seat) ?? [];
          return (
            <div className="skirmish-tab-mark-pick" key={seat}>
              <h3>{SEAT_LABEL[seat]}</h3>
              <p className="tileset-catalog-note">{SEAT_ALSO_DRAWS[seat]}</p>
              {list.length ? (
                <div className="skirmish-tab-mark-options">
                  {list.map((version) => {
                    const active = chosen.get(seat)?.id === version.id;
                    const label = metadataString(version, 'treatmentLabel') || version.label;
                    return (
                      <ChromeButton
                        unit="inner-text-button"
                        key={version.id}
                        data-testid={`skirmish-tab-option-${seat}-${conceptOrdinal(seat, version)}-${candidateIndex(version)}`}
                        className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'skirmish-tab-mark-option', active && 'active is-active')}
                        aria-pressed={active}
                        title={`${SEAT_LABEL[seat]} — ${label}`}
                        onClick={() => pick(seat, version.id)}
                      >
                        {/* The art at 56px AND the mark at its true seat. Sixteen candidates look
                            identical at 20px alone, and a card showing only 64px art hides the
                            thing that actually decides between them. */}
                        <img className="skirmish-tab-mark-option-art" src={version.media!.url} alt="" draggable={false} />
                        <SkirmishTabIcon tab={seat} src={version.media!.url} />
                        <span className="skirmish-tab-mark-option-label">{label}</span>
                      </ChromeButton>
                    );
                  })}
                </div>
              ) : (
                <p role="status">No candidate is waiting for this tab.</p>
              )}
            </div>
          );
        })}
      </section>
      </div>
    </div>
  );
}

export function SkirmishTabMarkControls(): ReactElement {
  return (
    <p className="tileset-catalog-note">
      The strip on the left is the real Controls head — the same panel, the same divided block, the
      same 20px seat a Battle draws. Press a candidate to arm it there; press it again to leave that
      tab alone. Every mark is fitted the way the GEAR already was: ink scaled to exactly 52px tall
      on the 64&times;64 canvas, both ink dimensions even, centred (ADR-0560). That fit is the whole
      reason the gear read at full size while its four neighbours did not. Nothing is installed until
      you press Install.
    </p>
  );
}
