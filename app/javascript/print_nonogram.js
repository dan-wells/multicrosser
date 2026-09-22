import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import './lib/nonogram.css';
import './lib/print-page.css';
import './lib/nonogram-print.css';
import NonogramGrid, { gridLayout } from './lib/nonogram_grid';
import { EMPTY, NOTHING_DERIVED } from './lib/nonogram_logic';
import { fitToPage } from './lib/print_page';

// A CSS pixel is 1/96 of an inch (25.4 mm) by definition; with this we can
// specify lengths in millimetres and have that be what we get on paper.
const PX_PER_MM = 96 / 25.4;

const PAGE_WIDTH_MM = 210;
const PAGE_MARGIN_MM = 10;
const MAX_GRID_WIDTH = (PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2) * PX_PER_MM;

const CELL_MM = 5;
const MAX_CELL = CELL_MM * PX_PER_MM;

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
    derived={NOTHING_DERIVED}
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
    onPointerCancel={noop}
    onClueClick={noop}
  />);
});

const grid = mountElement.querySelector('svg.nonogram-grid');
fitToPage(grid, grid);
