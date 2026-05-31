import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Crossword } from '@guardian/react-crossword';
import './lib/crossword-overrides.css';
import { createSubscription } from './lib/subscription';
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

const rootStyle = getComputedStyle(document.documentElement);
const selectedBackgroundColor = rootStyle.getPropertyValue('--crossword-selected-color').trim();
const gridBackgroundColor = rootStyle.getPropertyValue('--crossword-grid-background-color').trim();

const crosswordRef = React.createRef();
const onReceiveMove = (move) => { crosswordRef.current.setCellValue(move.x, move.y, move.value); };

const root = createRoot(crosswordElement);
let mounted = false;

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
  // foreignObject is the text input, i.e. HTML embedded in the SVG grid
  crosswordElement.querySelectorAll('g[role="cell"]').forEach(cellGroup => {
    if (cellGroup.querySelector('foreignObject')) {
      cellGroup.setAttribute('data-clue-cell', 'true');
    } else {
      cellGroup.setAttribute('data-black-cell', 'true');
    }
  });
};

const subscription = createSubscription(crosswordIdentifier, room, crosswordData.dimensions, onReceiveMove, (initialState, pendingMoves) => {
  const progress = toProgress(initialState, crosswordData.dimensions);
  // Overlay any moves still waiting on a server ack so the user's pending
  // letters don't briefly disappear when the server's initialState lands.
  pendingMoves.forEach((m) => {
    if (progress[m.x]?.[m.y] === undefined) return;
    if (progress[m.x][m.y] !== m.previousValue) return;
    progress[m.x][m.y] = m.value;
  });

  if (!mounted) {
    mountCrossword(progress, (move) => { subscription.move(move); });
    mounted = true;
  }
  crosswordRef.current.updateGrid(progress);
});
