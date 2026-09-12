import { markKey } from './nonogram_logic';

// Convert the server's initial state (cols x rows, sparse, holes as null) into
// a dense cols x rows array of strings.
export function toGrid(initialState, dimensions) {
  return Array.from({ length: dimensions.cols }, (_, x) =>
    Array.from({ length: dimensions.rows }, (_, y) =>
      (initialState[x] && initialState[x][y]) || ''
    )
  );
}

// Overlay moves still waiting on a server ack onto the server's snapshot, so
// work the player has just done does not blink out when it lands.
export function overlayPending(board, pendingMoves, spaces) {
  pendingMoves.forEach((move) => {
    const space = move.space || 'board';
    const cells = move.cells || [{ x: move.x, y: move.y, previousValue: move.previousValue }];

    if (space === 'board') {
      cells.forEach((cell) => {
        if (board[cell.x]?.[cell.y] === undefined) return;
        if (board[cell.x][cell.y] !== (cell.previousValue || '')) return;
        board[cell.x][cell.y] = move.value;
      });
      return;
    }

    const marks = spaces && spaces[space];
    if (!marks) return;
    cells.forEach((cell) => {
      const key = markKey(cell.x, cell.y);
      if ((marks[key] || '') !== (cell.previousValue || '')) return;
      marks[key] = move.value;
    });
  });
}

export default toGrid;
