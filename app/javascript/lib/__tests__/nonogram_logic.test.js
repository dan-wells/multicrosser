import { describe, it, expect } from 'vitest';
import {
  EMPTY, FILLED, CROSS, ROW, COL,
  runs, runsMatch, derive, effectiveValue, filledCount,
  clickValue, dragCells,
  serializeSolution, isSolved, invertStroke, UndoStack, markKey,
} from '../nonogram_logic';

// The 5x5 puzzle at /nonogram-5/1, whose solution is known and whose hash is
// the one the upstream site serves.
const PUZZLE_5 = {
  task: '1.1/1/1.1/2.2/4/1.3/2/1/2/4',
  dimensions: { cols: 5, rows: 5 },
  colClues: [[1, 1], [1], [1, 1], [2, 2], [4]],
  rowClues: [[1, 3], [2], [1], [2], [4]],
  hashedSolution: 'a0c8982877013b2ad405a4a751bf4ec2',
};

// board[x][y]; the solution above serialises row-major to
// 'ynyyynnnyynnnnynnnyyyyyyn'.
const SOLVED_5 = (() => {
  const serialized = 'ynyyynnnyynnnnynnnyyyyyyn';
  const board = Array.from({ length: 5 }, () => Array(5).fill(EMPTY));
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      if (serialized[y * 5 + x] === 'y') board[x][y] = FILLED;
    }
  }
  return board;
})();

const emptyBoard = (cols, rows) =>
  Array.from({ length: cols }, () => Array(rows).fill(EMPTY));

const noMarks = { rowMarks: {}, colMarks: {} };

describe('runs', () => {
  it('counts consecutive filled cells and ignores crosses and blanks', () => {
    expect(runs([FILLED, FILLED, EMPTY, FILLED, CROSS, FILLED])).toEqual([2, 1, 1]);
  });

  it('is empty for a line with nothing filled', () => {
    expect(runs([EMPTY, CROSS, EMPTY])).toEqual([]);
  });

  it('closes a run that reaches the end of the line', () => {
    expect(runs([EMPTY, FILLED, FILLED])).toEqual([2]);
  });

  it('matches a clue only when the runs are identical and in order', () => {
    expect(runsMatch([FILLED, EMPTY, FILLED, FILLED], [1, 2])).toBe(true);
    expect(runsMatch([FILLED, FILLED, EMPTY, FILLED], [1, 2])).toBe(false);
    expect(runsMatch([FILLED, EMPTY, FILLED], [1])).toBe(false);
  });
});

describe('derive -- auto-cross', () => {
  const clues = { rowClues: [[2], [1]], colClues: [[1], [1], []] };
  const dimensions = { cols: 3, rows: 2 };

  it('crosses a row only once every one of its clue numbers is ticked', () => {
    const clue2 = { rowClues: [[1, 1]], colClues: [[1], [1], []] };
    const dims = { cols: 3, rows: 1 };
    const partial = derive(emptyBoard(3, 1), dims, clue2,
      { rowMarks: { [markKey(0, 0)]: '1' }, colMarks: {} }, true);
    expect(partial.crossedRows.has(0)).toBe(false);

    const full = derive(emptyBoard(3, 1), dims, clue2,
      { rowMarks: { [markKey(0, 0)]: '1', [markKey(0, 1)]: '1' }, colMarks: {} }, true);
    expect(full.crossedRows.has(0)).toBe(true);
  });

  it('never crosses from filled cells alone', () => {
    const board = emptyBoard(3, 2);
    board[0][0] = FILLED;
    board[1][0] = FILLED;
    const result = derive(board, dimensions, clues, noMarks, true);
    expect(result.crossedRows.size).toBe(0);
    expect(result.crossedCols.size).toBe(0);
  });

  it('leaves a clueless line alone rather than crossing it for free', () => {
    const result = derive(emptyBoard(3, 2), dimensions, clues, noMarks, true);
    expect(result.crossedCols.has(2)).toBe(false);
  });

  it('derives nothing at all when the toggle is off', () => {
    const marks = { rowMarks: { [markKey(0, 0)]: '1' }, colMarks: {} };
    const result = derive(emptyBoard(3, 2), dimensions, clues, marks, false);
    expect(result.crossedRows.size).toBe(0);
    expect(result.highlightedRows.size).toBe(0);
  });

  it('shows a crossed cell as crossed without anything being stored', () => {
    const board = emptyBoard(3, 2);
    const marks = { rowMarks: { [markKey(0, 0)]: '1' }, colMarks: {} };
    const result = derive(board, dimensions, clues, marks, true);

    expect(effectiveValue(board, 1, 0, result)).toBe(CROSS);
    expect(board[1][0]).toBe(EMPTY);
    expect(effectiveValue(board, 1, 1, result)).toBe(EMPTY);
  });
});

