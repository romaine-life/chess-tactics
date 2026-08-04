import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { createRunForm, runActivity, type RunActivity } from './RunForm';

function form() {
  return createRunForm({
    run: null,
    routePath: '/run',
    routeSearch: '',
    strategikonOpen: false,
    titleBarContent: null,
    lipsanonIds: [],
    inspectionWorkspace: null,
  });
}

describe('RunForm', () => {
  it('admits only branded activities through its closed page boundary', () => {
    const runForm = form();
    expect(Object.isFrozen(runForm)).toBe(true);
    expect(() => runForm.add({} as RunActivity)).toThrow('RunForm accepts only runActivity contributions.');

    const activity = runActivity({
      id: 'sectio',
      testId: 'run-sectio',
      controlsContent: null,
      hudProps: { enableGlobalShortcuts: false },
      viewport: {
        className: 'run-phase-workspace',
        primaryClassName: 'run-phase-primary',
        primary: null,
        ariaLabel: 'Run workspace',
        sceneInstance: '/run',
      },
    });

    expect(Object.isFrozen(activity)).toBe(true);
    expect(activity.id).toBe('sectio');
    expect(isValidElement(runForm.add(activity))).toBe(true);
  });
});
