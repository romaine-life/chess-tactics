import {
  Children,
  Fragment,
  isValidElement,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { KitScroll } from '../KitScroll';
import { ChromeSurfaceFill, InnerChromeBox } from './ChromeBox';
import { ChromeGridRail, ChromeJunction, type ChromeJunctionSides } from './chromeRailInternals';

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

/**
 * The grid's own element when it IS the workspace rather than a box inside one: same classes and
 * same rails, no box frame. It still takes a SURFACE — a workspace that replaces a retained scene
 * has nothing of its own behind it, and without one the scene reads straight through the text.
 * Frame and surface are separate decisions; this drops the first and keeps the second.
 */
function UnframedDividedGrid({
  className = '',
  fillRole,
  fillSurface,
  children,
  ...props
}: ComponentProps<typeof InnerChromeBox>): ReactElement {
  const hasFill = Boolean(fillRole || fillSurface);
  return (
    <div
      {...props}
      data-chrome-grid-framed="false"
      className={`${className}${hasFill ? ' has-chrome-surface-fill' : ''}`}
    >
      {hasFill ? (
        <ChromeSurfaceFill
          role={fillRole}
          surface={fillSurface}
          className="chrome-divided-grid__fill"
        />
      ) : null}
      {children}
    </div>
  );
}

export function DividedInnerChromeBox({
  columns,
  scroll = false,
  contentRef,
  className = '',
  framed = true,
  children,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  columns: readonly string[];
  scroll?: boolean;
  contentRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  /** Installed material under the whole pane, on the inner box's own borrowing terms. */
  fillRole?: ComponentProps<typeof InnerChromeBox>['fillRole'];
  fillSurface?: ComponentProps<typeof InnerChromeBox>['fillSurface'];
  /**
   * False when the grid IS a shell workspace rather than a box standing inside one: the title
   * bar above it and the Controls rail beside it are already its boundary, so a box frame here
   * draws a second outline just inside them with a strip of surface trapped between (ADR-0297 —
   * an edge-attached body reaches the Controls boundary; the same holds for its own frame).
   * The internal rails are unaffected — they are the whole point.
   */
  framed?: boolean;
}): ReactElement {
  const rows = Children.toArray(children);
  const topology = chromeDividedGridTopology(columns.length, scroll);
  // A junction is the cap where a rail MEETS the box's own frame. An unframed grid has no such
  // frame — the host's chrome is its boundary — so its boundary caps caps nothing and simply sits
  // on top of that chrome as a stray atom. Internal crossings, where two of the grid's own rails
  // actually meet, are the whole point and are kept either way.
  const boundaryNodes = (nodes: readonly ChromeDividedGridNode[]): ChromeDividedGridNode[] => (
    framed ? [...nodes] : nodes.filter((node) => node.inlineBoundary === 'internal')
  );
  const blockBoundaryNodes = framed ? topology : { ...topology, topNodes: [], bottomNodes: [] };
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
              <ChromeGridRail
                role="inner"
                className="chrome-divided-grid__horizontal-rail"
                data-chrome-grid-inline-start="frame-start"
                data-chrome-grid-inline-end={topology.horizontalEndBoundary}
                style={{ gridColumn: `1 / ${topology.horizontalEndLine}` }}
              />
              {boundaryNodes(topology.rowNodes).map((node) => (
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

  const Frame = framed ? InnerChromeBox : UnframedDividedGrid;
  return (
    <Frame
      {...props}
      className={`chrome-divided-grid ${className}`.trim()}
      style={{ ...gridStyle, ...props.style }}
    >
      <div className="chrome-divided-grid__fixed-rails" style={gridStyle} aria-hidden="true">
        {topology.verticalLines.map((line) => (
          <ChromeGridRail
            key={`vertical-${line}`}
            role="inner"
            orientation="vertical"
            className="chrome-divided-grid__vertical-rail"
            data-chrome-grid-block-start="frame-start"
            data-chrome-grid-block-end="frame-end"
            style={linePlacement(line, topology.trackCount)}
          />
        ))}
        {blockBoundaryNodes.topNodes.map((node) => (
          <GridJunction
            key={`top-${node.line}`}
            node={node}
            trackCount={topology.trackCount}
            blockBoundary="frame-start"
          />
        ))}
        {blockBoundaryNodes.bottomNodes.map((node) => (
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
    </Frame>
  );
}
