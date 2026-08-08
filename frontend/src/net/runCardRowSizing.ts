import { requestJson } from './http';
import type { RunCardRowSizing } from '../ui/runCardRowSizing';

export interface RunCardRowSizingDocument {
  card: RunCardRowSizing;
}

export function saveRunCardRowSizing(
  sizing: RunCardRowSizingDocument,
): Promise<RunCardRowSizingDocument> {
  return requestJson<RunCardRowSizingDocument>(
    'PUT',
    '/api/studio/run-card-row-sizing/defaults',
    sizing,
  );
}
