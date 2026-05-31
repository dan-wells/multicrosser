import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';
import { createSubscription } from '../subscription';

let performSpy;

vi.mock('@rails/actioncable', () => ({
  createConsumer: () => ({
    subscriptions: {
      create: (_params, mixin) => {
        const ctx = { perform: (...args) => performSpy(...args) };
        return {
          move: (data) => mixin.move.call(ctx, data),
          fireReceived: (data) => mixin.received.call(ctx, data),
          fireConnected: () => mixin.connected.call(ctx),
        };
      },
    },
  }),
}));

const DEFAULT_CROSSWORD = 'crosswords/cryptic/123';
const DEFAULT_ROOM = 'room-x';
const bufferKey = (crossword = DEFAULT_CROSSWORD, room = DEFAULT_ROOM) => `move-buffer-${crossword}-${room}`;

const makeSubscription = (room = DEFAULT_ROOM, crossword = DEFAULT_CROSSWORD) => {
  const onReceiveMove = vi.fn();
  const onInitialState = vi.fn();
  const sub = createSubscription(crossword, room, { cols: 15, rows: 15 }, onReceiveMove, onInitialState);
  return {
    sub, onReceiveMove, onInitialState,
  };
};

describe('createSubscription', () => {
  beforeEach(() => {
    window.localStorage.clear();
    performSpy = vi.fn(() => true);
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
});
