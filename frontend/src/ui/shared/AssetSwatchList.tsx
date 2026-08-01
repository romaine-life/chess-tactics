import { type ReactElement, type ReactNode } from 'react';
import { ChromeButton } from './ChromeButton';

export interface AssetSwatchDefinition {
  id: string;
  label: string;
  content: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
  onSelect: () => void;
}

/** Shared renderer for editor asset palettes. Callers provide swatch definitions only. */
export function AssetSwatchList({
  items,
  className = 'le-swatches',
  ariaLabel,
}: {
  items: readonly AssetSwatchDefinition[];
  className?: string;
  ariaLabel?: string;
}): ReactElement {
  return (
    <div className={className} role={ariaLabel ? 'group' : undefined} aria-label={ariaLabel}>
      {items.map((item) => (
        <ChromeButton
          key={item.id}
          unit="inner-asset-swatch"
          className={`le-swatch ${item.className ?? ''}`.trim()}
          selected={item.selected}
          disabled={item.disabled}
          aria-label={item.label}
          title={item.title}
          onClick={item.onSelect}
        >
          {item.content}
        </ChromeButton>
      ))}
    </div>
  );
}
