import {
  Children,
  Fragment,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
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

/**
 * What a row needs from the grid to draw its own share of the verticals — supplied by the grid, so
 * a row can never be handed a rail it did not earn, and a consumer never places one.
 */
type ChromeDividedGridSegments = {
  verticalLines: readonly number[];
  trackCount: number;
  /** True once ANY row spans every column, which is when one full-height rail stops being right. */
  segmented: boolean;
};
const ChromeDividedGridSegmentContext = createContext<ChromeDividedGridSegments | null>(null);

export function ChromeDividedGridRow({
  as = 'div',
  className = '',
  spans,
  children,
  ...props
}: (
  | HTMLAttributes<HTMLDivElement>
  | ButtonHTMLAttributes<HTMLButtonElement>
) & {
  as?: 'div' | 'button';
  /**
   * 'all' for a row that is ONE thing across every column — the box's name, a full-width verb.
   * Such a row has no internal column boundary, so no vertical rail may cross it.
   */
  spans?: 'all';
}): ReactElement {
  const segments = useContext(ChromeDividedGridSegmentContext);
  const classes = `chrome-divided-grid__row ${spans === 'all' ? 'chrome-divided-grid__row--spanning' : ''} ${className}`.replace(/\s+/g, ' ').trim();
  // A box with a spanning row cannot rule one line down the whole of itself, so each DIVIDED row
  // carries its own segment and consecutive segments stack into the same continuous line. The
  // four-way junctions where they cross a row boundary are already the boundary layer's.
  const rails = segments?.segmented && spans !== 'all' ? (
    <span className="chrome-divided-grid__row-rails" aria-hidden="true">
      {segments.verticalLines.map((line) => (
        <ChromeGridRail
          key={`row-vertical-${line}`}
          role="inner"
          orientation="vertical"
          className="chrome-divided-grid__vertical-rail"
          style={linePlacement(line, segments.trackCount)}
        />
      ))}
    </span>
  ) : null;
  const body = <>{children}{rails}</>;
  if (as === 'button') {
    const buttonProps = props as ButtonHTMLAttributes<HTMLButtonElement>;
    return <button {...buttonProps} type={buttonProps.type ?? 'button'} className={classes}>{body}</button>;
  }
  return <div {...props as HTMLAttributes<HTMLDivElement>} className={classes}>{body}</div>;
}

/**
 * A run of rows that belong together under one label — the campaign picker's "Official campaigns".
 *
 * It draws NO box and generates no layout of its own: its rows are rows of the grid around it, so
 * the rails between them are that grid's rails, capped by that grid's topology. A group that drew
 * its own box would have to terminate those rails against a frame it does not own, which is the
 * exact failure this module exists to prevent. What the element is for is the SEMANTIC grouping —
 * `role="group"` and its label — which is why it survives as an element at all.
 */
export function ChromeDividedGridRowGroup({
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div {...props} className={`chrome-divided-grid__row-group ${className}`.trim()}>
      {children}
    </div>
  );
}

/** Whether a grid child declared itself one thing across every column. */
function rowSpansAllColumns(row: ReactNode): boolean {
  return isValidElement<{ spans?: 'all' }>(row) && row.props.spans === 'all';
}

type ChromeDividedGridChild = {
  row: ReactNode;
  key: string;
  /** The group element this row was declared inside, if any. */
  group: ReactElement | null;
  groupKey: string | null;
};

/**
 * The grid's rows in one flat list, seeing straight through any row groups.
 *
 * Boundaries have to be computed across the whole box: the rail between a group's last row and the
 * next group's first row is no different from any other, and a grid that only looked at its direct
 * children would leave every rail inside a group to the group — which cannot cap them.
 */
function flattenGridChildren(children: ReactNode): ChromeDividedGridChild[] {
  return Children.toArray(children).flatMap((child, index): ChromeDividedGridChild[] => {
    const key = isValidElement(child) && child.key != null ? String(child.key) : `child-${index}`;
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === ChromeDividedGridRowGroup) {
      return Children.toArray(child.props.children).map((row, rowIndex): ChromeDividedGridChild => ({
        row,
        key: `${key}-${isValidElement(row) && row.key != null ? String(row.key) : rowIndex}`,
        group: child,
        groupKey: key,
      }));
    }
    return [{ row: child, key, group: null, groupKey: null }];
  });
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
  const entries = flattenGridChildren(children);
  const rows = entries.map((entry) => entry.row);
  const topology = chromeDividedGridTopology(columns.length, scroll);
  // A junction is the cap where a rail MEETS the box's own frame. An unframed grid has no such
  // frame — the host's chrome is its boundary — so its boundary caps caps nothing and simply sits
  // on top of that chrome as a stray atom. Internal crossings, where two of the grid's own rails
  // actually meet, are the whole point and are kept either way.
  const boundaryNodes = (nodes: readonly ChromeDividedGridNode[]): ChromeDividedGridNode[] => (
    framed ? [...nodes] : nodes.filter((node) => node.inlineBoundary === 'internal')
  );
  // The caps where a VERTICAL rail meets the box's top and bottom frame — so only where a vertical
  // rail reaches that edge. An unframed grid has no frame for them to meet; a grid whose first or
  // last row spans every column has no rail arriving there either.
  const blockBoundaryNodes = {
    ...topology,
    topNodes: framed && !rowSpansAllColumns(rows[0]) ? topology.topNodes : [],
    bottomNodes: framed && !rowSpansAllColumns(rows[rows.length - 1]) ? topology.bottomNodes : [],
  };
  const template = [
    ...columns,
    ...(scroll ? ['var(--chrome-divided-grid-scroll-gutter)'] : []),
  ].join(' ');
  const gridStyle = {
    '--chrome-divided-grid-columns': template,
  } as CSSProperties;
  // Rows are rendered in one pass and then re-wrapped into their groups, so a group never gets a
  // say in where its rails go: the boundary above a row is decided by the row before it in the
  // BOX, not the row before it in the group.
  const renderedEntries = entries.map((entry, index) => {
    const row = entry.row;
    return (
      <Fragment key={entry.key}>
        {index > 0 ? (
          <div className="chrome-divided-grid__row-boundary">
              <ChromeGridRail
                role="inner"
                className="chrome-divided-grid__horizontal-rail"
                data-chrome-grid-inline-start="frame-start"
                data-chrome-grid-inline-end={topology.horizontalEndBoundary}
                style={{ gridColumn: `1 / ${topology.horizontalEndLine}` }}
              />
              {/* A four-way junction on this boundary only where a vertical rail actually crosses
                  it — which needs the rows on BOTH sides to be divided. Next to a spanning row
                  there is no rail to cap, and the crossing glyph became an ornament floating in a
                  rail with nothing running through it. */}
              {boundaryNodes(topology.rowNodes)
                .filter((node) => node.inlineBoundary !== 'internal'
                  || (!rowSpansAllColumns(rows[index - 1]) && !rowSpansAllColumns(row)))
                .map((node) => (
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
    );
  });
  // Consecutive rows from the same group go back inside it. The group is a semantic wrapper only:
  // it lays out nothing, so the rows it holds stay grid items of this grid.
  const chunks: { group: ReactElement | null; key: string; nodes: ReactNode[] }[] = [];
  entries.forEach((entry, index) => {
    const last = chunks.at(-1);
    if (last && last.group !== null && entry.groupKey === last.key) {
      last.nodes.push(renderedEntries[index]);
      return;
    }
    chunks.push({
      group: entry.group,
      key: entry.groupKey ?? entry.key,
      nodes: [renderedEntries[index]],
    });
  });
  const rowLayer = (
    <div className="chrome-divided-grid__rows" style={gridStyle}>
      {chunks.map((chunk) => chunk.group
        ? cloneElement(chunk.group, { key: chunk.key }, chunk.nodes)
        : <Fragment key={chunk.key}>{chunk.nodes}</Fragment>)}
    </div>
  );

  const Frame = framed ? InnerChromeBox : UnframedDividedGrid;
  const segments: ChromeDividedGridSegments = {
    verticalLines: topology.verticalLines,
    trackCount: topology.trackCount,
    segmented: rows.some(rowSpansAllColumns),
  };
  return (
    <ChromeDividedGridSegmentContext.Provider value={segments}>
    <Frame
      {...props}
      className={`chrome-divided-grid ${className}`.trim()}
      style={{ ...gridStyle, ...props.style }}
    >
      <div className="chrome-divided-grid__fixed-rails" style={gridStyle} aria-hidden="true">
        {/* A vertical rail spans only the rows that ARE divided. A row that is one thing across
            every column — the box's name, a full-width verb — has no boundary for a rail to be,
            so ruling a line through it draws a division that is not there. The rails layer is
            suppressed entirely once any row spans, and each divided row carries its own segment
            instead; consecutive segments stack into the same continuous line. */}
        {rows.some(rowSpansAllColumns) ? null : topology.verticalLines.map((line) => (
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
    </ChromeDividedGridSegmentContext.Provider>
  );
}
