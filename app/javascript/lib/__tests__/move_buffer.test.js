import { describe, it, expect, beforeEach } from 'vitest';
import MoveBuffer from '../move_buffer';

describe('MoveBuffer', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns an empty array for an unseen key', () => {
    const buf = new MoveBuffer('room-1');
    expect(buf.getAll()).toEqual([]);
  });

  it('queues moves and returns them in insertion order', () => {
    const buf = new MoveBuffer('room-1');
    buf.queue({ id: 'a', x: 0, y: 0, value: 'A' });
    buf.queue({ id: 'b', x: 1, y: 0, value: 'B' });
    buf.queue({ id: 'c', x: 2, y: 0, value: 'C' });
    expect(buf.getAll().map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('removes only the entry with the matching id', () => {
    const buf = new MoveBuffer('room-1');
    buf.queue({ id: 'a', x: 0, y: 0, value: 'A' });
    buf.queue({ id: 'b', x: 1, y: 0, value: 'B' });
    buf.queue({ id: 'c', x: 2, y: 0, value: 'C' });
    buf.remove('b');
    expect(buf.getAll().map((m) => m.id)).toEqual(['a', 'c']);
  });

  it('is a no-op when removing an id that is not present', () => {
    const buf = new MoveBuffer('room-1');
    buf.queue({ id: 'a', x: 0, y: 0, value: 'A' });
    buf.remove('does-not-exist');
    expect(buf.getAll().map((m) => m.id)).toEqual(['a']);
  });

  it('persists across instances sharing a key', () => {
    new MoveBuffer('room-1').queue({ id: 'a', x: 0, y: 0, value: 'A' });
    const fresh = new MoveBuffer('room-1');
    expect(fresh.getAll().map((m) => m.id)).toEqual(['a']);
  });

  it('isolates buffers across keys', () => {
    new MoveBuffer('room-1').queue({ id: 'a', x: 0, y: 0, value: 'A' });
    expect(new MoveBuffer('room-2').getAll()).toEqual([]);
  });
});
