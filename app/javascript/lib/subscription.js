import { createConsumer } from '@rails/actioncable';
import MoveBuffer from './move_buffer';
import generateId from './generate_id';

const spaceOf = (move) => move.space || 'board';

// A batched move carries a list of cells; a single move is one cell.
const actionFor = (move) => (move.cells ? 'move_batch' : 'move');

const createSubscriptions = function createSubscriptions(crossword, room, dimensions, sessionId, onReceiveMove, onInitialState, onPresence, options = {}) {
  const cableUrl = document.querySelector('meta[name="cable-url"]')?.content;
  const cable = createConsumer(cableUrl);
  const moveBuffer = new MoveBuffer(`${crossword}-${room}`);
  const spaces = options.spaces || [];

  const sendMove = function sendMove(ctx, move) {
    try {
      ctx.perform(actionFor(move), move);
    } catch (e) {
      // perform throws iff the socket isn't OPEN -- the move stays buffered
      // and will be retried on the next `connected` callback.
    }
  };

  const queueAndSend = function queueAndSend(ctx, data) {
    const withId = { ...data, id: generateId() };
    moveBuffer.queue(withId);
    sendMove(ctx, withId);
  };

  // Server refused a move because the cell had moved on. Purge any follow-on
  // moves to the same cell -- they'd all be rejected too -- then resync to the
  // server's current value.
  const resync = function resync(space, x, y, value) {
    moveBuffer.removeCell(x, y, space);
    onReceiveMove({ space, x, y, value });
  };

  const moves = cable.subscriptions.create(
    {
      channel: 'MovesChannel', crossword, room, cols: dimensions.cols, rows: dimensions.rows, spaces,
    },
    {
      received: function received(data) {
        if (data.initialState) {
          onInitialState(data.initialState, moveBuffer.getAll(), data.initialSpaces);
          return;
        }
        // A partly-applied batch answers with a broadcast and a rejection under
        // one id, in no guaranteed order, so rejections are matched by flag.
        if (data.rejected) {
          moveBuffer.remove(data.id);
          const cells = data.cells || [{ x: data.x, y: data.y, value: data.value }];
          cells.forEach((cell) => resync(spaceOf(data), cell.x, cell.y, cell.value));
          return;
        }
        if (data.id && moveBuffer.getAll().some((m) => m.id === data.id)) {
          moveBuffer.remove(data.id);
          return;
        }
        onReceiveMove(data);
      },
      move: function move(data) {
        queueAndSend(this, data);
      },
      moveBatch: function moveBatch(data) {
        queueAndSend(this, data);
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
