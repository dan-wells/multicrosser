import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import createCursorSender from '../cursor_sender';

describe('createCursorSender', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sends one payload for a burst of moves', () => {
    const send = vi.fn();
    const schedule = createCursorSender(send);

    schedule({ x: 1, y: 1 });
    schedule({ x: 2, y: 2 });
    schedule({ x: 3, y: 3 });
    vi.runAllTimers();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ x: 3, y: 3 });
  });

  it('drops a payload identical to the one already sent', () => {
    const send = vi.fn();
    const schedule = createCursorSender(send);

    schedule({ x: 1, y: 1 });
    vi.runAllTimers();
    schedule({ x: 1, y: 1 });
    vi.runAllTimers();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('builds the payload when the timer fires, not when it is scheduled', () => {
    const send = vi.fn();
    const schedule = createCursorSender(send);
    let cursor = { x: 1, y: 1 };

    schedule(() => cursor);
    cursor = { x: 4, y: 4 };
    vi.runAllTimers();

    expect(send).toHaveBeenCalledWith({ x: 4, y: 4 });
  });

  it('sends nothing when the builder finds no cursor', () => {
    const send = vi.fn();
    const schedule = createCursorSender(send);

    schedule(() => null);
    vi.runAllTimers();

    expect(send).not.toHaveBeenCalled();
  });
});
