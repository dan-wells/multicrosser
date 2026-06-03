import { describe, it, expect } from 'vitest';
import React, { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Crossword } from '@guardian/react-crossword';

const buildData = ({ cellStyles = [] } = {}) => ({
  id: 'test-1',
  name: 'Test puzzle',
  date: 0,
  creator: { name: 'Test' },
  crosswordType: 'cryptic',
  number: 1,
  solutionAvailable: true,
  dimensions: { rows: 2, cols: 2 },
  entries: [
    { id: '1-across', number: 1, humanNumber: '1', direction: 'across', position: { x: 0, y: 0 }, length: 2, clue: 'ab', solution: 'AB', group: ['1-across'], separatorLocations: {} },
    { id: '1-down',   number: 1, humanNumber: '1', direction: 'down',   position: { x: 0, y: 0 }, length: 2, clue: 'ad', solution: 'AD', group: ['1-down'],   separatorLocations: {} },
    { id: '2-down',   number: 2, humanNumber: '2', direction: 'down',   position: { x: 1, y: 0 }, length: 2, clue: 'bd', solution: 'BD', group: ['2-down'],   separatorLocations: {} },
  ],
  cellStyles,
});

const render = (data) => renderToStaticMarkup(
  React.createElement(Crossword, { ref: createRef(), data, progress: [['', ''], ['', '']] }),
);

describe('Crossword cellStyles → circled rendering', () => {
  it('emits a <circle> for each cell flagged style:"circled"', () => {
    const html = render(buildData({ cellStyles: [{ x: 0, y: 0, style: 'circled' }] }));
    const circleCount = (html.match(/<circle\b/g) ?? []).length;
    expect(circleCount).toBe(1);
  });

  it('paints the cell number after the circle so the number sits on top', () => {
    const html = render(buildData({ cellStyles: [{ x: 0, y: 0, style: 'circled' }] }));
    // Cell (0,0) is numbered "1"; capture just its <g> subtree.
    const cellMatch = html.match(/<g[^>]*data-x="0"[^>]*data-y="0"[^>]*>([\s\S]*?)<\/g>/);
    expect(cellMatch).not.toBeNull();
    const inner = cellMatch[1];
    const circleAt = inner.indexOf('<circle');
    const numberAt = inner.search(/<text[^>]*>1<\/text>/);
    expect(circleAt).toBeGreaterThanOrEqual(0);
    expect(numberAt).toBeGreaterThanOrEqual(0);
    expect(numberAt).toBeGreaterThan(circleAt);
  });

  it('emits no <circle> when no cellStyles are present', () => {
    const html = render(buildData());
    expect(html).not.toMatch(/<circle\b/);
  });
});
