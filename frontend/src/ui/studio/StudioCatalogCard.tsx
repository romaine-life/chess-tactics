import { type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';

export interface StudioCatalogCardAction {
  id: string;
  label: string;
  title: string;
  icon: ReactNode;
  run: () => void;
}

export function InspectIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <rect x="1.6" y="6.4" width="12.8" height="8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1.2 V5.4 M5.4 3.2 L8 5.8 L10.6 3.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function actionProps(run: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: (event: MouseEvent) => { event.stopPropagation(); run(); },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        run();
      }
    },
  };
}

/** Canonical Studio catalog card. Every catalog supplies data; this owns the card DOM. */
export function StudioCatalogCard({
  title,
  badge,
  media,
  image,
  selected = false,
  onSelect,
  className = '',
  imageClassName = '',
  imageStyle,
  titleText,
  actions = [],
  onInspect,
  inspectLabel,
  showImage = true,
  textExtra,
  metaExtra,
  onOpen,
  ariaLabel,
  actionPrefix,
}: {
  title: ReactNode;
  badge?: ReactNode;
  media?: ReactNode;
  image?: string | null;
  selected?: boolean;
  onSelect: () => void;
  className?: string;
  imageClassName?: string;
  imageStyle?: CSSProperties;
  titleText?: string;
  actions?: readonly StudioCatalogCardAction[];
  onInspect?: () => void;
  inspectLabel?: string;
  showImage?: boolean;
  textExtra?: ReactNode;
  metaExtra?: ReactNode;
  onOpen?: () => void;
  ariaLabel?: string;
  actionPrefix?: ReactNode;
}): ReactElement {
  const accessibleTitle = typeof title === 'string' ? title : titleText ?? 'catalog item';
  const allActions = onInspect ? [
    ...actions,
    {
      id: 'inspect',
      label: inspectLabel ?? `Inspect ${accessibleTitle}`,
      title: inspectLabel ?? `Inspect ${accessibleTitle}`,
      icon: <InspectIcon />,
      run: onInspect,
    },
  ] : actions;
  return (
    <button
      type="button"
      className={`tileset-studio-card ${className} ${selected ? 'is-selected' : ''}`.replace(/\s+/g, ' ').trim()}
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={titleText ?? `Select ${accessibleTitle}`}
      aria-pressed={selected}
      aria-label={ariaLabel}
    >
      {showImage ? (
        <span className={`tileset-studio-card-image ${imageClassName}`.trim()} style={imageStyle}>
          {media ?? (image
            ? <img src={image} alt="" draggable={false} loading="lazy" decoding="async" />
            : <span className="tileset-card-missing-media">Missing media</span>)}
        </span>
      ) : null}
      <span className="tileset-studio-card-meta">
        <span className="tileset-studio-card-text">
          <strong>{title}</strong>
          {badge !== undefined ? <em>{badge}</em> : null}
          {textExtra}
        </span>
        {metaExtra}
        {allActions.length || actionPrefix ? (
          <span className="tileset-card-actions">
            {actionPrefix}
            {allActions.map((action) => (
              <span key={action.id} className="tileset-card-action" title={action.title} aria-label={action.label} {...actionProps(action.run)}>
                {action.icon}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </button>
  );
}
