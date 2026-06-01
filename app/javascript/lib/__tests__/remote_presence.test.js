import {
  describe, it, expect, beforeEach,
} from 'vitest';
import RemotePresence from '../remote_presence';

// Build a SVG cell group element with id matching the format Guardian emits:
// `cell-group-{x}-{y}-{anyid}`. The element doesn't need to be SVG for these
// tests since we only check getAttribute/setAttribute behaviour.
function makeCell(x, y) {
  const el = document.createElement('div');
  el.setAttribute('id', `cell-group-${x}-${y}-test`);
  return el;
}

// Build a cell map covering a small rectangle of cells. Returns the Map plus
// the container element so callers can interrogate individual cells.
function buildGrid(width, height) {
  const container = document.createElement('div');
  const cellMap = new Map();
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const el = makeCell(x, y);
      container.appendChild(el);
      cellMap.set(`${x}-${y}`, el);
    }
  }
  document.body.appendChild(container);
  return { container, cellMap };
}

function makeClueOption(entryId) {
  const el = document.createElement('li');
  el.setAttribute('data-entry-id', entryId);
  return el;
}

function buildClueList(entryIds) {
  const container = document.createElement('div');
  entryIds.forEach((id) => container.appendChild(makeClueOption(id)));
  document.body.appendChild(container);
  return container;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('RemotePresence.handleMessage', () => {
  it('replaces sessions on a presence_snapshot', () => {
    const rp = new RemotePresence();
    rp.handleMessage({ type: 'presence', session_id: 's1', x: 0, y: 0, entry_cells: [] });
    rp.handleMessage({
      type: 'presence_snapshot',
      sessions: {
        s2: { x: 1, y: 1, entry_id: '1-across', entry_cells: [[1, 1]] },
      },
    });
    expect(rp.sessions.has('s1')).toBe(false);
    expect(rp.sessions.get('s2')).toEqual({ x: 1, y: 1, entry_id: '1-across', entry_cells: [[1, 1]] });
  });

  it('adds or updates a session on a presence message', () => {
    const rp = new RemotePresence();
    rp.handleMessage({
      type: 'presence', session_id: 's1', x: 0, y: 0, entry_id: '1-across', entry_cells: [[0, 0]],
    });
    expect(rp.sessions.get('s1').x).toBe(0);
    rp.handleMessage({
      type: 'presence', session_id: 's1', x: 2, y: 3, entry_id: '4-down', entry_cells: [[2, 3], [2, 4]],
    });
    expect(rp.sessions.get('s1')).toEqual({
      x: 2, y: 3, entry_id: '4-down', entry_cells: [[2, 3], [2, 4]],
    });
  });

  it('removes a session on a leave message', () => {
    const rp = new RemotePresence();
    rp.handleMessage({
      type: 'presence', session_id: 's1', x: 0, y: 0, entry_cells: [],
    });
    rp.handleMessage({ type: 'presence', session_id: 's1', leave: true });
    expect(rp.sessions.has('s1')).toBe(false);
  });

  it('handles an empty presence_snapshot', () => {
    const rp = new RemotePresence();
    rp.handleMessage({ type: 'presence_snapshot', sessions: {} });
    expect(rp.sessions.size).toBe(0);
  });
});

describe('RemotePresence.applyGrid', () => {
  it('marks the remote cursor cell and entry cells', () => {
    const rp = new RemotePresence();
    const { cellMap } = buildGrid(3, 3);
    rp.setCellMap(cellMap);

    rp.handleMessage({
      type: 'presence', session_id: 's1', x: 1, y: 0, entry_id: '1-across', entry_cells: [[0, 0], [1, 0], [2, 0]],
    });

    expect(cellMap.get('1-0').getAttribute('data-remote-cursor')).toBe('true');
    expect(cellMap.get('0-0').getAttribute('data-remote-clue')).toBe('true');
    expect(cellMap.get('1-0').getAttribute('data-remote-clue')).toBe('true');
    expect(cellMap.get('2-0').getAttribute('data-remote-clue')).toBe('true');
    expect(cellMap.get('0-1').hasAttribute('data-remote-cursor')).toBe(false);
    expect(cellMap.get('0-1').hasAttribute('data-remote-clue')).toBe(false);
  });

  it('clears attributes from cells no longer matching after a session moves', () => {
    const rp = new RemotePresence();
    const { cellMap } = buildGrid(3, 3);
    rp.setCellMap(cellMap);

    rp.handleMessage({
      type: 'presence', session_id: 's1', x: 0, y: 0, entry_id: '1-across', entry_cells: [[0, 0], [1, 0]],
    });
    rp.handleMessage({
      type: 'presence', session_id: 's1', x: 2, y: 2, entry_id: '5-down', entry_cells: [[2, 2]],
    });

    expect(cellMap.get('0-0').hasAttribute('data-remote-cursor')).toBe(false);
    expect(cellMap.get('0-0').hasAttribute('data-remote-clue')).toBe(false);
    expect(cellMap.get('1-0').hasAttribute('data-remote-clue')).toBe(false);
    expect(cellMap.get('2-2').getAttribute('data-remote-cursor')).toBe('true');
    expect(cellMap.get('2-2').getAttribute('data-remote-clue')).toBe('true');
  });

  it('clears all attributes when the last session leaves', () => {
    const rp = new RemotePresence();
    const { cellMap } = buildGrid(2, 2);
    rp.setCellMap(cellMap);

    rp.handleMessage({
      type: 'presence', session_id: 's1', x: 0, y: 0, entry_id: '1-across', entry_cells: [[0, 0], [1, 0]],
    });
    rp.handleMessage({ type: 'presence', session_id: 's1', leave: true });

    cellMap.forEach((el) => {
      expect(el.hasAttribute('data-remote-cursor')).toBe(false);
      expect(el.hasAttribute('data-remote-clue')).toBe(false);
    });
  });

  it('suppresses data-remote-clue on cells in the local user\'s selected entry', () => {
    const rp = new RemotePresence();
    const { cellMap } = buildGrid(3, 1);
    rp.setCellMap(cellMap);

    rp.handleMessage({
      type: 'presence', session_id: 's1', x: 1, y: 0, entry_id: '1-across', entry_cells: [[0, 0], [1, 0], [2, 0]],
    });

    // Before setting local entry: all clue cells are tinted.
    expect(cellMap.get('0-0').hasAttribute('data-remote-clue')).toBe(true);
    expect(cellMap.get('1-0').hasAttribute('data-remote-clue')).toBe(true);
    expect(cellMap.get('2-0').hasAttribute('data-remote-clue')).toBe(true);

    // The local user selects the same clue. None should be tinted now, but the
    // remote cursor border on (1, 0) stays.
    rp.setLocalEntry('1-across', [[0, 0], [1, 0], [2, 0]]);

    expect(cellMap.get('0-0').hasAttribute('data-remote-clue')).toBe(false);
    expect(cellMap.get('1-0').hasAttribute('data-remote-clue')).toBe(false);
    expect(cellMap.get('2-0').hasAttribute('data-remote-clue')).toBe(false);
    expect(cellMap.get('1-0').getAttribute('data-remote-cursor')).toBe('true');
  });

  it('unions cursors and clue cells across multiple sessions', () => {
    const rp = new RemotePresence();
    const { cellMap } = buildGrid(3, 3);
    rp.setCellMap(cellMap);

    rp.handleMessage({
      type: 'presence', session_id: 's1', x: 0, y: 0, entry_id: '1-across', entry_cells: [[0, 0], [1, 0]],
    });
    rp.handleMessage({
      type: 'presence', session_id: 's2', x: 2, y: 2, entry_id: '5-down', entry_cells: [[2, 0], [2, 1], [2, 2]],
    });

    expect(cellMap.get('0-0').getAttribute('data-remote-cursor')).toBe('true');
    expect(cellMap.get('2-2').getAttribute('data-remote-cursor')).toBe('true');
    expect(cellMap.get('1-0').getAttribute('data-remote-clue')).toBe('true');
    expect(cellMap.get('2-1').getAttribute('data-remote-clue')).toBe('true');
  });

  it('does nothing when no cell map has been set', () => {
    const rp = new RemotePresence();
    expect(() => rp.handleMessage({
      type: 'presence', session_id: 's1', x: 0, y: 0, entry_cells: [[0, 0]],
    })).not.toThrow();
  });
});

describe('RemotePresence.applyClueList', () => {
  it('marks clue-list entries for remote-selected entry ids', () => {
    const rp = new RemotePresence();
    const container = buildClueList(['1-across', '2-down', '5-across']);
    rp.setCrosswordElement(container);

    rp.handleMessage({
      type: 'presence', session_id: 's1', x: 0, y: 0, entry_id: '2-down', entry_cells: [],
    });

    expect(container.querySelector('[data-entry-id="2-down"]').getAttribute('data-remote-entry')).toBe('true');
    expect(container.querySelector('[data-entry-id="1-across"]').hasAttribute('data-remote-entry')).toBe(false);
    expect(container.querySelector('[data-entry-id="5-across"]').hasAttribute('data-remote-entry')).toBe(false);
  });

  it('suppresses data-remote-entry on the local user\'s selected entry', () => {
    const rp = new RemotePresence();
    const container = buildClueList(['1-across', '2-down']);
    rp.setCrosswordElement(container);

    rp.handleMessage({
      type: 'presence', session_id: 's1', x: 0, y: 0, entry_id: '1-across', entry_cells: [],
    });
    rp.setLocalEntry('1-across', []);

    expect(container.querySelector('[data-entry-id="1-across"]').hasAttribute('data-remote-entry')).toBe(false);
  });

  it('clears data-remote-entry when the remote session moves to a different clue', () => {
    const rp = new RemotePresence();
    const container = buildClueList(['1-across', '2-down']);
    rp.setCrosswordElement(container);

    rp.handleMessage({
      type: 'presence', session_id: 's1', x: 0, y: 0, entry_id: '1-across', entry_cells: [],
    });
    rp.handleMessage({
      type: 'presence', session_id: 's1', x: 1, y: 1, entry_id: '2-down', entry_cells: [],
    });

    expect(container.querySelector('[data-entry-id="1-across"]').hasAttribute('data-remote-entry')).toBe(false);
    expect(container.querySelector('[data-entry-id="2-down"]').getAttribute('data-remote-entry')).toBe('true');
  });

  it('does nothing when no crossword element has been set', () => {
    const rp = new RemotePresence();
    expect(() => rp.handleMessage({
      type: 'presence', session_id: 's1', x: 0, y: 0, entry_id: '1-across', entry_cells: [],
    })).not.toThrow();
  });
});
