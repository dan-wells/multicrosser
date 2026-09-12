import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import './lib/nonogram.css';
import './lib/print-page.css';
import './lib/nonogram-print.css';
import NonogramGrid, { gridLayout } from './lib/nonogram_grid';
import { EMPTY, derive, NOTHING_DERIVED } from './lib/nonogram_logic';

// A4 portrait with 10mm margins leaves 190mm of usable width, which is 718px
// at the 96dpi Chrome prints at. Stay just inside that, and cap the cell so a
// 5x5 does not fill the sheet.
const MAX_GRID_WIDTH = 700;
const MAX_CELL = 34;

const SETTINGS = { showCounter: false, highlightLines: false };

const mountElement = document.getElementsByClassName('js-print-nonogram')[0];
const data = JSON.parse(mountElement.dataset.crossword);

const { dimensions } = data;
const board = Array.from({ length: dimensions.cols }, () => Array(dimensions.rows).fill(EMPTY));
const marks = { rowMarks: {}, colMarks: {} };
const layout = gridLayout(data, SETTINGS);
const cellSize = Math.min(MAX_CELL, Math.floor(MAX_GRID_WIDTH / layout.totalCols));

const noop = () => {};

const root = createRoot(mountElement);
flushSync(() => {
  root.render(<NonogramGrid
    data={data}
    board={board}
    derived={derive(board, dimensions, data, marks, NOTHING_DERIVED)}
    marks={marks}
    settings={SETTINGS}
    // No cell is the cursor: -1 is off the grid on both axes.
    cursor={{ x: -1, y: -1 }}
    lastChange={null}
    pending={null}
    cellSize={cellSize}
    onPointerDown={noop}
    onPointerMove={noop}
    onPointerUp={noop}
    onClueClick={noop}
  />);
});
