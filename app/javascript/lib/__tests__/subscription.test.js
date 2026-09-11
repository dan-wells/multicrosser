import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';
import { createSubscriptions } from '../subscription';

let performSpy;
let createdParams;

vi.mock('@rails/actioncable', () => ({
  createConsumer: () => ({
    subscriptions: {
      create: (params, mixin) => {
        createdParams.push(params);
        const ctx = { perform: (...args) => performSpy(...args) };
        return {
          move: mixin.move ? (data) => mixin.move.call(ctx, data) : undefined,
          moveBatch: mixin.moveBatch ? (data) => mixin.moveBatch.call(ctx, data) : undefined,
          cursor: mixin.cursor ? (data) => mixin.cursor.call(ctx, data) : undefined,
          fireReceived: (data) => mixin.received.call(ctx, data),
          fireConnected: mixin.connected ? () => mixin.connected.call(ctx) : undefined,
        };
      },
    },
  }),
}));

const DEFAULT_CROSSWORD = 'crosswords/cryptic/123';
const DEFAULT_ROOM = 'room-x';
const bufferKey = (crossword = DEFAULT_CROSSWORD, room = DEFAULT_ROOM) => `move-buffer-${crossword}-${room}`;

const makeSubscription = (room = DEFAULT_ROOM, crossword = DEFAULT_CROSSWORD, options = undefined) => {
  const onReceiveMove = vi.fn();
  const onInitialState = vi.fn();
  const onPresence = vi.fn();
  const { moves, presence } = createSubscriptions(crossword, room, { cols: 15, rows: 15 }, 'test-session', onReceiveMove, onInitialState, onPresence, options);
  // `sub` keeps the moves subscription for the legacy move-focused tests below.
  return {
    sub: moves, moves, presence, onReceiveMove, onInitialState, onPresence,
  };
};

