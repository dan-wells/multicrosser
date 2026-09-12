import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import './lib/nonogram.css';
import './lib/nonogram-overrides.css';
import Nonogram from './lib/nonogram_app';
import { createSubscriptions } from './lib/subscription';
import RemotePresence from './lib/remote_presence';
import { toGrid } from './lib/grid';
import generateId from './lib/generate_id';
import { recordSeries, recordPuzzle, recordRoom } from './lib/history_storage';

const nonogramElement = document.getElementsByClassName('js-nonogram')[0];

const { crossword, crosswordIdentifier, room } = nonogramElement.dataset;
const data = JSON.parse(crossword);

const [series, identifier] = crosswordIdentifier.split('/');

recordSeries(series);
recordPuzzle(series, identifier);
recordRoom(room);

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

const controlRef = React.createRef();
const root = createRoot(nonogramElement);
let mounted = false;

const remotePresence = new RemotePresence();

const onReceiveMove = (move) => {
  if (!controlRef.current) return;
  if (move.batch) {
    controlRef.current.applyBatch(move);
  } else {
    controlRef.current.applyMove(move);
  }
};

// React keys every cell group by its coordinates, so the elements survive
// re-renders and the map only has to be built once.
const buildCellMap = () => {
  const cellMap = new Map();
  nonogramElement.querySelectorAll('[data-cell]').forEach((group) => {
    cellMap.set(group.dataset.cell, group);
  });
  remotePresence.setCellMap(cellMap);

  const stripMap = new Map();
  nonogramElement.querySelectorAll('[data-strip]').forEach((strip) => {
    stripMap.set(strip.dataset.strip, strip);
  });
  remotePresence.setStripMap(stripMap);
};

const mount = (onMoveBatch, onCursor) => {
  flushSync(() => {
    root.render(<Nonogram
      data={data}
      storageKey={`${crosswordIdentifier}-${room}`}
      randomPath={`/${series}/random/${room}`}
      controlRef={controlRef}
      onMoveBatch={onMoveBatch}
      onCursor={onCursor}
    />);
  });
  buildCellMap();
};

let lastCursorPayload = null;
let cursorDebounce = null;

const sendCursor = (presenceSub, payload) => {
  const serialized = JSON.stringify(payload);
  if (serialized === lastCursorPayload) return;
  lastCursorPayload = serialized;
  if (cursorDebounce) clearTimeout(cursorDebounce);
  cursorDebounce = setTimeout(() => {
    cursorDebounce = null;
    presenceSub.cursor(payload);
  }, 50);
};

const { moves: movesSub, presence: presenceSub } = createSubscriptions(
  crosswordIdentifier,
  room,
  data.dimensions,
  getSessionId(),
  onReceiveMove,
  (initialState, pendingMoves, initialSpaces) => {
    const board = toGrid(initialState, data.dimensions);
    // Overlay anything still waiting on a server ack, so a stroke the player
    // has just drawn does not blink out when the server's snapshot lands.
    pendingMoves.forEach((move) => {
      if (move.space && move.space !== 'board') return;
      const cells = move.cells || [{ x: move.x, y: move.y, previousValue: move.previousValue }];
      cells.forEach((cell) => {
        if (board[cell.x]?.[cell.y] === undefined) return;
        if (board[cell.x][cell.y] !== (cell.previousValue || '')) return;
        board[cell.x][cell.y] = move.value;
      });
    });

    if (!mounted) {
      mount(
        (batch) => movesSub.moveBatch(batch),
        (payload) => sendCursor(presenceSub, payload),
      );
      mounted = true;
    }
    controlRef.current.replaceState(board, initialSpaces);
    remotePresence.apply();
  },
  (msg) => { remotePresence.handleMessage(msg); },
  { spaces: ['row_marks', 'col_marks'] },
);
