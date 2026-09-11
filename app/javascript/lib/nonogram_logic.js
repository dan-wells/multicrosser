import md5 from './md5';

export const EMPTY = '';
export const FILLED = '1';
export const CROSS = 'x';

export const ROW = 'row';
export const COL = 'col';

// Cursor behaviours for a plain click. `rotate` cycles, the others are toggles
// between one value and empty.
export const CURSOR_MODES = ['rotate', 'black', 'cross', 'blank'];

export const cellKey = (x, y) => `${x}-${y}`;

// Marks are addressed by line and by the clue's index within that line, and
// travel over the same `x-y` payload as board cells.
export const markKey = (line, clueIndex) => `${line}-${clueIndex}`;

export const lineLength = (axis, dimensions) =>
  (axis === ROW ? dimensions.cols : dimensions.rows);

export const lineCount = (axis, dimensions) =>
  (axis === ROW ? dimensions.rows : dimensions.cols);

// The cell at position `offset` along a line. Rows run across x, columns down y.
export const lineCell = (axis, line, offset) =>
  (axis === ROW ? { x: offset, y: line } : { x: line, y: offset });

export function lineValues(board, axis, line, dimensions) {
  const length = lineLength(axis, dimensions);
  return Array.from({ length }, (_, offset) => {
    const { x, y } = lineCell(axis, line, offset);
    return (board[x] && board[x][y]) || EMPTY;
  });
}

// Lengths of the consecutive stretches of filled cells, which is exactly the
// form a clue takes.
export function runs(values) {
  const result = [];
  let current = 0;
  values.forEach((value) => {
    if (value === FILLED) {
      current += 1;
    } else if (current > 0) {
      result.push(current);
      current = 0;
    }
  });
  if (current > 0) result.push(current);
  return result;
}

export function runsMatch(values, clue) {
  const found = runs(values);
  return found.length === clue.length && found.every((run, i) => run === clue[i]);
}

// A line is auto-crossed once the player has ticked off every one of its clue
// numbers by hand; lines with no clue numbers are excluded.
function markedOutLines(clues, marks) {
  const lines = new Set();
  clues.forEach((clue, line) => {
    if (clue.length === 0) return;
    if (clue.every((_, i) => marks[markKey(line, i)])) lines.add(line);
  });
  return lines;
}

// The value a cell displays, which is a cross when either of the lines through
// it has been marked out, even though nothing is stored for it.
export function effectiveValue(board, x, y, derived) {
  const stored = (board[x] && board[x][y]) || EMPTY;
  if (stored !== EMPTY) return stored;
  if (derived.crossedRows.has(y) || derived.crossedCols.has(x)) return CROSS;
  return EMPTY;
}

function effectiveLineValues(board, axis, line, dimensions, derived) {
  const length = lineLength(axis, dimensions);
  return Array.from({ length }, (_, offset) => {
    const { x, y } = lineCell(axis, line, offset);
    return effectiveValue(board, x, y, derived);
  });
}

// A line's clue numbers light up once the line has no empty cells left and its
// filled runs are exactly its clue. A full line that does not match stays dark,
// which is a quiet signal that something in it is wrong.
function highlightedLines(board, clues, axis, dimensions, derived) {
  const lines = new Set();
  clues.forEach((clue, line) => {
    const values = effectiveLineValues(board, axis, line, dimensions, derived);
    if (values.some((value) => value === EMPTY)) return;
    if (runsMatch(values, clue)) lines.add(line);
  });
  return lines;
}

// Auto-crosses read manual marks only and auto-highlights read the board plus
// the auto-crosses, so the two resolve in one pass with no iteration, and
// neither is ever stored -- both clients derive the same thing from the same
// shared state.
export function derive(board, dimensions, clues, marks, enabled) {
  const crossedRows = enabled ? markedOutLines(clues.rowClues, marks.rowMarks) : new Set();
  const crossedCols = enabled ? markedOutLines(clues.colClues, marks.colMarks) : new Set();
  const derived = { crossedRows, crossedCols };
  return {
    ...derived,
    highlightedRows: enabled
      ? highlightedLines(board, clues.rowClues, ROW, dimensions, derived) : new Set(),
    highlightedCols: enabled
      ? highlightedLines(board, clues.colClues, COL, dimensions, derived) : new Set(),
  };
}

// Count of filled cells in a line, for the cell counter.
export function filledCount(board, axis, line, dimensions) {
  return lineValues(board, axis, line, dimensions)
    .filter((value) => value === FILLED).length;
}

// --- interaction ---

// What a click puts in a cell, given the current cursor behaviour. A drag runs
// this once against the cell it started on and paints the answer across the
// whole stroke, so a one-cell drag and a click are the same thing.
export function clickValue(mode, current) {
  if (mode === 'black') return current === FILLED ? EMPTY : FILLED;
  if (mode === 'cross') return current === CROSS ? EMPTY : CROSS;
  if (mode === 'blank') return EMPTY;
  if (current === EMPTY) return FILLED;
  if (current === FILLED) return CROSS;
  return EMPTY;
}

// A drag is confined to the row or column it set off along, so a wandering
// pointer cannot smear across the grid.
export function dragCells(start, current) {
  const acrossRow = Math.abs(current.x - start.x) >= Math.abs(current.y - start.y);
  const from = acrossRow ? start.x : start.y;
  const to = acrossRow ? current.x : current.y;
  const step = to >= from ? 1 : -1;
  const cells = [];
  for (let i = from; i !== to + step; i += step) {
    cells.push(acrossRow ? { x: i, y: start.y } : { x: start.x, y: i });
  }
  return cells;
}

// --- completion ---

// Row-major, 'y' for filled and 'n' for anything else -- crosses never count.
export function serializeSolution(board, dimensions) {
  let result = '';
  for (let y = 0; y < dimensions.rows; y += 1) {
    for (let x = 0; x < dimensions.cols; x += 1) {
      result += (board[x] && board[x][y]) === FILLED ? 'y' : 'n';
    }
  }
  return result;
}

export function isSolved(data, board) {
  if (!data.hashedSolution) return false;
  return md5(data.task + serializeSolution(board, data.dimensions)) === data.hashedSolution;
}

// --- undo ---

// A stroke is undone by putting every cell back, which takes one batch per
// distinct previous value. The caller supplies the current value as each
// cell's `previousValue`, so an undo is checked against the server exactly
// like any other move and can be rejected the same way.
export function invertStroke(stroke) {
  const byValue = new Map();
  stroke.cells.forEach((cell) => {
    const value = cell.previousValue || EMPTY;
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value).push({ x: cell.x, y: cell.y });
  });
  return Array.from(byValue, ([value, cells]) => ({ space: stroke.space, value, cells }));
}

const UNDO_LIMIT = 200;

// Local to each player and holding only their own strokes, so undo never
// reaches across and reverts a co-solver's work.
export class UndoStack {
  constructor(limit = UNDO_LIMIT) {
    this.limit = limit;
    this.done = [];
    this.undone = [];
  }

  push(stroke) {
    if (stroke.cells.length === 0) return;
    this.done.push(stroke);
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
  }

  undo() {
    const stroke = this.done.pop();
    if (!stroke) return null;
    this.undone.push(stroke);
    return stroke;
  }

  redo() {
    const stroke = this.undone.pop();
    if (!stroke) return null;
    this.done.push(stroke);
    return stroke;
  }

  get canUndo() { return this.done.length > 0; }

  get canRedo() { return this.undone.length > 0; }
}
