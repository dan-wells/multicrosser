import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Crossword } from '@guardian/react-crossword';
import './lib/crossword-overrides.css';
import { createSubscriptions } from './lib/subscription';
import RemotePresence from './lib/remote_presence';
import generateId from './lib/generate_id';
import { recordSeries, recordPuzzle, recordRoom } from './lib/history_storage';

const crosswordElement = document.getElementsByClassName('js-crossword')[0];

const { crossword, crosswordIdentifier, room } = crosswordElement.dataset;
const crosswordData = JSON.parse(crossword);

const [series, identifier] = crosswordIdentifier.split('/');

// Update localStorage for current puzzle
recordSeries(series);
recordPuzzle(series, identifier);
recordRoom(room);

// Convert server initial state (cols x rows array with nulls) to Progress format
// (dimensions.cols x dimensions.rows array with empty strings)
function toProgress(initialState, dimensions) {
  return Array.from({ length: dimensions.cols }, (_, x) =>
    Array.from({ length: dimensions.rows }, (_, y) =>
      (initialState[x] && initialState[x][y]) || ''
    )
  );
}

// Per-tab session ID for presence. sessionStorage means a reload reuses the
// same id; a new tab gets a new one (each tab is an independent cursor).
function getSessionId() {
  try {
    let id = sessionStorage.getItem('crossword-session-id');
    if (!id) {
      id = generateId();
      sessionStorage.setItem('crossword-session-id', id);
    }
    return id;
  } catch (e) {
    return generateId();
  }
}
const sessionId = getSessionId();

// Map of entry id -> array of [x, y] cells. Computed once from crosswordData so
// we can resolve "selected clue -> cells" without inspecting DOM tinting (which
// would feed back on itself once we paint remote-clue highlights on the grid).
const entryCellsById = new Map();
(crosswordData.entries || []).forEach((entry) => {
  const cells = [];
  const dx = entry.direction === 'across' ? 1 : 0;
  const dy = entry.direction === 'down' ? 1 : 0;
  for (let i = 0; i < entry.length; i += 1) {
    cells.push([entry.position.x + dx * i, entry.position.y + dy * i]);
  }
  entryCellsById.set(entry.id, cells);
});

const rootStyle = getComputedStyle(document.documentElement);
const selectedBackgroundColor = rootStyle.getPropertyValue('--crossword-selected-color').trim();
const gridBackgroundColor = rootStyle.getPropertyValue('--crossword-grid-background-color').trim();

const crosswordRef = React.createRef();
const onReceiveMove = (move) => { crosswordRef.current.setCellValue(move.x, move.y, move.value); };

const remotePresence = new RemotePresence();
remotePresence.setCrosswordElement(crosswordElement);

const root = createRoot(crosswordElement);
let mounted = false;
let cellMap = new Map(); // "x-y" -> g element
let cellByElement = new WeakMap(); // g element -> "x-y"

const mountCrossword = (progress, onMove) => {
  // flushSync ensures the component is mounted synchronously so crosswordRef.current
  // is populated before updateGrid is called (root.render is async in React 18)
  flushSync(() => {
    root.render(<Crossword
      ref={crosswordRef}
      data={crosswordData}
      progress={progress}
      onMove={onMove}
      selectedBackgroundColor={selectedBackgroundColor}
      gridBackgroundColor={gridBackgroundColor}
    />);
  });

  // Tag clue and black cells so CSS can scope focus highlighting to each;
  // foreignObject is the text input, i.e. HTML embedded in the SVG grid.
  // Also build a coordinate map -- cell ids are `cell-group-{x}-{y}-{id}`.
  cellMap = new Map();
  cellByElement = new WeakMap();
  crosswordElement.querySelectorAll('g[role="cell"]').forEach(cellGroup => {
    if (cellGroup.querySelector('foreignObject')) {
      cellGroup.setAttribute('data-clue-cell', 'true');
    } else {
      cellGroup.setAttribute('data-black-cell', 'true');
    }
    const match = /^cell-group-(\d+)-(\d+)-/.exec(cellGroup.id || '');
    if (match) {
      const key = `${match[1]}-${match[2]}`;
      cellMap.set(key, cellGroup);
      cellByElement.set(cellGroup, key);
    }
  });
  remotePresence.setCellMap(cellMap);
  setupClueColumnLayout();
};