describe('derive -- auto-highlight', () => {
  const dimensions = { cols: 2, rows: 1 };
  const clues = { rowClues: [[1]], colClues: [[1], []] };

  it('highlights a full line whose runs match its clue', () => {
    const board = emptyBoard(2, 1);
    board[0][0] = FILLED;
    board[1][0] = CROSS;
    const result = derive(board, dimensions, clues, noMarks, true);
    expect(result.highlightedRows.has(0)).toBe(true);
  });

  it('leaves a full line whose runs do not match unhighlighted', () => {
    const board = emptyBoard(2, 1);
    board[0][0] = FILLED;
    board[1][0] = FILLED;
    const result = derive(board, dimensions, clues, noMarks, true);
    expect(result.highlightedRows.has(0)).toBe(false);
  });

  it('does not highlight a line that still has an empty cell', () => {
    const board = emptyBoard(2, 1);
    board[0][0] = FILLED;
    const result = derive(board, dimensions, clues, noMarks, true);
    expect(result.highlightedRows.has(0)).toBe(false);
  });

  it('counts an auto-crossed cell as filling the line', () => {
    // Column 0 is marked out, so cell (0,0) reads as a cross and completes the
    // row, whose remaining clue of [1] is satisfied by the filled cell (1,0).
    const twoWide = { rowClues: [[1]], colClues: [[1], [1]] };
    const board = emptyBoard(2, 1);
    board[1][0] = FILLED;
    const marks = { rowMarks: {}, colMarks: { [markKey(0, 0)]: '1' } };
    const result = derive(board, dimensions, twoWide, marks, true);

    expect(result.crossedCols.has(0)).toBe(true);
    expect(result.highlightedRows.has(0)).toBe(true);
  });

  it('highlights every line of a solved grid once the blanks are crossed off', () => {
    const clues = { rowClues: PUZZLE_5.rowClues, colClues: PUZZLE_5.colClues };
    const crossed = SOLVED_5.map((column) =>
      column.map((value) => (value === EMPTY ? CROSS : value)));

    const result = derive(crossed, PUZZLE_5.dimensions, clues, noMarks, true);
    expect(result.highlightedRows.size).toBe(5);
    expect(result.highlightedCols.size).toBe(5);
  });

  // Solving without ever crossing a blank off is normal play, and leaves every
  // line with empty cells, so nothing lights up even though the grid is right.
  it('highlights nothing on a solved grid whose blanks are still empty', () => {
    const clues = { rowClues: PUZZLE_5.rowClues, colClues: PUZZLE_5.colClues };

    const result = derive(SOLVED_5, PUZZLE_5.dimensions, clues, noMarks, true);
    expect(result.highlightedRows.size).toBe(0);
    expect(isSolved(PUZZLE_5, SOLVED_5)).toBe(true);
  });
});

describe('filledCount', () => {
  it('counts filled cells along a line, ignoring crosses', () => {
    const board = emptyBoard(3, 2);
    board[0][0] = FILLED;
    board[1][0] = CROSS;
    board[2][0] = FILLED;
    expect(filledCount(board, ROW, 0, { cols: 3, rows: 2 })).toBe(2);
    expect(filledCount(board, COL, 0, { cols: 3, rows: 2 })).toBe(1);
  });
});

describe('clickValue', () => {
  it('cycles empty -> filled -> cross -> empty in rotate mode', () => {
    expect(clickValue('rotate', EMPTY)).toBe(FILLED);
    expect(clickValue('rotate', FILLED)).toBe(CROSS);
    expect(clickValue('rotate', CROSS)).toBe(EMPTY);
  });

  it('toggles a single value in the other modes', () => {
    expect(clickValue('black', EMPTY)).toBe(FILLED);
    expect(clickValue('black', FILLED)).toBe(EMPTY);
    expect(clickValue('cross', CROSS)).toBe(EMPTY);
    expect(clickValue('cross', FILLED)).toBe(CROSS);
    expect(clickValue('blank', FILLED)).toBe(EMPTY);
  });
});

