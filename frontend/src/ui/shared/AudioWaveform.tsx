import type { ReactElement } from 'react';

export function AudioWaveform({
  peaks,
  bars = 56,
  selectedStart = 0,
  selectedEnd = 1,
}: {
  peaks: readonly number[];
  bars?: number;
  selectedStart?: number;
  selectedEnd?: number;
}): ReactElement {
  const count = peaks.length || bars;
  const start = Math.max(0, Math.min(1, selectedStart));
  const end = Math.max(start, Math.min(1, selectedEnd));
  return (
    <svg
      className="sfx-wave"
      viewBox={`0 0 ${count} 100`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      {peaks.length === 0 ? (
        <line x1="0" y1="50" x2={count} y2="50" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      ) : (
        peaks.map((peak, index) => {
          const height = Math.max(peak * 96, 1.5);
          const ratio = (index + 0.5) / count;
          return (
            <rect
              key={index}
              x={index + 0.12}
              y={(100 - height) / 2}
              width={0.76}
              height={height}
              fill="currentColor"
              fillOpacity={ratio >= start && ratio <= end ? 1 : 0.16}
            />
          );
        })
      )}
    </svg>
  );
}
