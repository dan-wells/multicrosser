import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import NonogramGrid, { gridLayout } from '../lib/nonogram_grid';
import { FILLED, CROSS, EMPTY, markKey } from '../lib/nonogram_logic';

const DATA = {
  name: '5x5 Nonogram No 1',
  task: '1.1/1/1.1/2.2/4/1.3/2/1/2/4',
  dimensions: { cols: 5, rows: 5 },
  colClues: [[1, 1], [1], [1, 1], [2, 2], [4]],
  rowClues: [[1, 3], [2], [1], [2], [4]],
  hashedSolution: 'a0c8982877013b2ad405a4a751bf4ec2',
};

const SETTINGS = {
  cursorMode: 'rotate', showCounter: false, highlightLines: true, autoMark: true,
};

const emptyBoard = () => Array.from({ length: 5 }, () => Array(5).fill(EMPTY));

const noDerived = {
  crossedRows: new Set(),
  crossedCols: new Set(),
  highlightedRows: new Set(),
  highlightedCols: new Set(),
};

const render = (overrides = {}) => renderToStaticMarkup(
  React.createElement(NonogramGrid, {
    data: DATA,
    board: emptyBoard(),
    derived: noDerived,
    marks: { rowMarks: {}, colMarks: {} },
    settings: SETTINGS,
    cursor: { x: 0, y: 0 },
    lastChange: null,
    pending: null,
    cellSize: 20,
    svgRef: null,
    onPointerDown: () => {},
    onPointerMove: () => {},
    onPointerUp: () => {},
    onClueClick: () => {},
    ...overrides,
  }),
);

describe('gridLayout', () => {
  it('sizes each gutter from the longest clue on that axis', () => {
    const layout = gridLayout(DATA, SETTINGS);
    expect(layout.gutterCols).toBe(2);
    expect(layout.gutterRows).toBe(2);
    expect(layout.totalCols).toBe(7);
    expect(layout.totalRows).toBe(7);
  });

  it('makes room for the counter strip only when it is switched on', () => {
    expect(gridLayout(DATA, { ...SETTINGS, showCounter: true }).totalCols).toBe(8);
  });

  it('keeps a one-cell gutter for a puzzle whose clues are all single numbers', () => {
    const plain = { ...DATA, rowClues: [[1]], colClues: [[1]] };
    expect(gridLayout(plain, SETTINGS).gutterCols).toBe(1);
  });
});

describe('NonogramGrid', () => {
  it('renders a cell group for every square in the grid', () => {
    const markup = render();
    expect(markup.match(/data-cell="/g)).toHaveLength(25);
  });

  it('renders a clue number for every entry in every clue', () => {
    const markup = render();
    const expected = DATA.rowClues.concat(DATA.colClues)
      .reduce((total, clue) => total + clue.length, 0);
    expect(markup.match(/data-clue="/g)).toHaveLength(expected);
  });

  it('draws a fill for a filled cell and a cross for a crossed one', () => {
    const board = emptyBoard();
    board[0][0] = FILLED;
    board[1][0] = CROSS;
    const markup = render({ board });

    expect(markup).toContain('nonogram-cell-fill');
    expect(markup).toContain('nonogram-cell-cross');
  });

  it('marks a derived cross apart from one the player drew', () => {
    const board = emptyBoard();
    board[0][0] = CROSS;
    const derived = { ...noDerived, crossedRows: new Set([1]) };
    const markup = render({ board, derived });

    // Row 1 is crossed out wholesale, so its cells carry the derived class
    // while the cross drawn into (0,0) does not.
    expect(markup).toContain('nonogram-cell is-derived');
    expect(markup.match(/is-derived/g)).toHaveLength(5);
  });

  it('strikes through a clue number the player has ticked', () => {
    const marks = { rowMarks: { [markKey(0, 0)]: '1' }, colMarks: {} };
    const markup = render({ marks });

    expect(markup).toContain('is-marked');
    expect(markup).toContain('nonogram-clue-strike');
  });

  it('marks the clue numbers of an auto-highlighted line', () => {
    const derived = { ...noDerived, highlightedRows: new Set([0]) };
    const markup = render({ derived });

    // Row 0's clue is [1, 3], so both of its numbers light up.
    expect(markup.match(/is-highlighted/g)).toHaveLength(2);
  });

  it('shows the stroke in progress without it having been stored', () => {
    const pending = { value: FILLED, keys: new Set(['0-0', '1-0']) };
    const markup = render({ pending });

    expect(markup.match(/nonogram-cell-fill/g)).toHaveLength(2);
  });

  it('highlights the cursor row and column only when that is switched on', () => {
    const lined = render({ cursor: { x: 2, y: 3 } });
    // Nine cells in the cross through (2,3), the cursor cell counted once.
    expect(lined.match(/is-lined/g)).toHaveLength(9);

    const plain = render({
      cursor: { x: 2, y: 3 },
      settings: { ...SETTINGS, highlightLines: false },
    });
    expect(plain).not.toContain('is-lined');
  });

  it('marks the last changed cell', () => {
    expect(render({ lastChange: '2-2' })).toContain('is-last-change');
  });

  it('shows a filled-cell count per line when the counter is on', () => {
    const board = emptyBoard();
    board[0][0] = FILLED;
    const markup = render({ board, settings: { ...SETTINGS, showCounter: true } });

    expect(markup.match(/nonogram-counter/g)).toHaveLength(10);
    // Row 0's clue totals 4 squares and only one is filled, so it is incomplete.
    expect(markup).not.toContain('is-complete');
  });

  it('flags a line whose filled count already matches its clue total', () => {
    const board = emptyBoard();
    // Column 1's clue is [1], satisfied by a single filled square.
    board[1][0] = FILLED;
    const markup = render({ board, settings: { ...SETTINGS, showCounter: true } });

    expect(markup).toContain('is-complete');
  });

  it('draws a heavier rule every five cells', () => {
    const markup = render();
    // 6 verticals and 6 horizontals, of which 0 and 5 are block rules on each axis.
    expect(markup.match(/nonogram-rule is-block/g)).toHaveLength(4);
  });
});
