// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const panel = readFileSync(new URL('./PredrawnBackgroundVersionsPanel.tsx', import.meta.url), 'utf8');

describe('pipeline slot archive feedback', () => {
  it('uses the same visible action gate for the button and both sides of confirmation', () => {
    expect(panel).toContain('const selectedAttemptArchiveAction = predrawnAttemptArchiveAction({');
    expect(panel).toContain('disabled={!selectedAttemptArchiveAction.ready}');

    const handler = panel.slice(
      panel.indexOf('const archiveSelectedAttempt = async'),
      panel.indexOf('const selectedOwned ='),
    );
    expect(handler).toContain('const requested = archiveActionSnapshotRef.current;');
    expect(handler).toContain('!requested.action.ready');
    expect(handler).toContain("message: requested?.action.explanation ?? 'Select a pipeline slot to archive.'");
    expect(handler).toContain('const current = archiveActionSnapshotRef.current;');
    expect(handler).toContain('if (!current.action.ready)');
    expect(handler).toContain('Nothing was archived.');
    expect(handler).toContain('Archive canceled. The pipeline slot was not changed.');
  });

  it('reports confirmation, API, handled-mutation, and refresh failures beside Archive slot', () => {
    const handler = panel.slice(
      panel.indexOf('const archiveSelectedAttempt = async'),
      panel.indexOf('const selectedOwned ='),
    );
    const catchStart = handler.lastIndexOf('} catch (cause) {');
    const catchBlock = handler.slice(catchStart);

    expect(handler).toContain('The archive confirmation could not be opened.');
    expect(handler).toContain('The server archived the slot, but the active slot list could not be refreshed.');
    expect(catchBlock.indexOf("setArchiveActionFeedback({ tone: 'error'")).toBeGreaterThan(-1);
    expect(catchBlock.indexOf("setArchiveActionFeedback({ tone: 'error'")).toBeLessThan(
      catchBlock.indexOf('onMutationError(cause)'),
    );
    expect(panel).toContain('data-testid="archive-pipeline-slot-feedback"');
    expect(panel).toContain("role={archiveActionFeedback.tone === 'error' ? 'alert' : 'status'}");
  });
});
