import React from 'react';
import {
  EMPTY, FILLED, CROSS, ROW, COL,
  cellKey, markKey, effectiveValue, filledCount, lineCount, strokeRun,
} from './nonogram_logic';

// Every five cells, so the eye can count along a long line without losing place.
const BLOCK = 5;

const RULE = 1;
const BLOCK_RULE = 3;

export const MIN_CELL = 12;
export const MAX_CELL = 26;

// Cell outlines and cross weights should keep the same ratio when shrinking
// grids to fit in smaller viewports.
const strokeFor = (size, ratio) => Math.max(1.25, size * ratio);
const OUTLINE_RATIO = 2.5 / MAX_CELL;
const CROSS_RATIO = 2.75 / MAX_CELL;

const isBlockBoundary = (boundary, count) => boundary % BLOCK === 0 || boundary === count;

// How far the rule along a boundary reaches into the cell on either side.
const edgeReach = (boundary, count) =>
  (isBlockBoundary(boundary, count) ? BLOCK_RULE : RULE) / 2;

const CLUE_SCALE = 0.75;

const NO_CHANGE = new Set();

const clueLengths = (clues) => clues.reduce((longest, clue) => Math.max(longest, clue.length), 1);

// The clue strips are measured in cells, so the whole drawing scales with one
// number and the strips always line up with the grid they label.
export function gridLayout(data, settings) {
  const { cols, rows } = data.dimensions;
  const gutterCols = clueLengths(data.rowClues);
  const gutterRows = clueLengths(data.colClues);
  const counter = settings.showCounter ? 1 : 0;
  return {
    cols,
    rows,
    gutterCols,
    gutterRows,
    counter,
    clueScale: CLUE_SCALE,
    gutterWidth: gutterCols * CLUE_SCALE,
    gutterHeight: gutterRows * CLUE_SCALE,
    totalCols: gutterCols * CLUE_SCALE + cols + counter,
    totalRows: gutterRows * CLUE_SCALE + rows + counter,
  };
}

// The white margin left between the rules and whatever the cell holds, wide
// enough for the cursor outline to sit in it.
const cellGap = (size) => Math.max(2, Math.round(size * 0.12)) - RULE / 2;

// What is left of a cell once the rules around it have taken their share. Every
// mark a cell carries is placed in this box rather than against the cell's
// nominal bounds, so a square beside a block rule is not pushed off centre.
const innerBox = (size, left, top, reach) => ({
  x: left + reach.left,
  y: top + reach.top,
  width: size - reach.left - reach.right,
  height: size - reach.top - reach.bottom,
});

function Cell({ x, y, value, size, left, top, reach, classes }) {
  const box = innerBox(size, left, top, reach);
  const gap = cellGap(size);
  const arm = Math.min(box.width, box.height) * 0.325;
  const crossStroke = strokeFor(size, CROSS_RATIO);
  return (
    <g className={classes} data-cell={cellKey(x, y)}>
      <rect className="nonogram-cell-bg" x={left} y={top} width={size} height={size} />
      {value === FILLED && (
        <rect
          className="nonogram-cell-fill"
          x={box.x + gap}
          y={box.y + gap}
          width={box.width - gap * 2}
          height={box.height - gap * 2}
        />
      )}
      {value === CROSS && (
        <g className="nonogram-cell-cross" strokeWidth={crossStroke}>
          <line x1={box.x + arm} y1={box.y + arm} x2={box.x + box.width - arm} y2={box.y + box.height - arm} />
          <line x1={box.x + box.width - arm} y1={box.y + arm} x2={box.x + arm} y2={box.y + box.height - arm} />
        </g>
      )}
    </g>
  );
}

function ClueNumber({
  axis, line, index, total, value, width, height, left, top, marked, highlighted, onClueClick,
}) {
  const classes = [
    'nonogram-clue',
    marked ? 'is-marked' : '',
    highlighted ? 'is-highlighted' : '',
  ].filter(Boolean).join(' ');

  return (
    <g
      className={classes}
      data-clue={`${axis}-${markKey(line, index)}`}
      onClick={() => onClueClick(axis, line, index)}
      role="button"
      tabIndex={-1}
      aria-label={`${axis} ${line + 1} clue ${index + 1} of ${total}, ${value}`}
    >
      <rect className="nonogram-clue-hit" x={left} y={top} width={width} height={height} />
      <text
        x={left + width / 2}
        y={top + height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.min(width, height) * 0.82}
      >
        {value}
      </text>
    </g>
  );
}

