import React from 'react';
import ReactDOM from 'react-dom';
import Crossword from 'react-crossword';
import '../crossword-overrides.scss';
import { createSubscription } from 'subscription';

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

const crosswordRef = React.createRef();
const onReceiveMove = (move) => { crosswordRef.current.setCellValue(move.x, move.y, move.value, false); };
const onReplayMove = (move) => {
  if (crosswordRef.current.getCellValue(move.x, move.y) === move.previousValue) {
    crosswordRef.current.setCellValue(move.x, move.y, move.value);
  }
};

const subscription = createSubscription(crosswordIdentifier, room, onReceiveMove, onReplayMove, (initialState) => {
  ReactDOM.render(<Crossword
    ref={crosswordRef}
    data={crosswordData}
    loadGrid={() => {}}
    saveGrid={() => {}}
    onMove={(move) => { subscription.move(move); }}
  />, crosswordElement);
  crosswordRef.current.updateGrid(initialState);
});
