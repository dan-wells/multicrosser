import { createConsumer } from '@rails/actioncable';
import MoveBuffer from './move_buffer';
import generateId from './generate_id';

const createSubscriptions = function createSubscriptions(crossword, room, dimensions, sessionId, onReceiveMove, onInitialState, onPresence) {
  const cableUrl = document.querySelector('meta[name="cable-url"]')?.content;
  const cable = createConsumer(cableUrl);
  const moveBuffer = new MoveBuffer(`${crossword}-${room}`);

  const sendMove = function sendMove(ctx, move) {
    try {
      ctx.perform('move', move);
    } catch (e) {
      // perform throws iff the socket isn't OPEN -- the move stays buffered
      // and will be retried on the next `connected` callback.
    }
  };

  const moves = cable.subscriptions.create(
    { channel: 'MovesChannel', crossword, room, cols: dimensions.cols, rows: dimensions.rows },
    {
      received: function received(data) {
        if (data.initialState) {
          onInitialState(data.initialState, moveBuffer.getAll());
        } else if (data.id && moveBuffer.getAll().some((m) => m.id === data.id)) {
          moveBuffer.remove(data.id);
          if (data.rejected) {
            // Server refused our move because the cell had moved on.
            // Purge any follow-on moves to the same cell -- they'd all be
            // rejected too -- then resync to the server's current value.
            moveBuffer.removeCell(data.x, data.y);
            onReceiveMove({ x: data.x, y: data.y, value: data.value });
          }
        } else {
          onReceiveMove(data);
        }
      },
      move: function move(data) {
        const moveWithId = { ...data, id: generateId() };
        moveBuffer.queue(moveWithId);
        sendMove(this, moveWithId);
      },
      connected: function connected() {
        moveBuffer.getAll().forEach((m) => sendMove(this, m));
      },
    },
  );

  const presence = cable.subscriptions.create(
    { channel: 'PresenceChannel', crossword, room, session_id: sessionId },
    {
      received: function received(data) {
        // Server filters its own snapshot, but still broadcasts our cursor
        // updates back to us. Drop the echoes here.
        if (data.session_id === sessionId) return;
        onPresence(data);
      },
      cursor: function cursor(data) {
        try {
          this.perform('cursor', data);
        } catch (e) {
          // Stale cursor isn't worth retrying -- it'll be superseded by the next move.
        }
      },
    },
  );

  return { moves, presence };
};

export { createSubscriptions };