export default function NonogramGrid({
  data, board, derived, marks, settings, cursor, showCursor, lastChange, pending,
  cellSize, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClueClick, svgRef,
}) {
  const layout = gridLayout(data, settings);
  const { cols, rows, gutterCols, gutterRows } = layout;
  const size = cellSize;
  const clueSize = size * CLUE_SCALE;
  const width = layout.totalCols * size;
  const height = layout.totalRows * size;

  const originX = gutterCols * clueSize;
  const originY = gutterRows * clueSize;
  const endX = originX + cols * size;
  const endY = originY + rows * size;

  const changed = lastChange || NO_CHANGE;

  const cells = [];
  const outlines = [];
  for (let x = 0; x < cols; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      const key = cellKey(x, y);
      const stored = pending && pending.keys.has(key)
        ? pending.value
        : effectiveValue(board, x, y, derived);
      const isDerived = stored === CROSS && ((board[x] && board[x][y]) || EMPTY) === EMPTY;
      const left = originX + x * size;
      const top = originY + y * size;
      const reach = {
        left: edgeReach(x, cols),
        right: edgeReach(x + 1, cols),
        top: edgeReach(y, rows),
        bottom: edgeReach(y + 1, rows),
      };
      const classes = [
        'nonogram-cell',
        isDerived ? 'is-derived' : '',
        settings.highlightLines && (x === cursor.x || y === cursor.y) ? 'is-lined' : '',
        showCursor && cursor.x === x && cursor.y === y ? 'is-cursor' : '',
      ].filter(Boolean).join(' ');

      cells.push(
        <Cell
          key={key}
          x={x}
          y={y}
          value={stored}
          size={size}
          left={left}
          top={top}
          reach={reach}
          classes={classes}
        />,
      );

      if (changed.has(key)) {
        const box = innerBox(size, left, top, reach);
        const outline = strokeFor(size, OUTLINE_RATIO);
        outlines.push(
          <rect
            key={key}
            className="nonogram-cell-outline"
            data-cell={key}
            x={box.x + outline / 2}
            y={box.y + outline / 2}
            width={box.width - outline}
            height={box.height - outline}
            strokeWidth={outline}
          />,
        );
      }
    }
  }

  // Row clues sit flush against the grid, so the last number of each row is
  // always in the column next to it however long the clue is.
  const clues = [];
  data.rowClues.forEach((clue, line) => {
    clue.forEach((value, index) => {
      clues.push(
        <ClueNumber
          key={`row-${line}-${index}`}
          axis={ROW}
          line={line}
          index={index}
          total={clue.length}
          value={value}
          width={clueSize}
          height={size}
          left={originX - (clue.length - index) * clueSize}
          top={originY + line * size}
          marked={Boolean(marks.rowMarks[markKey(line, index)])}
          highlighted={derived.highlightedRows.has(line)}
          onClueClick={onClueClick}
        />,
      );
    });
  });
  data.colClues.forEach((clue, line) => {
    clue.forEach((value, index) => {
      clues.push(
        <ClueNumber
          key={`col-${line}-${index}`}
          axis={COL}
          line={line}
          index={index}
          total={clue.length}
          value={value}
          width={size}
          height={clueSize}
          left={originX + line * size}
          top={originY - (clue.length - index) * clueSize}
          marked={Boolean(marks.colMarks[markKey(line, index)])}
          highlighted={derived.highlightedCols.has(line)}
          onClueClick={onClueClick}
        />,
      );
    });
  });

  const rules = [];
  for (let x = 0; x <= cols; x += 1) {
    const block = isBlockBoundary(x, cols);
    rules.push(
      <line
        key={`v${x}`}
        className={block ? 'nonogram-rule is-block' : 'nonogram-rule'}
        strokeWidth={block ? BLOCK_RULE : RULE}
        x1={originX + x * size}
        y1={0}
        x2={originX + x * size}
        y2={endY}
      />,
    );
  }
  for (let y = 0; y <= rows; y += 1) {
    const block = isBlockBoundary(y, rows);
    rules.push(
      <line
        key={`h${y}`}
        className={block ? 'nonogram-rule is-block' : 'nonogram-rule'}
        strokeWidth={block ? BLOCK_RULE : RULE}
        x1={0}
        y1={originY + y * size}
        x2={endX}
        y2={originY + y * size}
      />,
    );
  }
  rules.push(
    <rect
      key="border"
      className="nonogram-border"
      strokeWidth={BLOCK_RULE}
      x={0}
      y={0}
      width={endX}
      height={endY}
    />,
  );

  // Running count of filled cells per line, along with the length of the
  // current run being drawn.
  const counters = [];
  if (settings.showCounter) {
    const stroke = strokeRun(board, pending, data.dimensions);
    [ROW, COL].forEach((axis) => {
      const clueList = axis === ROW ? data.rowClues : data.colClues;
      for (let line = 0; line < lineCount(axis, data.dimensions); line += 1) {
        const filled = filledCount(board, axis, line, data.dimensions);
        const wanted = clueList[line].reduce((sum, run) => sum + run, 0);
        const left = axis === ROW ? endX : originX + line * size;
        const top = axis === ROW ? originY + line * size : endY;
        const drawn = stroke && stroke.axis === axis && stroke.line === line
          ? stroke.span : null;
        counters.push(
          <text
            key={`count-${axis}-${line}`}
            className={`nonogram-counter${filled === wanted ? ' is-complete' : ''}`}
            x={left + size / 2}
            y={top + size * (drawn === null ? 0.5 : 0.3)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size * (drawn === null ? 0.5 : 0.42)}
          >
            {filled}
          </text>,
        );
        if (drawn !== null) {
          counters.push(
            <text
              key={`drawn-${axis}-${line}`}
              className="nonogram-counter is-drawing"
              x={left + size / 2}
              y={top + size * 0.72}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={size * 0.42}
            >
              {drawn}
            </text>,
          );
        }
      }
    });
  }

  return (
    <svg
      ref={svgRef}
      className={settings.touchDrag ? 'nonogram-grid is-touch-drag' : 'nonogram-grid'}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="grid"
      aria-label={data.name}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(event) => event.preventDefault()}
    >
      {cells}
      {outlines}
      {rules}
      {clues}
      {counters}
    </svg>
  );
}
