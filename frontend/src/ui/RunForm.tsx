import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { RunDocument, LipsanonId } from '../run/model';
import type { SkirmishHudProps } from './SkirmishHud';
import { SkirmishShell } from './SkirmishShell';
import { Strategikon } from './Strategikon';
import { ShellViewportSwap } from './shared/ChromeBox';
import { GameplayWorkspaceSceneSlot } from './shell/AuthoredSceneSlot';

const RUN_ACTIVITY = Symbol('run-activity');
const RUN_FORM = Symbol('run-form');

type RunHudProps = Omit<
  SkirmishHudProps,
  'strategikonPath' | 'strategikonSearch' | 'strategikonHeldCards' | 'controlsContent'
>;

export interface RunActivityViewport {
  className: string;
  primaryClassName: string;
  primary: ReactNode;
  ariaLabel: string;
  sceneInstance: string;
  persistent?: ReactNode;
}

export interface RunActivityInput {
  id: string;
  testId: string;
  className?: string;
  controlsContent?: ReactNode;
  hudProps: RunHudProps;
  viewport: RunActivityViewport;
  beforeViewport?: ReactNode;
  afterViewport?: ReactNode;
  persistentViewportArtwork?: ReactNode;
  screenStyle?: CSSProperties | null;
  registerSceneSurface?: boolean;
  surfaceSignature?: string;
  readyToCompose?: boolean;
}

export interface RunActivity extends Readonly<RunActivityInput> {
  readonly [RUN_ACTIVITY]: true;
}

export function runActivity(input: RunActivityInput): RunActivity {
  return Object.freeze({ ...input, [RUN_ACTIVITY]: true as const });
}

export interface RunFormInput {
  run: RunDocument | null;
  routePath: string;
  routeSearch: string;
  strategikonOpen: boolean;
  titleBarContent: ReactNode;
  lipsanonIds: readonly LipsanonId[];
  inspectionWorkspace: ReactNode;
  className?: string;
}

export interface RunForm {
  readonly [RUN_FORM]: true;
  add(activity: RunActivity): ReactElement;
}

function RunFormView({ form, activity }: { form: RunFormInput; activity: RunActivity }): ReactElement {
  const strategikonPath = form.run ? form.routePath : null;
  const workspaceOpen = form.strategikonOpen || Boolean(form.inspectionWorkspace);
  return (
    <SkirmishShell
      testId={activity.testId}
      className={[form.className ?? 'run-screen', activity.className ?? ''].filter(Boolean).join(' ')}
      titleBarContent={form.titleBarContent}
      persistentViewportArtwork={activity.persistentViewportArtwork}
      lipsanonIds={form.lipsanonIds}
      shellWorkspaceCoversLipsana={workspaceOpen}
      controlsContent={activity.controlsContent}
      hudProps={{
        ...activity.hudProps,
        strategikonPath,
        strategikonSearch: form.routeSearch,
        // The register's own size, from the same place its address comes from. An activity
        // cannot supply it: the Run frame owns the Strategikon, so it owns what the index says
        // about it, and a Battle handing its own count down would be a second answer to one
        // question. A Skirmish has no Run behind this index and so counts nothing.
        strategikonHeldCards: form.run?.cards.length,
      }}
      screenStyle={activity.screenStyle}
      registerSceneSurface={activity.registerSceneSurface}
      surfaceSignature={activity.surfaceSignature ?? activity.id}
      readyToCompose={activity.readyToCompose}
    >
      {activity.beforeViewport}
      <ShellViewportSwap
        className={activity.viewport.className}
        primaryClassName={activity.viewport.primaryClassName}
        primary={activity.viewport.primary}
        workspaceOpen={workspaceOpen}
        persistent={activity.viewport.persistent}
        aria-label={form.strategikonOpen ? 'Run reference workspace' : activity.viewport.ariaLabel}
        data-scene-instance={activity.viewport.sceneInstance}
      >
        {form.inspectionWorkspace}
        <GameplayWorkspaceSceneSlot
          className="strategikon-slot"
          sceneInstance={form.strategikonOpen ? form.routePath : '/run/strategikon'}
        >
          {form.strategikonOpen ? (
            <Strategikon path={form.routePath} search={form.routeSearch} run={form.run} />
          ) : null}
        </GameplayWorkspaceSceneSlot>
      </ShellViewportSwap>
      {activity.afterViewport}
    </SkirmishShell>
  );
}

/**
 * The sole Run-page constructor. A feature can add typed content to the activity,
 * controls, and overlay slots; it cannot replace the Run frame or omit its Strategikon.
 */
export function createRunForm(input: RunFormInput): RunForm {
  const form = Object.freeze({ ...input });
  return Object.freeze({
    [RUN_FORM]: true as const,
    add(activity: RunActivity): ReactElement {
      if (activity[RUN_ACTIVITY] !== true) throw new Error('RunForm accepts only runActivity contributions.');
      return <RunFormView form={form} activity={activity} />;
    },
  });
}
