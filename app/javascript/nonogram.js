import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import './lib/nonogram.css';
import Nonogram from './lib/nonogram_app';
import { createSubscriptions } from './lib/subscription';
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

const onReceiveMove = (move) => {
  if (!controlRef.current) return;
  if (move.batch) {
    controlRef.current.applyBatch(move);
  } else {
    controlRef.current.applyMove(move);
  }
};

const mount = (onMove, onMoveBatch) => {
  flushSync(() => {
    root.render(<Nonogram
      data={data}
      storageKey={`${crosswordIdentifier}-${room}`}
      controlRef={controlRef}
      onMove={onMove}
      onMoveBatch={onMoveBatch}
    />);
  });
};

const { moves: movesSub } = createSubscriptions(
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
        (move) => movesSub.move(move),
        (batch) => movesSub.moveBatch(batch),
      );
      mounted = true;
    }
    controlRef.current.replaceState(board, initialSpaces);
  },
  () => {},
  { spaces: ['row_marks', 'col_marks'] },
);
