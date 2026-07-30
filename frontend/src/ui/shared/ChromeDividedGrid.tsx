import {
  Children,
  Fragment,
  isValidElement,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { KitScroll } from '../KitScroll';
import {
  ChromeDivider,
  ChromeJunction,
  InnerChromeBox,
  type ChromeJunctionSides,
} from './ChromeBox';

export type ChromeDividedGridNode = {
  line: number;
  sides: ChromeJunctionSides;
  inlineBoundary: 'frame-start' | 'internal' | 'frame-end';
};

export type ChromeDividedGridTopology = {
  trackCount: number;
  horizontalEndLine: number;
  horizontalEndBoundary: 'internal' | 'frame-end';
  verticalLines: number[];
  rowNodes: ChromeDividedGridNode[];
  topNodes: ChromeDividedGridNode[];
  bottomNodes: ChromeDividedGridNode[];
};

/**
 * Produces the rail graph for one divided box. Grid lines, rather than
 * consumer-authored offsets, are the authority for every rail and junction.
 */
export function chromeDividedGridTopology(
  contentColumnCount: number,
  hasScrollGutter: boolean,
): ChromeDividedGridTopology {
  if (!Number.isInteger(contentColumnCount) || contentColumnCount < 1) {
    throw new Error('A divided chrome grid requires at least one content column.');
  }
  const trackCount = contentColumnCount + (hasScrollGutter ? 1 : 0);
  const horizontalEndLine = contentColumnCount + 1;
  const internalLines = Array.from(
    { length: Math.max(0, contentColumnCount - 1) },
    (_, index) => index + 2,
  );
  const verticalLines = hasScrollGutter
    ? [...internalLines, horizontalEndLine]
    : internalLines;
  const rowNodes: ChromeDividedGridNode[] = [
    { line: 1, sides: 'nes', inlineBoundary: 'frame-start' },
    ...internalLines.map((line): ChromeDividedGridNode => ({
      line,
      sides: 'nesw',
      inlineBoundary: 'internal',
    })),
    {
      line: horizontalEndLine,
      sides: 'nsw',
      inlineBoundary: hasScrollGutter ? 'internal' : 'frame-end',
    },
  ];
  const topNodes = verticalLines.map((line): ChromeDividedGridNode => ({
    line,
    sides: 'esw',
    inlineBoundary: 'internal',
  }));
  const bottomNodes = verticalLines.map((line): ChromeDividedGridNode => ({
    line,
    sides: 'new',
    inlineBoundary: 'internal',
  }));
  return {
    trackCount,
    horizontalEndLine,
    horizontalEndBoundary: hasScrollGutter ? 'internal' : 'frame-end',
    verticalLines,
    rowNodes,
    topNodes,
    bottomNodes,
  };
}

function linePlacement(line: number, trackCount: number): CSSProperties {
  if (line > trackCount) {
    return { gridColumn: trackCount, justifySelf: 'end' };
  }
  return { gridColumn: line, justifySelf: 'start' };
}

function GridJunction({
  node,
  trackCount,
  blockBoundary,
}: {
  node: ChromeDividedGridNode;
  trackCount: number;
  blockBoundary?: 'frame-start' | 'frame-end';
}): ReactElement {
  return (
    <ChromeJunction
      role="inner"
      sides={node.sides}
      className="chrome-divided-grid__junction"
      data-chrome-grid-inline-boundary={node.inlineBoundary}
      data-chrome-grid-block-boundary={blockBoundary}
      style={linePlacement(node.line, trackCount)}
    />
  );
}

export function ChromeDividedGridRow({
  as = 'div',
  className = '',
  ...props
}: (
  | HTMLAttributes<HTMLDivElement>
  | ButtonHTMLAttributes<HTMLButtonElement>
) & {
  as?: 'div' | 'button';
}): ReactElement {
  const classes = `chrome-divided-grid__row ${className}`.trim();
  if (as === 'button') {
    const buttonProps = props as ButtonHTMLAttributes<HTMLButtonElement>;
    return <button {...buttonProps} type={buttonProps.type ?? 'button'} className={classes} />;
  }
  return <div {...props as HTMLAttributes<HTMLDivElement>} className={classes} />;
}

export function DividedInnerChromeBox({
  columns,
  scroll = false,
  contentRef,
  className = '',
  children,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  columns: readonly string[];
  scroll?: boolean;
  contentRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}): ReactElement {
  const rows = Children.toArray(children);
  const topology = chromeDividedGridTopology(columns.length, scroll);
  const template = [
    ...columns,
    ...(scroll ? ['var(--chrome-divided-grid-scroll-gutter)'] : []),
  ].join(' ');
  const gridStyle = {
    '--chrome-divided-grid-columns': template,
  } as CSSProperties;
  const rowLayer = (
    <div className="chrome-divided-grid__rows" style={gridStyle}>
      {rows.map((row, index) => (
        <Fragment key={isValidElement(row) && row.key != null ? row.key : index}>
          {index > 0 ? (
            <div className="chrome-divided-grid__row-boundary">
              <ChromeDivider
                role="inner"
                junctions="none"
                className="chrome-divided-grid__horizontal-rail"
                data-chrome-grid-inline-start="frame-start"
                data-chrome-grid-inline-end={topology.horizontalEndBoundary}
                style={{ gridColumn: `1 / ${topology.horizontalEndLine}` }}
              />
              {topology.rowNodes.map((node) => (
                <GridJunction
                  key={`${node.line}-${node.sides}`}
                  node={node}
                  trackCount={topology.trackCount}
                />
              ))}
            </div>
          ) : null}
          {row}
        </Fragment>
      ))}
    </div>
  );

  return (
    <InnerChromeBox
      {...props}
      className={`chrome-divided-grid ${className}`.trim()}
      style={{ ...gridStyle, ...props.style }}
    >
      <div className="chrome-divided-grid__fixed-rails" style={gridStyle} aria-hidden="true">
        {topology.verticalLines.map((line) => (
          <ChromeDivider
            key={`vertical-${line}`}
            role="inner"
            orientation="vertical"
            junctions="none"
            className="chrome-divided-grid__vertical-rail"
            data-chrome-grid-block-start="frame-start"
            data-chrome-grid-block-end="frame-end"
            style={linePlacement(line, topology.trackCount)}
          />
        ))}
        {topology.topNodes.map((node) => (
          <GridJunction
            key={`top-${node.line}`}
            node={node}
            trackCount={topology.trackCount}
            blockBoundary="frame-start"
          />
        ))}
        {topology.bottomNodes.map((node) => (
          <GridJunction
            key={`bottom-${node.line}`}
            node={node}
            trackCount={topology.trackCount}
            blockBoundary="frame-end"
          />
        ))}
      </div>
      {scroll ? (
        <KitScroll className="chrome-divided-grid__scroll" contentRef={contentRef}>
          {rowLayer}
        </KitScroll>
      ) : rowLayer}
    </InnerChromeBox>
  );
}
