import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import React, { createRef, act } from 'react';
import { createRoot } from 'react-dom/client';
import Nonogram from '../lib/nonogram_app';

const DATA = {
  name: '5x5 Nonogram No 1',
  task: '1.1/1/1.1/2.2/4/1.3/2/1/2/4',
  dimensions: { cols: 5, rows: 5 },
  colClues: [[1, 1], [1], [1, 1], [2, 2], [4]],
  rowClues: [[1, 3], [2], [1], [2], [4]],
  solution: 'ynyyynnnyynnnnynnnyyyyyyn',
};

const CELL = 20;
const GUTTER = 2;

let container;
let root;
let handlers;

// jsdom lays nothing out, so the grid is given a known geometry: the SVG sits
// at the origin and every cell is CELL pixels square, which is all the pointer
// handling needs to turn a coordinate back into a cell.
const stubLayout = () => {
  const svg = container.querySelector('svg.nonogram-grid');
  svg.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: (DATA.dimensions.cols + GUTTER) * CELL,
    height: (DATA.dimensions.rows + GUTTER) * CELL,
  });
  return svg;
};

const at = (x, y) => ({
  clientX: (GUTTER + x) * CELL + CELL / 2,
  clientY: (GUTTER + y) * CELL + CELL / 2,
});

const pointer = (svg, type, cell, init = {}) => {
  act(() => {
    svg.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, ...at(cell.x, cell.y), ...init,
    }));
  });
};

const mount = (props = {}) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  handlers = {
    onMove: vi.fn(),
    onMoveBatch: vi.fn(),
    onCursor: vi.fn(),
  };
  act(() => {
    root.render(React.createElement(Nonogram, {
      data: DATA,
      storageKey: 'test-room',
      controlRef: createRef(),
      ...handlers,
      ...props,
    }));
  });
  return stubLayout();
};

describe('Nonogram', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // The component sizes itself from its container, which jsdom never resizes.
    window.ResizeObserver = class {
      observe() {}

      disconnect() {}
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('broadcasts nothing until the player has actually done something', () => {
    mount();

    expect(handlers.onCursor).not.toHaveBeenCalled();
  });

  it('reports both lines through the cursor once the player acts on the grid', () => {
    const { cols, rows } = DATA.dimensions;
    const svg = mount();

    pointer(svg, 'pointerdown', { x: 2, y: 3 });
    pointer(svg, 'pointerup', { x: 2, y: 3 });

    expect(handlers.onCursor).toHaveBeenCalled();
    const payload = handlers.onCursor.mock.calls.at(-1)[0];
    expect(payload).toMatchObject({ x: 2, y: 3 });
    // The whole row and the whole column, with the cursor cell counted once.
    expect(payload.entry_cells).toHaveLength(cols + rows - 1);
    expect(payload.entry_cells).toContainEqual([0, 3]);
    expect(payload.entry_cells).toContainEqual([2, 0]);
    expect(payload.entry_cells.filter(([x, y]) => x === 2 && y === 3)).toHaveLength(1);
  });

  it('exposes the line-highlight setting so remote lines follow it too', () => {
    mount();
    const wrapper = container.querySelector('.nonogram');
    expect(wrapper.dataset.highlightLines).toBe('true');

    const toggle = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent.includes('Highlight row and column'))
      .querySelector('input');
    act(() => { toggle.click(); });

    expect(wrapper.dataset.highlightLines).toBe('false');
  });

  it('sends a click as a single-cell batch carrying the previous value', () => {
    const svg = mount();

    pointer(svg, 'pointerdown', { x: 1, y: 1 });
    pointer(svg, 'pointerup', { x: 1, y: 1 });

    expect(handlers.onMoveBatch).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveBatch).toHaveBeenCalledWith({
      space: 'board',
      value: '1',
      cells: [{ x: 1, y: 1, previousValue: '' }],
    });
  });

  it('sends a whole drag as one batch', () => {
    const svg = mount();

    pointer(svg, 'pointerdown', { x: 0, y: 2 });
    pointer(svg, 'pointermove', { x: 3, y: 2 });
    pointer(svg, 'pointerup', { x: 3, y: 2 });

    expect(handlers.onMoveBatch).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveBatch.mock.calls[0][0].cells).toHaveLength(4);
  });

  it('sends a clue tick as a move in that line\'s mark space', () => {
    const svg = mount();

    act(() => {
      svg.querySelector('[data-clue="row-0-0"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(handlers.onMove).toHaveBeenCalledWith({
      space: 'row_marks', x: 0, y: 0, value: '1', previousValue: '',
    });
  });

  it('applies a batch arriving from another player', () => {
    const controlRef = createRef();
    const svg = mount({ controlRef });

    act(() => {
      controlRef.current.applyBatch({
        space: 'board', value: '1', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      });
    });

    expect(svg.querySelectorAll('.nonogram-cell-fill')).toHaveLength(2);
    expect(handlers.onMoveBatch).not.toHaveBeenCalled();
  });

  it('announces the puzzle as solved once the grid matches the solution', () => {
    const controlRef = createRef();
    mount({ controlRef });

    const solution = 'ynyyynnnyynnnnynnnyyyyyyn';
    const cells = [];
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        if (solution[y * 5 + x] === 'y') cells.push({ x, y });
      }
    }
    act(() => {
      controlRef.current.applyBatch({ space: 'board', value: '1', cells });
    });

    expect(container.querySelector('.nonogram-solved')).not.toBeNull();
  });
});
