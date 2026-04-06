import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Crossword } from '@guardian/react-crossword';
import './lib/crossword-overrides.css';
import { createSubscription } from './lib/subscription';

const crosswordElement = document.getElementsByClassName('js-crossword')[0];

const { crossword, crosswordIdentifier, room } = crosswordElement.dataset;
const crosswordData = JSON.parse(crossword);

const [series, identifier] = crosswordIdentifier.split('/');

localStorage.setItem('last-series', series);
localStorage.setItem('last-puzzle', identifier);

// Per-series puzzle history, cap at 5
const puzzles = JSON.parse(localStorage.getItem('previous-puzzles-' + series) || '[]');
localStorage.setItem('previous-puzzles-' + series, JSON.stringify(
  [identifier, ...puzzles.filter(p => p !== identifier)].slice(0, 5)
));

// Room history -- save named rooms only, skip random hex IDs like a3f9c1
if (room && !/^[0-9a-f]{6,8}$/.test(room)) {
  localStorage.setItem('last-room', room);
  const rooms = JSON.parse(localStorage.getItem('previous-rooms') || '[]');
  localStorage.setItem('previous-rooms', JSON.stringify(
    [room, ...rooms.filter(r => r !== room)].slice(0, 5)
  ));
}

// Convert server initial state (20x20 array with nulls) to Progress format
// (dimensions.cols x dimensions.rows array with empty strings)
function toProgress(initialState, dimensions) {
  return Array.from({ length: dimensions.cols }, (_, x) =>
    Array.from({ length: dimensions.rows }, (_, y) =>
      (initialState[x] && initialState[x][y]) || ''
    )
  );
}

const crosswordRef = React.createRef();
const onReceiveMove = (move) => { crosswordRef.current.setCellValue(move.x, move.y, move.value); };
const onReplayMove = (move) => {
  if (crosswordRef.current.getCellValue(move.x, move.y) === move.previousValue) {
    crosswordRef.current.setCellValue(move.x, move.y, move.value);
  }
};

const root = createRoot(crosswordElement);
const subscription = createSubscription(crosswordIdentifier, room, onReceiveMove, onReplayMove, (initialState) => {
  const progress = toProgress(initialState, crosswordData.dimensions);
  // flushSync ensures the component is mounted synchronously so crosswordRef.current
  // is populated before updateGrid is called (root.render is async in React 18)
  flushSync(() => {
    root.render(<Crossword
      ref={crosswordRef}
      data={crosswordData}
      progress={progress}
      onMove={(move) => { subscription.move(move); }}
    />);
  });
  crosswordRef.current.updateGrid(progress);
});