describe('dragCells', () => {
  it('covers the cells between the two points along a row', () => {
    expect(dragCells({ x: 1, y: 2 }, { x: 3, y: 2 }))
      .toEqual([{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }]);
  });

  it('runs backwards when the drag goes the other way', () => {
    expect(dragCells({ x: 3, y: 2 }, { x: 1, y: 2 }))
      .toEqual([{ x: 3, y: 2 }, { x: 2, y: 2 }, { x: 1, y: 2 }]);
  });

  it('sticks to the axis the drag travelled furthest along', () => {
    const cells = dragCells({ x: 1, y: 1 }, { x: 2, y: 5 });
    expect(cells).toHaveLength(5);
    expect(cells.every((cell) => cell.x === 1)).toBe(true);
  });

  it('is a single cell when it has not moved', () => {
    expect(dragCells({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual([{ x: 4, y: 4 }]);
  });
});

describe('completion', () => {
  it('serialises the board row-major with crosses counting as empty', () => {
    const board = emptyBoard(2, 2);
    board[0][0] = FILLED;
    board[1][1] = CROSS;
    expect(serializeSolution(board, { cols: 2, rows: 2 })).toBe('ynnn');
  });

  it('serialises the known 5x5 solution to the published string', () => {
    expect(serializeSolution(SOLVED_5, PUZZLE_5.dimensions)).toBe('ynyyynnnyynnnnynnnyyyyyyn');
  });

  it('recognises the solved board by its published hash', () => {
    expect(isSolved(PUZZLE_5, SOLVED_5)).toBe(true);
  });

  it('does not recognise an unsolved or nearly-solved board', () => {
    expect(isSolved(PUZZLE_5, emptyBoard(5, 5))).toBe(false);
    const nearly = SOLVED_5.map((column) => column.slice());
    nearly[0][0] = EMPTY;
    expect(isSolved(PUZZLE_5, nearly)).toBe(false);
  });

  it('ignores crosses, which are working notes rather than answers', () => {
    const withCrosses = SOLVED_5.map((column) =>
      column.map((value) => (value === EMPTY ? CROSS : value)));
    expect(isSolved(PUZZLE_5, withCrosses)).toBe(true);
  });
});

describe('invertStroke', () => {
  it('restores each cell to what it held, one batch per distinct value', () => {
    const stroke = {
      space: 'board',
      value: FILLED,
      cells: [
        { x: 0, y: 0, previousValue: EMPTY },
        { x: 1, y: 0, previousValue: CROSS },
        { x: 2, y: 0, previousValue: EMPTY },
      ],
    };

    const batches = invertStroke(stroke);

    expect(batches).toHaveLength(2);
    const empties = batches.find((b) => b.value === EMPTY);
    expect(empties.cells).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }]);
    const crosses = batches.find((b) => b.value === CROSS);
    expect(crosses.cells).toEqual([{ x: 1, y: 0 }]);
    expect(batches.every((b) => b.space === 'board')).toBe(true);
  });

  it('treats a missing previous value as empty', () => {
    const batches = invertStroke({ space: 'board', value: FILLED, cells: [{ x: 0, y: 0 }] });
    expect(batches).toEqual([{ space: 'board', value: EMPTY, cells: [{ x: 0, y: 0 }] }]);
  });
});

describe('UndoStack', () => {
  const stroke = (id) => ({ space: 'board', value: FILLED, cells: [{ x: id, y: 0 }] });

  it('returns strokes most recent first and hands them back on redo', () => {
    const stack = new UndoStack();
    stack.push(stroke(1));
    stack.push(stroke(2));

    expect(stack.undo().cells[0].x).toBe(2);
    expect(stack.undo().cells[0].x).toBe(1);
    expect(stack.undo()).toBeNull();
    expect(stack.redo().cells[0].x).toBe(1);
    expect(stack.canUndo).toBe(true);
  });

  it('drops the redo trail once a new stroke is made', () => {
    const stack = new UndoStack();
    stack.push(stroke(1));
    stack.undo();
    stack.push(stroke(2));

    expect(stack.canRedo).toBe(false);
  });

  it('ignores an empty stroke', () => {
    const stack = new UndoStack();
    stack.push({ space: 'board', value: FILLED, cells: [] });
    expect(stack.canUndo).toBe(false);
  });

  it('discards the oldest strokes past its limit', () => {
    const stack = new UndoStack(2);
    stack.push(stroke(1));
    stack.push(stroke(2));
    stack.push(stroke(3));

    expect(stack.undo().cells[0].x).toBe(3);
    expect(stack.undo().cells[0].x).toBe(2);
    expect(stack.undo()).toBeNull();
  });
});