// Tag the clue column with whether the upstream container query has put
// the Across/Down lists side-by-side or stacked, so our CSS can give each
// listbox half-viewport (stacked) vs full-viewport (side-by-side) caps.
function setupClueColumnLayout() {
  const firstListbox = crosswordElement.querySelector('[role="listbox"]');
  if (!firstListbox) return;
  const clueColumn = firstListbox.parentElement.parentElement;
  const update = () => {
    const direction = getComputedStyle(clueColumn).flexDirection;
    clueColumn.dataset.cluesLayout = direction === 'row' ? 'row' : 'stacked';
  };
  const observer = new ResizeObserver(update);
  observer.observe(crosswordElement);
  update();
}

const { moves: movesSub, presence: presenceSub } = createSubscriptions(
  crosswordIdentifier,
  room,
  crosswordData.dimensions,
  sessionId,
  onReceiveMove,
  (initialState, pendingMoves) => {
    const progress = toProgress(initialState, crosswordData.dimensions);
    // Overlay any moves still waiting on a server ack so the user's pending
    // letters don't briefly disappear when the server's initialState lands.
    pendingMoves.forEach((m) => {
      if (progress[m.x]?.[m.y] === undefined) return;
      if (progress[m.x][m.y] !== m.previousValue) return;
      progress[m.x][m.y] = m.value;
    });

    if (!mounted) {
      mountCrossword(progress, (move) => { movesSub.move(move); });
      mounted = true;
      installCursorTracking();
    }
    crosswordRef.current.updateGrid(progress);
    remotePresence.apply();
  },
  (msg) => { remotePresence.handleMessage(msg); },
);

// --- Outgoing cursor tracking -------------------------------------------------
// Detect our own cursor cell (from focus) and selected clue (from the clue list's
// aria-selected option) and broadcast the new state.

let lastCursorPayload = null;
let cursorDebounce = null;

function currentCursorCell() {
  const active = document.activeElement;
  if (!active) return null;
  const cell = active.closest('g[role="cell"]');
  if (!cell || !crosswordElement.contains(cell)) return null;
  const key = cellByElement.get(cell);
  if (!key) return null;
  const [x, y] = key.split('-').map(Number);
  return { x, y };
}

function currentSelectedEntry() {
  const option = crosswordElement.querySelector('[role="option"][aria-selected="true"][data-entry-id]');
  if (!option) return null;
  const id = option.getAttribute('data-entry-id');
  const cells = entryCellsById.get(id);
  if (!cells) return null;
  return { id, cells };
}

// Apply the local user's selected clue to RemotePresence synchronously, so the
// remote-clue blue tint flips in/out of cells the moment Guardian re-renders,
// rather than after cursor update debounce.
function applyLocalEntry() {
  const entry = currentSelectedEntry();
  if (entry) {
    remotePresence.setLocalEntry(entry.id, entry.cells);
  } else {
    remotePresence.setLocalEntry(null, []);
  }
}

function sendCursor() {
  const cursor = currentCursorCell();
  if (!cursor) return;
  const entry = currentSelectedEntry();
  const entryId = entry ? entry.id : null;
  const entryCells = entry ? entry.cells : [];
  const payload = { x: cursor.x, y: cursor.y, entry_id: entryId, entry_cells: entryCells };
  const serialized = JSON.stringify(payload);
  if (serialized === lastCursorPayload) return;
  lastCursorPayload = serialized;
  presenceSub.cursor(payload);
}

function scheduleCursorUpdate() {
  applyLocalEntry();
  if (cursorDebounce) clearTimeout(cursorDebounce);
  cursorDebounce = setTimeout(() => {
    cursorDebounce = null;
    sendCursor();
  }, 50);
}

function installCursorTracking() {
  crosswordElement.addEventListener('focusin', scheduleCursorUpdate);
  crosswordElement.addEventListener('click', scheduleCursorUpdate);

  // The clue list's aria-selected option changes when the user toggles between
  // intersecting across/down entries without moving the cursor cell; watch the
  // listboxes so we catch that case too.
  crosswordElement.querySelectorAll('[role="listbox"]').forEach((listbox) => {
    const observer = new MutationObserver(scheduleCursorUpdate);
    observer.observe(listbox, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
  });
}
