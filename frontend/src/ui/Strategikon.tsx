import { useState, type ReactElement } from 'react';
import type { RunDocument } from '../run/model';
import {
  DEFAULT_RUN_ARMY_FILTERS,
  RunArmyWorkspace,
  type RunArmyFilters,
} from './RunArmyWorkspace';
import { EnchiridionReference, EnchiridionSectionRail, LipsanaCodex } from './Enchiridion';
import { HeldCardCodex } from './HeldCardCodex';
import { ApparatusRailColumn, ApparatusRailTab } from './shared/ApparatusRailTab';
import { useOpenRailTab } from './shared/railOpenIntent';
import { InnerChromeBox, ShellWorkspace } from './shared/ChromeBox';
import {
  StrategikonContentSceneSlot,
  StrategikonReferenceSceneSlot,
} from './shell/AuthoredSceneSlot';
import { TitleBarControlContribution } from './shell/TitleBarControls';
import type { EnchiridionSection } from './enchiridionRoute';
import {
  isStrategikonPath,
  strategikonAddress,
  strategikonHref,
  type StrategikonSection,
} from './strategikonRoute';
import { strategikonNavigationItems, useStrategikonCardsIcon } from './strategikonNavigation';
import { installedUiMedia } from './installedUiMedia';

// The addresses the section rail speaks for: the whole Strategikon, including its own
// section-less root. Leaving it for the Battle or the Run is not this rail's business, and
// the rail keeps wearing what is committed on the way out. See shared/railOpenIntent.ts.
const SECTION_RAIL_ADDRESSES = {
  governs: isStrategikonPath,
  select: (path: string): StrategikonSection | null => strategikonAddress(path).section,
};

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
  // The open mark follows the address; `section` — and so the pane, its scene slot and its
  // transition — still waits for the committed one.
  const openSection = useOpenRailTab(SECTION_RAIL_ADDRESSES, section);
  const cardsIcon = useStrategikonCardsIcon();
  const [filters, setFilters] = useState<RunArmyFilters>({ ...DEFAULT_RUN_ARMY_FILTERS });
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const href = (next: StrategikonSection, nextReference: EnchiridionSection | null = null): string => (
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
        <ApparatusRailColumn opens="panel-beside" className="strategikon-rail" aria-label="Strategikon sections">
          {strategikonNavigationItems(cardsIcon).map((item, index) => (
            <ApparatusRailTab
              key={item.section}
              label={item.label}
              title={item.title}
              to={href(item.section)}
              index={index}
              active={section === item.section}
              expanded={openSection === item.section}
              iconSrc={item.iconSrc}
              iconClassName={item.iconClassName}
            />
          ))}
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
      {section ? <StrategikonContentSceneSlot
        className={`strategikon-pane${section === 'enchiridion' ? ' has-secondary-rail' : ''}`}
        sceneInstance={`strategikon/${section}`}
      >
        {section === 'enchiridion' ? (
          <>
            <EnchiridionSectionRail
              section={reference}
              sectionHref={(next) => href('enchiridion', next)}
            />
            {reference ? <StrategikonReferenceSceneSlot
              className="strategikon-reference-pane"
              sceneInstance={`strategikon/enchiridion/${reference}`}
            >
              {/* The Battle-hosted reference keeps its selection ephemeral: no href is
                  supplied, so each codex falls back to its own local selection state. */}
              <EnchiridionReference
                section={reference}
                framed={false}
                selectedLipsanonId={null}
                selectedCardId={null}
              />
            </StrategikonReferenceSceneSlot> : null}
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
              framed={false}
            />
          ) : (
            <UnavailableRunReference title="The Martial Prosopography" copy="A persistent Current Army appears here during a Run." />
          )
        ) : section === 'chartulary' ? (
          run ? (
            <HeldCardCodex run={run} title="The Chartulary — Held Cards" framed={false} />
          ) : (
            <UnavailableRunReference title="The Chartulary" copy="Cards adlected during a Run appear here." />
          )
        ) : run ? (
          <LipsanaCodex lipsanonIds={run.lipsana} title="The Lipsanotheca" showStatistics={false} framed={false} />
        ) : (
          <UnavailableRunReference title="The Lipsanotheca" copy="Held lipsana appear here during a Run." />
        )}
      </StrategikonContentSceneSlot> : null}
    </ShellWorkspace>
  );
}
