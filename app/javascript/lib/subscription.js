import { createConsumer } from '@rails/actioncable';
import MoveBuffer from './move_buffer';

const generateMoveId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const createSubscription = function createSubscription(crossword, room, dimensions, onReceiveMove, onInitialState) {
  const cableUrl = document.querySelector('meta[name="cable-url"]')?.content;
  const cable = createConsumer(cableUrl);
  const moveBuffer = new MoveBuffer(`${crossword}-${room}`);

  const send = function send(ctx, move) {
    try {
      ctx.perform('move', move);
    } catch (e) {
      // perform throws iff the socket isn't OPEN -- the move stays buffered
      // and will be retried on the next `connected` callback.
    }
  };

  return cable.subscriptions.create(
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
        const moveWithId = { ...data, id: generateMoveId() };
        moveBuffer.queue(moveWithId);
        send(this, moveWithId);
      },
      connected: function connected() {
        moveBuffer.getAll().forEach((m) => send(this, m));
      },
    },
  );
};

export { createSubscription };
