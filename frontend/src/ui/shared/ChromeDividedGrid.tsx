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

/**
 * Half of one inner rail — what a rail drawn ON a grid line takes off the cell on either side of
 * it. The rail straddles the line, so each neighbour pays half its width.
 */
export const CHROME_DIVIDED_GRID_RAIL_HALF = 'calc(var(--le-chrome-inner-rail-w, 7px) / 2)';

/**
 * One axis of a box whose compartments must all present the SAME opening.
 *
 * `tracks` are what the grid is laid with; `insets` are what each seat gives back so its content
 * centres in the opening rather than in the cell.
 */
export type ChromeDividedSeatAxis = {
  tracks: readonly string[];
  insets: readonly { start: string; end: string }[];
};

/**
 * The tracks and seat insets for `count` compartments of one declared `opening`.
 *
 * Equal tracks do NOT give equal compartments. A rail covers half its width from the cell on each
 * side, so a middle cell pays that twice and an outer one once, where the box's own frame is the
 * other edge and takes nothing: three equal tracks measured 34.5 / 31 / 34.5 against a 38 height
 * the first time this shipped, none of them square (ADR-0569). Every track therefore adds one
 * half-rail for each INTERNAL side it has, and the matching inset takes the same amount back off
 * the seat's content box — so the opening comes out exactly `opening`, on every axis, always.
 *
 * Both halves come from here on purpose. They were derived independently once — the tracks in TSX
 * and the insets in CSS — which is a rule stated twice and therefore a rule that can drift.
 */
export function chromeDividedSeatAxis(
  count: number,
  opening: string,
  railHalf: string = CHROME_DIVIDED_GRID_RAIL_HALF,
): ChromeDividedSeatAxis {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('A divided seat axis requires at least one compartment.');
  }
  const sides = Array.from({ length: count }, (_, index) => ({
    start: index > 0,
    end: index < count - 1,
  }));
  return {
    tracks: sides.map(({ start, end }) => {
      const internal = Number(start) + Number(end);
      return internal === 0 ? opening : `calc(${opening} + ${internal} * ${railHalf})`;
    }),
    insets: sides.map(({ start, end }) => ({
      start: start ? railHalf : '0px',
      end: end ? railHalf : '0px',
    })),
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

const INSTALLED_JUNCTION_SIDES = new Set<string>(['nes', 'nsw', 'esw', 'new', 'nesw']);

/**
 * The cap where a vertical grid line meets a ROW BOUNDARY, shaped by which side of that boundary
 * actually carries a rail.
 *
 * Both rows divided is the four-way crossing the node already describes. Beside a row that spans
 * every column there is no rail on that side, so the arm pointing into it comes off and what is
 * left is a TEE pointing into the row that does have one — the rail BEGINS or ENDS at this
 * boundary, and its end is a meeting with the horizontal rail exactly as much as a crossing is.
 * Dropping the node instead left the vertical segment starting out of nothing, which is the
 * uncapped rail this whole module exists to make unsayable.
 *
 * Null when neither side carries a rail: the horizontal rail simply runs through, with nothing to
 * cap. A shape the kit has no atom for is refused outright rather than shipped unpainted.
 */
function rowBoundaryCrossing(
  node: ChromeDividedGridNode,
  above: ReactNode,
  below: ReactNode,
): ChromeDividedGridNode | null {
  const railAbove = !rowSpansAllColumns(above);
  const railBelow = !rowSpansAllColumns(below);
  if (railAbove && railBelow) return node;
  const sides = [
    railAbove && node.sides.includes('n') ? 'n' : '',
    node.sides.includes('e') ? 'e' : '',
    railBelow && node.sides.includes('s') ? 's' : '',
    node.sides.includes('w') ? 'w' : '',
  ].join('');
  if (!sides.includes('n') && !sides.includes('s')) return null;
  if (!INSTALLED_JUNCTION_SIDES.has(sides)) {
    throw new Error(
      `A divided chrome grid has no installed "${sides}" junction atom: line ${node.line} `
      + 'ends against a row that spans every column. A scrollbar gutter cannot border a spanning '
      + 'row — give the row its own cells, or drop the gutter.',
    );
  }
  return { ...node, sides: sides as ChromeJunctionSides };
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
              {/* The cap on this boundary at every vertical line, shaped by which side of it
                  carries a rail: a four-way where both rows are divided, a tee pointing into the
                  divided one where its neighbour spans, and nothing at all where neither has a
                  rail to cap. */}
              {boundaryNodes(topology.rowNodes)
                .map((node) => node.inlineBoundary === 'internal'
                  ? rowBoundaryCrossing(node, rows[index - 1], row)
                  : node)
                .filter((node): node is ChromeDividedGridNode => node !== null)
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
