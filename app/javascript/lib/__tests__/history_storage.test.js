import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import {
  recordSeries, recordPuzzle, recordRoom, recordDay,
  lastSeries, lastRoom, lastDay, previousPuzzles, previousRooms,
} from '../history_storage';

describe('history_storage', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('when localStorage is unavailable', () => {
    it('write functions do not throw', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('unavailable', 'SecurityError');
      });

      expect(() => recordSeries('cryptic')).not.toThrow();
      expect(() => recordPuzzle('cryptic', '1234')).not.toThrow();
      expect(() => recordRoom('my-room')).not.toThrow();
      expect(() => recordDay('Monday')).not.toThrow();
    });

    it('read functions return empty defaults', () => {
      expect(lastSeries()).toBeNull();
      expect(lastRoom()).toBeNull();
      expect(lastDay()).toBeNull();
      expect(previousPuzzles('cryptic')).toEqual([]);
      expect(previousRooms()).toEqual([]);
    });
  });
});