describe('createSubscriptions', () => {
  beforeEach(() => {
    window.localStorage.clear();
    performSpy = vi.fn(() => true);
    createdParams = [];
  });

  it('assigns an id, buffers the move, and forwards it via perform', () => {
    const { sub } = makeSubscription();
    sub.move({
      x: 1, y: 2, value: 'A', previousValue: '',
    });

    expect(performSpy).toHaveBeenCalledTimes(1);
    const [action, payload] = performSpy.mock.calls[0];
    expect(action).toBe('move');
    expect(payload).toMatchObject({
      x: 1, y: 2, value: 'A', previousValue: '',
    });
    expect(typeof payload.id).toBe('string');
    expect(payload.id.length).toBeGreaterThan(0);

    const buffered = JSON.parse(window.localStorage.getItem(bufferKey()));
    expect(buffered).toHaveLength(1);
    expect(buffered[0].id).toBe(payload.id);
  });

  it('assigns distinct ids to successive moves', () => {
    const { sub } = makeSubscription();
    sub.move({
      x: 0, y: 0, value: 'A', previousValue: '',
    });
    sub.move({
      x: 1, y: 0, value: 'B', previousValue: '',
    });
    const [first, second] = performSpy.mock.calls.map((c) => c[1]);
    expect(first.id).not.toBe(second.id);
  });

  it('generates an id without depending on crypto.randomUUID (works in non-secure contexts)', () => {
    // Simulate a non-secure context (e.g. phone hitting a desktop's LAN IP
    // over plain HTTP) where crypto.randomUUID is undefined.
    const restore = vi.stubGlobal('crypto', {});
    try {
      const { sub } = makeSubscription();
      expect(() => sub.move({
        x: 0, y: 0, value: 'A', previousValue: '',
      })).not.toThrow();
      const [, payload] = performSpy.mock.calls[0];
      expect(typeof payload.id).toBe('string');
      expect(payload.id.length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
      if (restore && typeof restore === 'function') restore();
    }
  });

  it('keeps the move buffered even if perform throws', () => {
    performSpy = vi.fn(() => { throw new Error('socket closed'); });
    const { sub } = makeSubscription();
    expect(() => sub.move({
      x: 0, y: 0, value: 'A', previousValue: '',
    })).not.toThrow();
    const buffered = JSON.parse(window.localStorage.getItem(bufferKey()));
    expect(buffered).toHaveLength(1);
  });

  it('removes the matching buffered entry on echo (ack) and does NOT call onReceiveMove', () => {
    const { sub, onReceiveMove } = makeSubscription();
    sub.move({
      x: 3, y: 4, value: 'Z', previousValue: '',
    });
    const buffered = JSON.parse(window.localStorage.getItem(bufferKey()));
    const ackedId = buffered[0].id;

    sub.fireReceived({
      id: ackedId, x: 3, y: 4, value: 'Z',
    });

    expect(onReceiveMove).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(bufferKey()))).toEqual([]);
  });

  it('on rejection: removes the buffered entry AND surfaces the server value via onReceiveMove', () => {
    const { sub, onReceiveMove } = makeSubscription();
    sub.move({
      x: 3, y: 4, value: 'T', previousValue: '',
    });
    const buffered = JSON.parse(window.localStorage.getItem(bufferKey()));
    const rejectedId = buffered[0].id;

    sub.fireReceived({
      id: rejectedId, rejected: true, x: 3, y: 4, value: 'K',
    });

    expect(JSON.parse(window.localStorage.getItem(bufferKey()))).toEqual([]);
    expect(onReceiveMove).toHaveBeenCalledTimes(1);
    expect(onReceiveMove).toHaveBeenCalledWith(expect.objectContaining({
      x: 3, y: 4, value: 'K',
    }));
  });

  it('on rejection: also purges other buffered moves to the same cell', () => {
    const { sub } = makeSubscription();
    sub.move({
      x: 3, y: 4, value: 'A', previousValue: '',
    });
    sub.move({
      x: 3, y: 4, value: 'B', previousValue: 'A',
    });

    const buffered = JSON.parse(window.localStorage.getItem(bufferKey()));
    const rejectedId = buffered[0].id;

    sub.fireReceived({
      id: rejectedId, rejected: true, x: 3, y: 4, value: 'K',
    });

    expect(JSON.parse(window.localStorage.getItem(bufferKey()))).toEqual([]);
  });

  it('treats a broadcast with no buffered match as a remote move', () => {
    const { sub, onReceiveMove } = makeSubscription();
    sub.fireReceived({
      id: 'someone-else', x: 5, y: 6, value: 'Q',
    });
    expect(onReceiveMove).toHaveBeenCalledWith({
      id: 'someone-else', x: 5, y: 6, value: 'Q',
    });
  });

  it('treats a broadcast with no id at all as a remote move', () => {
    const { sub, onReceiveMove } = makeSubscription();
    sub.fireReceived({ x: 5, y: 6, value: 'Q' });
    expect(onReceiveMove).toHaveBeenCalledWith({ x: 5, y: 6, value: 'Q' });
  });

  it('preserves previousValue in the pendingMoves snapshot passed to onInitialState', () => {
    const { sub, onInitialState } = makeSubscription();
    sub.move({
      x: 2, y: 3, value: 'A', previousValue: 'X',
    });

    const grid = Array.from({ length: 20 }, () => Array(20).fill(null));
    sub.fireReceived({ initialState: grid });

    const [, pendingMoves] = onInitialState.mock.calls[0];
    expect(pendingMoves[0]).toMatchObject({ x: 2, y: 3, value: 'A', previousValue: 'X' });
  });

  it('forwards initialState along with a snapshot of the buffered moves', () => {
    const { sub, onInitialState } = makeSubscription();
    sub.move({
      x: 0, y: 0, value: 'A', previousValue: '',
    });
    sub.move({
      x: 1, y: 0, value: 'B', previousValue: '',
    });

    const grid = Array.from({ length: 20 }, () => Array(20).fill(null));
    sub.fireReceived({ initialState: grid });

    expect(onInitialState).toHaveBeenCalledTimes(1);
    const [passedGrid, passedPending] = onInitialState.mock.calls[0];
    expect(passedGrid).toBe(grid);
    expect(passedPending).toHaveLength(2);
    expect(passedPending.map((m) => m.value)).toEqual(['A', 'B']);
  });

  it('resends every buffered move on connected() without clearing the buffer', () => {
    const { sub } = makeSubscription();
    sub.move({
      x: 0, y: 0, value: 'A', previousValue: '',
    });
    sub.move({
      x: 1, y: 0, value: 'B', previousValue: '',
    });
    performSpy.mockClear();

    sub.fireConnected();

    expect(performSpy).toHaveBeenCalledTimes(2);
    expect(performSpy.mock.calls.map((c) => c[1].value)).toEqual(['A', 'B']);
    const buffered = JSON.parse(window.localStorage.getItem(bufferKey()));
    expect(buffered).toHaveLength(2);
  });

  it('chained: a move buffered while perform throws is resent on the next connected()', () => {
    performSpy = vi.fn(() => { throw new Error('socket closed'); });
    const { sub } = makeSubscription();
    sub.move({
      x: 0, y: 0, value: 'A', previousValue: '',
    });

    // perform threw, so nothing reached the server, but the move stayed buffered.
    const bufferedAfterFailedSend = JSON.parse(window.localStorage.getItem(bufferKey()));
    expect(bufferedAfterFailedSend).toHaveLength(1);
    const queuedId = bufferedAfterFailedSend[0].id;

    // Socket recovers; perform now succeeds.
    performSpy = vi.fn(() => true);
    sub.fireConnected();

    expect(performSpy).toHaveBeenCalledTimes(1);
    const [action, payload] = performSpy.mock.calls[0];
    expect(action).toBe('move');
    expect(payload.id).toBe(queuedId);
    expect(payload).toMatchObject({
      x: 0, y: 0, value: 'A', previousValue: '',
    });
  });

  it('rapid same-cell moves before either acks: both reach the server with distinct ids', () => {
    const { sub } = makeSubscription();
    sub.move({
      x: 4, y: 5, value: 'A', previousValue: '',
    });
    sub.move({
      x: 4, y: 5, value: 'B', previousValue: 'A',
    });

    expect(performSpy).toHaveBeenCalledTimes(2);
    const [first, second] = performSpy.mock.calls.map((c) => c[1]);
    expect(first.id).not.toBe(second.id);
    expect(first.value).toBe('A');
    expect(second.value).toBe('B');
    // The second move's previousValue chains off the first, so the server can
    // freshness-check the sequence rather than treating them as independent.
    expect(second.previousValue).toBe('A');

    const buffered = JSON.parse(window.localStorage.getItem(bufferKey()));
    expect(buffered.map((m) => m.value)).toEqual(['A', 'B']);
  });

  it('rapid same-cell: ack for the first move leaves the second buffered', () => {
    const { sub, onReceiveMove } = makeSubscription();
    sub.move({
      x: 4, y: 5, value: 'A', previousValue: '',
    });
    sub.move({
      x: 4, y: 5, value: 'B', previousValue: 'A',
    });
    const [firstId, secondId] = JSON.parse(
      window.localStorage.getItem(bufferKey()),
    ).map((m) => m.id);

    sub.fireReceived({
      id: firstId, x: 4, y: 5, value: 'A',
    });

    expect(onReceiveMove).not.toHaveBeenCalled();
    const remaining = JSON.parse(window.localStorage.getItem(bufferKey()));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(secondId);
    expect(remaining[0].value).toBe('B');
  });

  it('isolates buffers across crosswords that share a room name', () => {
    // Two tabs: same room name "dan", different puzzles.
    const { sub: subA } = makeSubscription('dan', 'quiptic/1');
    subA.move({
      x: 0, y: 0, value: 'A', previousValue: '',
    });

    performSpy.mockClear();
    const { sub: subB } = makeSubscription('dan', 'cryptic/5');
    // subB should not see subA's buffered move on reconnect.
    subB.fireConnected();

    expect(performSpy).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(bufferKey('cryptic/5', 'dan')))).toEqual(null);
    expect(JSON.parse(window.localStorage.getItem(bufferKey('quiptic/1', 'dan')))).toHaveLength(1);
  });

  // --- batched moves and value spaces -----------------------------------

  it('sends a batch through the move_batch action with a single id', () => {
    const { moves } = makeSubscription();
    moves.moveBatch({
      space: 'board',
      value: '1',
      cells: [{ x: 1, y: 1, previousValue: '' }, { x: 1, y: 2, previousValue: '' }],
    });

    expect(performSpy).toHaveBeenCalledTimes(1);
    const [action, payload] = performSpy.mock.calls[0];
    expect(action).toBe('move_batch');
    expect(payload.cells).toHaveLength(2);
    expect(typeof payload.id).toBe('string');
  });

  it('buffers a batch as one entry and replays it as a batch on reconnect', () => {
    const { moves } = makeSubscription();
    moves.moveBatch({ space: 'board', value: '1', cells: [{ x: 1, y: 1, previousValue: '' }] });
    performSpy.mockClear();

    moves.fireConnected();

    expect(performSpy).toHaveBeenCalledTimes(1);
    expect(performSpy.mock.calls[0][0]).toBe('move_batch');
  });

  it('asks for the extra spaces when the caller names them', () => {
    makeSubscription(DEFAULT_ROOM, DEFAULT_CROSSWORD, { spaces: ['row_marks', 'col_marks'] });

    expect(createdParams[0].spaces).toEqual(['row_marks', 'col_marks']);
  });

  it('asks for no spaces by default, as crosswords have none', () => {
    makeSubscription();

    expect(createdParams[0].spaces).toEqual([]);
  });

  it('hands the initial spaces to the caller alongside the board', () => {
    const { moves, onInitialState } = makeSubscription();
    const spaces = { row_marks: { '3-1': '1' }, col_marks: {} };

    moves.fireReceived({ initialState: [[]], initialSpaces: spaces });

    expect(onInitialState).toHaveBeenCalledWith([[]], [], spaces);
  });

  it('resyncs every rejected cell of a batch and leaves the rest applied', () => {
    const { moves, onReceiveMove } = makeSubscription();
    moves.moveBatch({
      space: 'board',
      value: '1',
      cells: [{ x: 1, y: 1, previousValue: '' }, { x: 1, y: 2, previousValue: '' }],
    });
    const { id } = performSpy.mock.calls[0][1];

    moves.fireReceived({ id, rejected: true, batch: true, cells: [{ x: 1, y: 2, value: 'x' }] });

    expect(onReceiveMove).toHaveBeenCalledTimes(1);
    expect(onReceiveMove).toHaveBeenCalledWith({
      space: 'board', x: 1, y: 2, value: 'x',
    });
    expect(JSON.parse(window.localStorage.getItem(bufferKey()))).toHaveLength(0);
  });

  it('routes a rejection in a mark space back under that space', () => {
    const { moves, onReceiveMove } = makeSubscription();
    moves.move({
      space: 'row_marks', x: 3, y: 1, value: '1', previousValue: '',
    });
    const { id } = performSpy.mock.calls[0][1];

    moves.fireReceived({
      id, rejected: true, space: 'row_marks', x: 3, y: 1, value: '',
    });

    expect(onReceiveMove).toHaveBeenCalledWith({
      space: 'row_marks', x: 3, y: 1, value: '',
    });
  });

  it('passes an incoming batch straight through to the caller', () => {
    const { moves, onReceiveMove } = makeSubscription();
    const batch = { id: 'someone-else', batch: true, value: '1', cells: [{ x: 0, y: 0 }] };

    moves.fireReceived(batch);

    expect(onReceiveMove).toHaveBeenCalledWith(batch);
  });
});