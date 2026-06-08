import { describe, it, expect } from 'vitest';
import React, { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Crossword } from '@guardian/react-crossword';

const buildData = ({ cellStyles = [] } = {}) => ({
  id: 'test-shaded',
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

// Returns the inner markup of the <g> for cell (x, y), plus the opening
// <g ...> tag itself so attribute assertions can match against it.
const cellMatch = (html, x, y) => {
  const m = html.match(
    new RegExp(`<g[^>]*data-x="${x}"[^>]*data-y="${y}"[^>]*>([\\s\\S]*?)</g>`),
  );
  if (!m) return null;
  const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
  return { openTag, inner: m[1] };
};

describe('Crossword cellStyles -> shaded rendering', () => {
  it('marks the parent <g> with data-cell-style="shaded" so CSS can target it', () => {
    const html = render(buildData({ cellStyles: [{ x: 0, y: 0, style: 'shaded' }] }));
    const cell = cellMatch(html, 0, 0);
    expect(cell).not.toBeNull();
    expect(cell.openTag).toMatch(/data-cell-style="shaded"/);
  });

  it('shaded cells render with a single background rect (no overlay)', () => {
    const html = render(buildData({ cellStyles: [{ x: 0, y: 0, style: 'shaded' }] }));
    const cell = cellMatch(html, 0, 0);
    expect((cell.inner.match(/<rect\b/g) ?? []).length).toBe(1);
  });

  it('plain cells (no cellStyles) have no data-cell-style and a single rect', () => {
    const html = render(buildData());
    const cell = cellMatch(html, 0, 0);
    expect(cell.openTag).not.toMatch(/data-cell-style/);
    expect((cell.inner.match(/<rect\b/g) ?? []).length).toBe(1);
  });

  it('circled cells get data-cell-style="circled" on the <g> (harmless; no CSS targets it)', () => {
    const html = render(buildData({ cellStyles: [{ x: 0, y: 0, style: 'circled' }] }));
    const cell = cellMatch(html, 0, 0);
    expect(cell.openTag).toMatch(/data-cell-style="circled"/);
    // Circled cells still have exactly 1 background rect plus the circle overlay.
    expect((cell.inner.match(/<rect\b/g) ?? []).length).toBe(1);
    expect((cell.inner.match(/<circle\b/g) ?? []).length).toBe(1);
  });
});
