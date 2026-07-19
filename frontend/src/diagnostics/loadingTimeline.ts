export type LoadingEventKind = 'mark' | 'measure' | 'resource' | 'error';

export interface LoadingTimelineEvent {
  id: number;
  at: number;
  kind: LoadingEventKind;
  surface: string;
  phase: string;
  detail?: Record<string, string | number | boolean | null>;
}

type Listener = () => void;

const MAX_EVENTS = 1500;
const state = {
  nextId: 1,
  events: [] as LoadingTimelineEvent[],
  listeners: new Set<Listener>(),
  observerInstalled: false,
};

function emit(): void {
  for (const listener of state.listeners) listener();
}

function append(event: Omit<LoadingTimelineEvent, 'id'>): void {
  state.events = [...state.events, { ...event, id: state.nextId++ }].slice(-MAX_EVENTS);
  emit();
}

export function loadingMark(
  surface: string,
  phase: string,
  detail?: LoadingTimelineEvent['detail'],
  kind: LoadingEventKind = 'mark',
): void {
  append({ at: performance.now(), kind, surface, phase, detail });
}

export function loadingMeasure(
  surface: string,
  phase: string,
  startedAt: number,
  detail?: LoadingTimelineEvent['detail'],
): void {
  loadingMark(surface, phase, { ...detail, durationMs: Math.round((performance.now() - startedAt) * 10) / 10 }, 'measure');
}

export function loadingError(surface: string, phase: string, error: unknown): void {
  loadingMark(surface, phase, { message: error instanceof Error ? error.message : String(error) }, 'error');
}

export function loadingEvents(): readonly LoadingTimelineEvent[] {
  return state.events;
}

export function subscribeLoadingTimeline(listener: Listener): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

export function clearLoadingTimeline(): void {
  state.events = [];
  loadingMark('diagnostic', 'timeline-cleared');
}

export function installLoadingResourceObserver(): void {
  if (state.observerInstalled || typeof PerformanceObserver === 'undefined') return;
  state.observerInstalled = true;
  const record = (entry: PerformanceResourceTiming): void => {
    const url = new URL(entry.name, window.location.href);
    if (url.origin !== window.location.origin) return;
    const interesting = url.pathname.startsWith('/assets/')
      || url.pathname.startsWith('/api/media/')
      || url.pathname.startsWith('/api/asset-catalog')
      || url.pathname.startsWith('/api/unit-catalog')
      || url.pathname.startsWith('/api/campaign')
      || url.pathname.includes('thumbnail');
    if (!interesting) return;
    append({
      at: entry.startTime,
      kind: 'resource',
      surface: 'network',
      phase: url.pathname,
      detail: {
        durationMs: Math.round(entry.duration * 10) / 10,
        transferBytes: entry.transferSize,
        encodedBytes: entry.encodedBodySize,
        decodedBytes: entry.decodedBodySize,
        initiator: entry.initiatorType,
        protocol: entry.nextHopProtocol || 'unknown',
        cacheHit: entry.transferSize === 0 && entry.decodedBodySize > 0,
      },
    });
  };
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) record(entry as PerformanceResourceTiming);
    emit();
  });
  observer.observe({ type: 'resource', buffered: true });
}
