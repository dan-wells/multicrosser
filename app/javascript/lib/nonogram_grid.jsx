import React from 'react';
import {
  EMPTY, FILLED, CROSS, ROW, COL,
  cellKey, markKey, effectiveValue, filledCount, lineCount,
} from './nonogram_logic';

// Every five cells, so the eye can count along a long line without losing place.
const BLOCK = 5;

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
    totalCols: gutterCols + cols + counter,
    totalRows: gutterRows + rows + counter,
  };
}

function Cell({ x, y, value, size, left, top, classes }) {
  const inset = size * 0.22;
  return (
    <g className={classes} data-cell={cellKey(x, y)}>
      <rect className="nonogram-cell-bg" x={left} y={top} width={size} height={size} />
      {value === FILLED && (
        <rect
          className="nonogram-cell-fill"
          x={left + 1}
          y={top + 1}
          width={size - 2}
          height={size - 2}
        />
      )}
      {value === CROSS && (
        <g className="nonogram-cell-cross">
          <line x1={left + inset} y1={top + inset} x2={left + size - inset} y2={top + size - inset} />
          <line x1={left + size - inset} y1={top + inset} x2={left + inset} y2={top + size - inset} />
        </g>
      )}
    </g>
  );
}

function ClueNumber({
  axis, line, index, total, value, size, left, top, marked, highlighted, onClueClick,
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
      <rect className="nonogram-clue-hit" x={left} y={top} width={size} height={size} />
      <text
        x={left + size / 2}
        y={top + size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.55}
      >
        {value}
      </text>
      {marked && (
        <line
          className="nonogram-clue-strike"
          x1={left + size * 0.15}
          y1={top + size * 0.5}
          x2={left + size * 0.85}
          y2={top + size * 0.5}
        />
      )}
    </g>
  );
}

export default function NonogramGrid({
  data, board, derived, marks, settings, cursor, lastChange, pending,
  cellSize, onPointerDown, onPointerMove, onPointerUp, onClueClick, svgRef,
}) {
  const layout = gridLayout(data, settings);
  const { cols, rows, gutterCols, gutterRows } = layout;
  const size = cellSize;
  const width = layout.totalCols * size;
  const height = layout.totalRows * size;

  const originX = gutterCols * size;
  const originY = gutterRows * size;

  const cells = [];
  for (let x = 0; x < cols; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      const key = cellKey(x, y);
      const stored = pending && pending.keys.has(key)
        ? pending.value
        : effectiveValue(board, x, y, derived);
      const isDerived = stored === CROSS && ((board[x] && board[x][y]) || EMPTY) === EMPTY;
      const classes = [
        'nonogram-cell',
        isDerived ? 'is-derived' : '',
        settings.highlightLines && (x === cursor.x || y === cursor.y) ? 'is-lined' : '',
        cursor.x === x && cursor.y === y ? 'is-cursor' : '',
        lastChange === key ? 'is-last-change' : '',
      ].filter(Boolean).join(' ');

      cells.push(
        <Cell
          key={key}
          x={x}
          y={y}
          value={stored}
          size={size}
          left={originX + x * size}
          top={originY + y * size}
          classes={classes}
        />,
      );
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
          size={size}
          left={originX - (clue.length - index) * size}
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
          size={size}
          left={originX + line * size}
          top={originY - (clue.length - index) * size}
          marked={Boolean(marks.colMarks[markKey(line, index)])}
          highlighted={derived.highlightedCols.has(line)}
          onClueClick={onClueClick}
        />,
      );
    });
  });

  const rules = [];
  for (let x = 0; x <= cols; x += 1) {
    rules.push(
      <line
        key={`v${x}`}
        className={x % BLOCK === 0 || x === cols ? 'nonogram-rule is-block' : 'nonogram-rule'}
        x1={originX + x * size}
        y1={x % BLOCK === 0 || x === cols ? 0 : originY}
        x2={originX + x * size}
        y2={originY + rows * size}
      />,
    );
  }
  for (let y = 0; y <= rows; y += 1) {
    rules.push(
      <line
        key={`h${y}`}
        className={y % BLOCK === 0 || y === rows ? 'nonogram-rule is-block' : 'nonogram-rule'}
        x1={y % BLOCK === 0 || y === rows ? 0 : originX}
        y1={originY + y * size}
        x2={originX + cols * size}
        y2={originY + y * size}
      />,
    );
  }

  // Running count of filled cells per line, which is the quickest check on a
  // big grid that a line holds as many squares as its clue asks for.
  const counters = [];
  if (settings.showCounter) {
    [ROW, COL].forEach((axis) => {
      const clueList = axis === ROW ? data.rowClues : data.colClues;
      for (let line = 0; line < lineCount(axis, data.dimensions); line += 1) {
        const filled = filledCount(board, axis, line, data.dimensions);
        const wanted = clueList[line].reduce((sum, run) => sum + run, 0);
        const left = axis === ROW ? originX + cols * size : originX + line * size;
        const top = axis === ROW ? originY + line * size : originY + rows * size;
        counters.push(
          <text
            key={`count-${axis}-${line}`}
            className={`nonogram-counter${filled === wanted ? ' is-complete' : ''}`}
            x={left + size / 2}
            y={top + size / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size * 0.5}
          >
            {filled}
          </text>,
        );
      }
    });
  }

  return (
    <svg
      ref={svgRef}
      className="nonogram-grid"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="grid"
      aria-label={data.name}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(event) => event.preventDefault()}
    >
      {cells}
      {rules}
      {clues}
      {counters}
    </svg>
  );
}
