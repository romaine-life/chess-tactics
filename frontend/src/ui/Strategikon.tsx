import { useState, type ReactElement } from 'react';
import type { RunDocument } from '../run/model';
import {
  DEFAULT_RUN_ARMY_FILTERS,
  RunArmyWorkspace,
  type RunArmyFilters,
} from './RunArmyWorkspace';
import { EnchiridionReference, EnchiridionSectionRail, RelicCodex } from './Enchiridion';
import { HeldCardCodex } from './HeldCardCodex';
import { ApparatusRailColumn, ApparatusRailTab } from './shared/ApparatusRailTab';
import { InnerChromeBox, ShellWorkspace } from './shared/ChromeBox';
import {
  StrategikonContentSceneSlot,
  StrategikonReferenceSceneSlot,
} from './shell/AuthoredSceneSlot';
import { TitleBarControlContribution } from './shell/TitleBarControls';
import type { EnchiridionSection } from './enchiridionRoute';
import { strategikonAddress, strategikonHref, type StrategikonSection } from './strategikonRoute';
import { installedUiMedia } from './installedUiMedia';
import { menuModeIcon } from './menuModeIcon';

function UnavailableRunReference({ title, copy }: { title: string; copy: string }): ReactElement {
  return (
    <main className="strategikon-reference">
      <section className="enchiridion-panel enchiridion-panel-unframed strategikon-unavailable-panel">
        <h2 className="settings-section-title">{title}</h2>
        <InnerChromeBox className="enchiridion-empty">
          <h3>No persistent Run is attached</h3>
          <p>{copy}</p>
        </InnerChromeBox>
      </section>
    </main>
  );
}

/**
 * The Battle-hosted reference workspace.
 *
 * Its two rails are director-owned scene slots, exactly like Settings' and the
 * main-menu Enchiridion's, so section travel transitions instead of swapping. The
 * section rail is retained outside `StrategikonContentSceneSlot`; the Enchiridion
 * reference rail sits INSIDE that slot (it belongs to the Enchiridion section and
 * leaves with it) but outside `StrategikonReferenceSceneSlot`, so paging through
 * records keeps both rails anchored. Addresses come from `strategikonRoute` — the
 * one grammar the scene manifest also reads.
 */
export function Strategikon({
  path,
  search,
  run,
}: {
  path: string;
  search: string;
  run?: RunDocument | null;
}): ReactElement {
  const { base, section, reference } = strategikonAddress(path);
  const [filters, setFilters] = useState<RunArmyFilters>({ ...DEFAULT_RUN_ARMY_FILTERS });
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const href = (next: StrategikonSection, nextReference: EnchiridionSection = 'units'): string => (
    `${strategikonHref(base, next, nextReference)}${search}`
  );
  // The way out. The Controls title mark that opened the workspace is the only other
  // exit and it sits behind the reference pane's own chrome, so leaving read as a
  // puzzle. The return rides the same typed title-bar lane Settings and the playtest
  // return use — named for its destination so it never reads as a second bare "Back"
  // beside a playtest's own return control.
  const returnName = base === '/run' ? 'Run' : 'Battle';

  return (
    <ShellWorkspace
      className="strategikon-workspace"
      contentClassName="strategikon-workspace-layout"
      bodyClassName="strategikon-content"
      backgroundArtwork={(
        <img
          className="strategikon-background-artwork"
          src={installedUiMedia('ui-workspaces-strategikon-background-png')}
          alt=""
          draggable={false}
        />
      )}
      edgeAttached
      rail={(
        <ApparatusRailColumn className="strategikon-rail" aria-label="Strategikon sections">
          <ApparatusRailTab
            label="Enchiridion"
            to={href('enchiridion', reference)}
            index={0}
            active={section === 'enchiridion'}
            // The main menu's Enchiridion destination and this one are the same
            // destination, so they read the same installed mark (menuModeIcon).
            iconSrc={menuModeIcon('enchiridion')}
          />
          <ApparatusRailTab
            label="Prosopography"
            title="The Martial Prosopography — Current Army"
            to={href('prosopography')}
            index={1}
            active={section === 'prosopography'}
            // The Enchiridion's Units and Cards references mark units and cards; this rail's
            // two Run registers are those same two kinds of record, so they take the same
            // two marks rather than sharing one between adjacent tabs.
            iconSrc={installedUiMedia('ui-kit-icons-unit-studio-png')}
          />
          <ApparatusRailTab
            label="Chartulary"
            title="The Chartulary — Held Cards"
            to={href('chartulary')}
            index={2}
            active={section === 'chartulary'}
            iconSrc={installedUiMedia('ui-kit-icons-players-png')}
          />
          <ApparatusRailTab
            label="Lipsanotheca"
            title="The Lipsanotheca — Held Relics"
            to={href('lipsanotheca')}
            index={3}
            active={section === 'lipsanotheca'}
            iconSrc={installedUiMedia('ui-kit-icons-info-png')}
          />
        </ApparatusRailColumn>
      )}
      aria-label="Strategikon"
      data-testid="strategikon"
    >
      {/* Portals to the title bar's control lane — it renders nothing here. */}
      <TitleBarControlContribution
        ariaLabel="Strategikon navigation"
        controls={[{
          id: 'strategikon-back',
          kind: 'navigation',
          presentation: 'return',
          label: `‹ Back to ${returnName}`,
          destination: `${base}${search}`,
          title: `Close the Strategikon and return to the ${returnName}.`,
          testId: 'strategikon-back',
        }]}
      />
      <StrategikonContentSceneSlot
        className={`strategikon-pane${section === 'enchiridion' ? ' has-secondary-rail' : ''}`}
        sceneInstance={`strategikon/${section}`}
      >
        {section === 'enchiridion' ? (
          <>
            <EnchiridionSectionRail
              section={reference}
              sectionHref={(next) => href('enchiridion', next)}
            />
            <StrategikonReferenceSceneSlot
              className="strategikon-reference-pane"
              sceneInstance={`strategikon/enchiridion/${reference}`}
            >
              {/* The Battle-hosted reference keeps its selection ephemeral: no href is
                  supplied, so each codex falls back to its own local selection state. */}
              <EnchiridionReference
                section={reference}
                framed={false}
                selectedRelicId={null}
                selectedCardId={null}
                selectedCardTypeId={null}
              />
            </StrategikonReferenceSceneSlot>
          </>
        ) : section === 'prosopography' ? (
          run ? (
            <RunArmyWorkspace
              run={run}
              title="The Martial Prosopography"
              backLabel="Back to Prosopography"
              filters={filters}
              selectedUnitId={selectedUnitId}
              onFiltersChange={setFilters}
              onSelectUnit={setSelectedUnitId}
              onBack={() => setSelectedUnitId(null)}
              onSell={() => undefined}
              framed={false}
            />
          ) : (
            <UnavailableRunReference title="The Martial Prosopography" copy="A persistent Current Army appears here during a Run." />
          )
        ) : section === 'chartulary' ? (
          run ? (
            <HeldCardCodex run={run} title="The Chartulary" framed={false} />
          ) : (
            <UnavailableRunReference title="The Chartulary" copy="Cards bought during a Run appear here." />
          )
        ) : run ? (
          <RelicCodex relicIds={run.relics} title="The Lipsanotheca" showStatistics={false} framed={false} />
        ) : (
          <UnavailableRunReference title="The Lipsanotheca" copy="Held relics appear here during a Run." />
        )}
      </StrategikonContentSceneSlot>
    </ShellWorkspace>
  );
}
