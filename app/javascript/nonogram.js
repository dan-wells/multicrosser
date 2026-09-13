import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import './lib/nonogram.css';
import './lib/nonogram-overrides.css';
import Nonogram from './lib/nonogram_app';
import { createSubscriptions } from './lib/subscription';
import RemotePresence from './lib/remote_presence';
import { toGrid, overlayPending } from './lib/grid';
import sessionIdFor from './lib/session_id';
import createCursorSender from './lib/cursor_sender';
import { recordSeries, recordPuzzle, recordRoom } from './lib/history_storage';

const nonogramElement = document.getElementsByClassName('js-nonogram')[0];

const { crossword, crosswordIdentifier, room, randomPath } = nonogramElement.dataset;
const data = JSON.parse(crossword);

const [series, identifier] = crosswordIdentifier.split('/');

recordSeries(series);
recordPuzzle(series, identifier);
recordRoom(room);

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
      randomPath={randomPath}
      controlRef={controlRef}
      onMoveBatch={onMoveBatch}
      onCursor={onCursor}
    />);
  });
  buildCellMap();
};

const sendCursor = createCursorSender((payload) => presenceSub.cursor(payload));

const { moves: movesSub, presence: presenceSub } = createSubscriptions(
  crosswordIdentifier,
  room,
  data.dimensions,
  sessionIdFor(),
  onReceiveMove,
  (initialState, pendingMoves, initialSpaces) => {
    const board = toGrid(initialState, data.dimensions);
    const spaces = {
      row_marks: { ...(initialSpaces && initialSpaces.row_marks) },
      col_marks: { ...(initialSpaces && initialSpaces.col_marks) },
    };
    overlayPending(board, pendingMoves, spaces);

    if (!mounted) {
      mount(
        (batch) => movesSub.moveBatch(batch),
        sendCursor,
      );
      mounted = true;
    }
    controlRef.current.replaceState(board, spaces);
    remotePresence.apply();
  },
  (msg) => { remotePresence.handleMessage(msg); },
  { spaces: ['row_marks', 'col_marks'] },
);
