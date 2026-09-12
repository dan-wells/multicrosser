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

const outlined = () => Array.from(
  container.querySelectorAll('.nonogram-cell-outline'),
).map((rect) => rect.dataset.cell);

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

  it('clears every cell and clue tick for the room, on a second click', () => {
    const svg = mount();

    pointer(svg, 'pointerdown', { x: 1, y: 1 });
    pointer(svg, 'pointerup', { x: 1, y: 1 });
    act(() => { container.querySelector('[data-clue="row-0-0"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    ); });
    handlers.onMoveBatch.mockClear();
    handlers.onMove.mockClear();

    const startOver = container.querySelector('.nonogram-actions button');
    act(() => { startOver.click(); });
    expect(handlers.onMoveBatch).not.toHaveBeenCalled();
    expect(startOver.textContent).toBe('Confirm start over');
    expect(startOver.hasAttribute('data-confirming')).toBe(true);

    act(() => { startOver.click(); });
    expect(startOver.textContent).toBe('Start over');

    const spaces = handlers.onMoveBatch.mock.calls.map(([batch]) => batch.space);
    expect(spaces).toContain('board');
    expect(spaces).toContain('row_marks');
    expect(handlers.onMoveBatch.mock.calls.every(([batch]) => batch.value === '')).toBe(true);
    expect(container.querySelectorAll('.nonogram-cell-fill')).toHaveLength(0);
    expect(container.querySelectorAll('.nonogram-clue.is-marked')).toHaveLength(0);
    expect(container.querySelectorAll('.nonogram-cell-outline')).toHaveLength(0);
  });

  it('disarms start over again if the second click never comes', () => {
    mount();
    vi.useFakeTimers();
    const startOver = container.querySelector('.nonogram-actions button');

    act(() => { startOver.click(); });
    expect(startOver.textContent).toBe('Confirm start over');

    act(() => { vi.advanceTimersByTime(3000); });
    expect(startOver.textContent).toBe('Start over');
    vi.useRealTimers();
  });

  it('keeps the solved time as it stood, even if the clock is reset after', () => {
    // The clock is picked up mid-solve, as it would be on a page reload.
    window.localStorage.setItem('nonogram-timer-test-room', '125');
    const svg = mount();

    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        if (DATA.solution[y * 5 + x] !== 'y') continue;
        pointer(svg, 'pointerdown', { x, y });
        pointer(svg, 'pointerup', { x, y });
      }
    }
    expect(container.querySelector('.nonogram-solved').textContent).toBe('Puzzle solved in 02:05');

    act(() => { container.querySelectorAll('.nonogram-actions button')[1].click(); });
    expect(container.querySelector('.nonogram-timer').textContent).toBe('00:00');
    expect(container.querySelector('.nonogram-solved').textContent).toBe('Puzzle solved in 02:05');
  });

  it('zeroes the timer without touching the grid', () => {
    const svg = mount();
    pointer(svg, 'pointerdown', { x: 1, y: 1 });
    pointer(svg, 'pointerup', { x: 1, y: 1 });
    window.localStorage.setItem('nonogram-timer-test-room', '90');

    const reset = container.querySelectorAll('.nonogram-actions button')[1];
    act(() => { reset.click(); });

    expect(container.querySelector('.nonogram-timer').textContent).toBe('00:00');
    expect(container.querySelectorAll('.nonogram-cell-fill')).toHaveLength(1);
  });

  it('links a new puzzle at the series random route', () => {
    mount({ randomPath: '/nonogram-5/random' });
    const link = container.querySelector('.nonogram-actions a');

    expect(link.getAttribute('href')).toBe('/nonogram-5/random');
    expect(link.textContent).toBe('New puzzle');
  });

  it('keeps the options panel behind the cog, every aid off to begin with', () => {
    mount();
    const panel = container.querySelector('.nonogram-options');
    const cog = container.querySelector('.nonogram-settings button');

    expect(panel.hidden).toBe(true);
    expect(Array.from(panel.querySelectorAll('input')).map((box) => box.checked))
      .toEqual([false, false, false]);

    act(() => { cog.click(); });
    expect(panel.hidden).toBe(false);
  });

  it('exposes the line-highlight setting so remote lines follow it too', () => {
    mount();
    const wrapper = container.querySelector('.nonogram');
    expect(wrapper.dataset.highlightLines).toBe('false');

    const toggle = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent.includes('Highlight row and column'))
      .querySelector('input');
    act(() => { toggle.click(); });

    expect(wrapper.dataset.highlightLines).toBe('true');
  });

  it('remembers a setting the player changed', () => {
    mount();
    const toggle = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent.includes('Auto cross and tick'))
      .querySelector('input');
    act(() => { toggle.click(); });

    expect(JSON.parse(window.localStorage.getItem('nonogram-settings')).autoMark).toBe(true);
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

  it('outlines a whole drag, cells that already held the value included', () => {
    const svg = mount();

    pointer(svg, 'pointerdown', { x: 2, y: 0 });
    pointer(svg, 'pointerup', { x: 2, y: 0 });
    pointer(svg, 'pointerdown', { x: 0, y: 0 });
    pointer(svg, 'pointermove', { x: 3, y: 0 });
    pointer(svg, 'pointerup', { x: 3, y: 0 });

    // (2,0) was filled already, so the batch leaves it out -- but the run the
    // drag laid down is unbroken on screen.
    expect(handlers.onMoveBatch.mock.calls[1][0].cells).toHaveLength(3);
    expect(outlined()).toEqual(['0-0', '1-0', '2-0', '3-0']);
  });

  it('walks the last-move outline back through the stack on undo', () => {
    const svg = mount();
    pointer(svg, 'pointerdown', { x: 1, y: 1 });
    pointer(svg, 'pointerup', { x: 1, y: 1 });
    pointer(svg, 'pointerdown', { x: 3, y: 3 });
    pointer(svg, 'pointerup', { x: 3, y: 3 });
    expect(outlined()).toEqual(['3-3']);

    act(() => { container.querySelector('.nonogram-history button').click(); });
    expect(outlined()).toEqual(['1-1']);

    act(() => { container.querySelector('.nonogram-history button').click(); });
    expect(outlined()).toEqual([]);
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
