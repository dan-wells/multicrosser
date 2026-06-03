import { describe, it, expect, beforeEach } from 'vitest';
import React, { createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { Crossword } from '@guardian/react-crossword';

// 3x3 grid where the entry order in data is A1, D1, D2, D3, A2, A3
// i.e. several Down entries sit between the first and second Across. With
// direction-agnostic prev/next linking, pressing ']' from 1-across drops
// onto 1-down. With direction-scoped linking, it should jump to 4-across.
const DATA = {
  id: 'nav-1',
  name: 'Nav test',
  date: 0,
  creator: { name: 'Test' },
  crosswordType: 'cryptic',
  number: 1,
  solutionAvailable: true,
  dimensions: { rows: 3, cols: 3 },
  entries: [
    { id: '1-across', number: 1, humanNumber: '1', direction: 'across', position: { x: 0, y: 0 }, length: 3, clue: 'row1', solution: 'ABC', group: ['1-across'], separatorLocations: {} },
    { id: '1-down',   number: 1, humanNumber: '1', direction: 'down',   position: { x: 0, y: 0 }, length: 3, clue: 'col1', solution: 'ADG', group: ['1-down'],   separatorLocations: {} },
    { id: '2-down',   number: 2, humanNumber: '2', direction: 'down',   position: { x: 1, y: 0 }, length: 3, clue: 'col2', solution: 'BEH', group: ['2-down'],   separatorLocations: {} },
    { id: '3-down',   number: 3, humanNumber: '3', direction: 'down',   position: { x: 2, y: 0 }, length: 3, clue: 'col3', solution: 'CFI', group: ['3-down'],   separatorLocations: {} },
    { id: '4-across', number: 4, humanNumber: '4', direction: 'across', position: { x: 0, y: 1 }, length: 3, clue: 'row2', solution: 'DEF', group: ['4-across'], separatorLocations: {} },
    { id: '5-across', number: 5, humanNumber: '5', direction: 'across', position: { x: 0, y: 2 }, length: 3, clue: 'row3', solution: 'GHI', group: ['5-across'], separatorLocations: {} },
  ],
};

let container;
let root;

const mount = () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(React.createElement(Crossword, {
      ref: createRef(),
      data: DATA,
      progress: Array.from({ length: DATA.dimensions.cols }, () => Array.from({ length: DATA.dimensions.rows }, () => '')),
    }));
  });
};

const selectedEntryId = () => {
  const el = container.querySelector('[role="option"][aria-selected="true"][data-entry-id]');
  return el ? el.getAttribute('data-entry-id') : null;
};

const clickEntry = (entryId) => {
  const el = container.querySelector(`[role="option"][data-entry-id="${entryId}"]`);
  expect(el).not.toBeNull();
  act(() => { el.click(); });
};

// The [ / ] handler lives on the cell input (foreignObject > input) for the
// currently-focused cell. Dispatching on the grid svg wouldn't reach it,
// so target document.activeElement, which selectClue's focus() left there.
const pressKey = (key) => {
  const target = document.activeElement;
  expect(target).not.toBeNull();
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
};

describe('clue navigation with [ and ]', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mount();
  });

  it('] from an across clue moves to the next across, skipping interleaved down entries', () => {
    clickEntry('1-across');
    expect(selectedEntryId()).toBe('1-across');
    pressKey(']');
    expect(selectedEntryId()).toBe('4-across');
  });

  it('[ from an across clue moves to the previous across', () => {
    clickEntry('4-across');
    expect(selectedEntryId()).toBe('4-across');
    pressKey('[');
    expect(selectedEntryId()).toBe('1-across');
  });

  it('] from a down clue moves to the next down', () => {
    clickEntry('1-down');
    expect(selectedEntryId()).toBe('1-down');
    pressKey(']');
    expect(selectedEntryId()).toBe('2-down');
  });

  it('] from the last across crosses to the first down', () => {
    clickEntry('5-across');
    expect(selectedEntryId()).toBe('5-across');
    pressKey(']');
    expect(selectedEntryId()).toBe('1-down');
  });

  it('[ from the first down crosses back to the last across', () => {
    clickEntry('1-down');
    expect(selectedEntryId()).toBe('1-down');
    pressKey('[');
    expect(selectedEntryId()).toBe('5-across');
  });

  it('] from the last down wraps back to the first across', () => {
    clickEntry('3-down');
    expect(selectedEntryId()).toBe('3-down');
    pressKey(']');
    expect(selectedEntryId()).toBe('1-across');
  });

  it('[ from the first across wraps back to the last down', () => {
    clickEntry('1-across');
    expect(selectedEntryId()).toBe('1-across');
    pressKey('[');
    expect(selectedEntryId()).toBe('3-down');
  });
});
