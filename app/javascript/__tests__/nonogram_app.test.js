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

// A finger, which the grid treats as a tap rather than the start of a drag.
const finger = (svg, type, cell) => {
  act(() => {
    const event = new MouseEvent(type, {
      bubbles: true, cancelable: true, ...at(cell.x, cell.y),
    });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    svg.dispatchEvent(event);
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

  it('wraps the clock into hours once it passes one', () => {
    window.localStorage.setItem('nonogram-timer-test-room', String(73 * 60 + 10));
    mount();
    expect(container.querySelector('.nonogram-timer').textContent).toBe('1:13:10');

    act(() => root.unmount());
    container.remove();
    window.localStorage.setItem('nonogram-timer-test-room', String(59 * 60 + 59));
    mount();
    expect(container.querySelector('.nonogram-timer').textContent).toBe('59:59');
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
      .toEqual([false, false, false, false]);

    act(() => { cog.click(); });
    expect(panel.hidden).toBe(false);
  });

  it('exposes the line-highlight setting so remote lines follow it too', () => {
    mount();
    const wrapper = container.querySelector('.nonogram');
    expect(wrapper.classList.contains('nonogram-highlighting')).toBe(false);

    const toggle = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent.includes('Highlight row and column'))
      .querySelector('input');
    act(() => { toggle.click(); });

    expect(wrapper.classList.contains('nonogram-highlighting')).toBe(true);
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

  it('follows the mouse across the grid with the highlight, quietly', () => {
    const svg = mount();
    const highlight = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent.includes('Highlight row and column'))
      .querySelector('input');
    const lined = () => Array.from(
      container.querySelectorAll('.nonogram-cell.is-lined'),
    ).map((cell) => cell.dataset.cell);

    act(() => { highlight.click(); });
    // Engage first, so the broadcast below is skipped for being a hover rather
    // than for the player never having touched the grid.
    pointer(svg, 'pointerdown', { x: 0, y: 0 });
    pointer(svg, 'pointerup', { x: 0, y: 0 });
    expect(handlers.onCursor).toHaveBeenCalledTimes(1);
    handlers.onMoveBatch.mockClear();
    handlers.onCursor.mockClear();

    pointer(svg, 'pointermove', { x: 2, y: 3 });
    expect(lined()).toContain('2-0');
    expect(lined()).toContain('0-3');
    expect(lined()).not.toContain('4-0');

    pointer(svg, 'pointermove', { x: 4, y: 1 });
    expect(lined()).toContain('4-0');
    expect(lined()).not.toContain('2-0');

    // Nothing was drawn and nobody else needs to know where the mouse went.
    expect(handlers.onMoveBatch).not.toHaveBeenCalled();
    expect(handlers.onCursor).not.toHaveBeenCalled();
  });

  it('follows a clue strip, keeping the other axis where it was', () => {
    const svg = mount();
    const highlight = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent.includes('Highlight row and column'))
      .querySelector('input');
    const bands = () => Array.from(
      container.querySelectorAll('.nonogram-strip.is-lined'),
    ).map((rect) => rect.dataset.strip);

    act(() => { highlight.click(); });
    pointer(svg, 'pointermove', { x: 1, y: 1 });
    expect(bands()).toEqual(['row-1', 'col-1']);

    // Up the row clues, off the left of the grid: the row follows, the column
    // stays put rather than snapping to the edge.
    pointer(svg, 'pointermove', { x: -1, y: 3 });
    expect(bands()).toEqual(['row-3', 'col-1']);

    // And along the column clues above the grid.
    pointer(svg, 'pointermove', { x: 4, y: -1 });
    expect(bands()).toEqual(['row-3', 'col-4']);
  });

  it('leaves the cursor alone on a bare move with the highlight off', () => {
    const svg = mount();

    pointer(svg, 'pointerdown', { x: 0, y: 0 });
    pointer(svg, 'pointerup', { x: 0, y: 0 });
    handlers.onCursor.mockClear();
    pointer(svg, 'pointermove', { x: 3, y: 3 });

    expect(handlers.onCursor).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.nonogram-cell.is-lined')).toHaveLength(0);
  });

  it('paints one cell when a finger taps it', () => {
    const svg = mount();

    finger(svg, 'pointerdown', { x: 1, y: 1 });
    finger(svg, 'pointerup', { x: 1, y: 1 });

    expect(handlers.onMoveBatch).toHaveBeenCalledWith({
      space: 'board',
      value: '1',
      cells: [{ x: 1, y: 1, previousValue: '' }],
    });
  });

  it('paints nothing when a finger travels, so a scroll over the grid is free', () => {
    const svg = mount();

    finger(svg, 'pointerdown', { x: 0, y: 2 });
    finger(svg, 'pointermove', { x: 3, y: 2 });
    finger(svg, 'pointerup', { x: 3, y: 2 });

    expect(handlers.onMoveBatch).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.nonogram-cell-fill')).toHaveLength(0);
  });

  it('lets a finger drag once tap and drag is switched on', () => {
    const svg = mount();
    const touchDrag = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent.includes('Enable tap and drag'))
      .querySelector('input');

    act(() => { touchDrag.click(); });
    // The browser's own gestures over the grid go with it.
    expect(svg.getAttribute('class')).toContain('is-touch-drag');

    finger(svg, 'pointerdown', { x: 0, y: 2 });
    finger(svg, 'pointermove', { x: 3, y: 2 });
    finger(svg, 'pointerup', { x: 3, y: 2 });

    expect(handlers.onMoveBatch).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveBatch.mock.calls[0][0].cells).toHaveLength(4);
  });

  it('abandons a drag when a second finger lands, so a pinch draws nothing', () => {
    const svg = mount();

    pointer(svg, 'pointerdown', { x: 0, y: 2 });
    pointer(svg, 'pointermove', { x: 3, y: 2 });
    // The second finger: a pinch starting over the grid, not a stroke.
    pointer(svg, 'pointerdown', { x: 1, y: 4 });
    pointer(svg, 'pointerup', { x: 1, y: 4 });

    expect(handlers.onMoveBatch).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.nonogram-cell-fill')).toHaveLength(0);
  });

  it('abandons a drag the browser takes back for a gesture', () => {
    const svg = mount();

    pointer(svg, 'pointerdown', { x: 0, y: 2 });
    pointer(svg, 'pointermove', { x: 3, y: 2 });
    pointer(svg, 'pointercancel', { x: 3, y: 2 });

    expect(handlers.onMoveBatch).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.nonogram-cell-fill')).toHaveLength(0);
  });

  it('keeps a drag that is released past the edge of the grid', () => {
    const svg = mount();

    pointer(svg, 'pointerdown', { x: 0, y: 2 });
    pointer(svg, 'pointermove', { x: 3, y: 2 });
    // Off the right-hand edge: the release reports no cell at all.
    pointer(svg, 'pointerup', { x: 6, y: 2 });

    expect(handlers.onMoveBatch.mock.calls[0][0].cells).toHaveLength(4);
    expect(outlined()).toEqual(['0-2', '1-2', '2-2', '3-2']);
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

  it('keeps the crosses the aid has already drawn when it is switched off', () => {
    const svg = mount();
    const tick = (clue) => act(() => {
      svg.querySelector(`[data-clue="${clue}"]`).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    const derived = () => container.querySelectorAll('.nonogram-cell.is-derived').length;
    const autoMark = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent.includes('Auto cross and tick'))
      .querySelector('input');

    const fill = (x, y) => {
      pointer(svg, 'pointerdown', { x, y });
      pointer(svg, 'pointerup', { x, y });
    };

    act(() => { autoMark.click(); });
    // Row 0's clue of [1, 3], laid out, leaves one cell for the aid to cross.
    [0, 2, 3, 4].forEach((x) => fill(x, 0));
    tick('row-0-0');
    tick('row-0-1');
    expect(derived()).toBe(1);

    act(() => { autoMark.click(); });
    expect(derived()).toBe(1);

    // Row 1 is ticked off only now the aid is off, so it stays uncrossed.
    fill(3, 1);
    fill(4, 1);
    tick('row-1-0');
    expect(derived()).toBe(1);

    // Untick one of row 0's numbers and its crosses go with it.
    tick('row-0-0');
    expect(derived()).toBe(0);
  });

  it('takes focus when the grid is clicked, so the arrow keys reach it', () => {
    const svg = mount();
    const wrapper = container.querySelector('.nonogram-wrapper');

    pointer(svg, 'pointerdown', { x: 1, y: 1 });
    pointer(svg, 'pointerup', { x: 1, y: 1 });

    expect(document.activeElement).toBe(wrapper);
  });

  it('clears the cursor cell on backspace or delete, whatever it holds', () => {
    const svg = mount();
    const wrapper = container.querySelector('.nonogram-wrapper');
    const key = (name) => act(() => {
      wrapper.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    });

    pointer(svg, 'pointerdown', { x: 1, y: 1 });
    pointer(svg, 'pointerup', { x: 1, y: 1 });
    expect(container.querySelectorAll('.nonogram-cell-fill')).toHaveLength(1);

    key('Backspace');
    expect(container.querySelectorAll('.nonogram-cell-fill')).toHaveLength(0);

    key('x');
    expect(container.querySelectorAll('.nonogram-cell-cross')).toHaveLength(1);
    key('Delete');
    expect(container.querySelectorAll('.nonogram-cell-cross')).toHaveLength(0);

    // Nothing to clear, so nothing goes over the wire.
    handlers.onMoveBatch.mockClear();
    key('Backspace');
    expect(handlers.onMoveBatch).not.toHaveBeenCalled();
  });

  it('undoes and redoes from the keyboard', () => {
    const svg = mount();
    const wrapper = container.querySelector('.nonogram-wrapper');
    const key = (name) => act(() => {
      wrapper.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    });
    const filled = () => container.querySelectorAll('.nonogram-cell-fill').length;

    pointer(svg, 'pointerdown', { x: 1, y: 1 });
    pointer(svg, 'pointerup', { x: 1, y: 1 });
    expect(filled()).toBe(1);

    key('u');
    expect(filled()).toBe(0);

    key('i');
    expect(filled()).toBe(1);
  });

  it('shows the cursor when focus arrives from the keyboard, but not from a click', () => {
    const svg = mount();
    const wrapper = container.querySelector('.nonogram-wrapper');
    const tinted = () => container.querySelectorAll('.nonogram-cell.is-cursor').length;

    pointer(svg, 'pointerdown', { x: 1, y: 1 });
    pointer(svg, 'pointerup', { x: 1, y: 1 });
    expect(tinted()).toBe(0);

    act(() => { wrapper.blur(); });
    act(() => { wrapper.focus(); });
    expect(tinted()).toBe(1);
  });

  it('keeps the cursor off while the pointer is the thing in use', () => {
    const svg = mount();
    const wrapper = container.querySelector('.nonogram-wrapper');
    const tinted = () => container.querySelectorAll('.nonogram-cell.is-cursor').length;
    const highlight = Array.from(container.querySelectorAll('label'))
      .find((label) => label.textContent.includes('Highlight row and column'))
      .querySelector('input');

    act(() => { highlight.click(); });
    pointer(svg, 'pointerdown', { x: 1, y: 1 });
    pointer(svg, 'pointerup', { x: 1, y: 1 });
    expect(tinted()).toBe(0);

    act(() => {
      wrapper.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(tinted()).toBe(1);

    // A clue number is outside the grid proper, but clicking one is still the
    // pointer taking over -- and it takes focus with it, which bubbles up to
    // the wrapper and must not read as the grid being tabbed into.
    const clue = svg.querySelector('[data-clue="row-0-0"]');
    act(() => {
      clue.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      clue.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      clue.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(tinted()).toBe(0);
  });

  it('moves the cursor with the arrow keys and fills the cell it lands on', () => {
    const svg = mount();
    const wrapper = container.querySelector('.nonogram-wrapper');
    const key = (name) => act(() => {
      wrapper.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    });
    const cursorCell = () => container.querySelector('.nonogram-cell.is-cursor').dataset.cell;

    pointer(svg, 'pointerdown', { x: 0, y: 0 });
    pointer(svg, 'pointerup', { x: 0, y: 0 });
    handlers.onMoveBatch.mockClear();

    key('ArrowRight');
    key('ArrowDown');
    key('ArrowDown');
    // The tint follows the keys even with the highlight setting off.
    expect(cursorCell()).toBe('1-2');

    key(' ');
    expect(handlers.onMoveBatch).toHaveBeenCalledWith({
      space: 'board',
      value: '1',
      cells: [{ x: 1, y: 2, previousValue: '' }],
    });
  });

  it('sends a clue tick in that line\'s mark space', () => {
    const svg = mount();

    act(() => {
      svg.querySelector('[data-clue="row-0-0"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(handlers.onMoveBatch).toHaveBeenCalledWith({
      space: 'row_marks',
      value: '1',
      cells: [{ x: 0, y: 0, previousValue: '' }],
    });
  });

  it('undoes a clue tick alongside the strokes around it', () => {
    const svg = mount();
    const tick = () => act(() => {
      svg.querySelector('[data-clue="row-0-0"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    const marked = () => container.querySelectorAll('.nonogram-clue.is-marked').length;
    const [undo, redo] = container.querySelectorAll('.nonogram-history button');

    pointer(svg, 'pointerdown', { x: 1, y: 1 });
    pointer(svg, 'pointerup', { x: 1, y: 1 });
    tick();
    expect(marked()).toBe(1);

    act(() => { undo.click(); });
    expect(marked()).toBe(0);
    expect(container.querySelectorAll('.nonogram-cell-fill')).toHaveLength(1);
    expect(handlers.onMoveBatch).toHaveBeenLastCalledWith({
      space: 'row_marks',
      value: '',
      cells: [{ x: 0, y: 0, previousValue: '1' }],
    });

    act(() => { undo.click(); });
    expect(container.querySelectorAll('.nonogram-cell-fill')).toHaveLength(0);

    act(() => { redo.click(); });
    act(() => { redo.click(); });
    expect(marked()).toBe(1);
    expect(container.querySelectorAll('.nonogram-cell-fill')).toHaveLength(1);
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

  it('applies a single move arriving from another player', () => {
    const controlRef = createRef();
    const svg = mount({ controlRef });

    act(() => { controlRef.current.applyMove({ space: 'board', x: 2, y: 1, value: '1' }); });

    expect(svg.querySelectorAll('.nonogram-cell-fill')).toHaveLength(1);
  });

  it('applies a clue tick arriving from another player', () => {
    const controlRef = createRef();
    mount({ controlRef });

    act(() => { controlRef.current.applyMove({ space: 'row_marks', x: 0, y: 0, value: '1' }); });

    expect(container.querySelectorAll('.nonogram-clue.is-marked')).toHaveLength(1);
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
