import type { TimeControl } from '../core/level';

const TIME_INITIAL_PARAM = 'time';
const TIME_INCREMENT_PARAM = 'inc';

export function appendTimeControlParams(params: URLSearchParams, timeControl: TimeControl | undefined): void {
  params.delete(TIME_INITIAL_PARAM);
  params.delete(TIME_INCREMENT_PARAM);
  if (!timeControl) return;
  params.set(TIME_INITIAL_PARAM, String(timeControl.initialSeconds));
  params.set(TIME_INCREMENT_PARAM, String(timeControl.incrementSeconds));
}

export function readTimeControlParams(params: URLSearchParams): TimeControl | undefined {
  const initialRaw = params.get(TIME_INITIAL_PARAM);
  const incrementRaw = params.get(TIME_INCREMENT_PARAM);
  if (initialRaw === null && incrementRaw === null) return undefined;

  const initialSeconds = Number(initialRaw);
  const incrementSeconds = incrementRaw === null ? 0 : Number(incrementRaw);
  if (!Number.isInteger(initialSeconds) || initialSeconds < 1) return undefined;
  if (!Number.isInteger(incrementSeconds) || incrementSeconds < 0) return undefined;
  return { initialSeconds, incrementSeconds };
}
