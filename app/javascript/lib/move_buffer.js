const MAX_BUFFERED_MOVES = 1000;

function makeStorage() {
  try {
    window.localStorage.setItem('__move-buffer-probe__', '');
    window.localStorage.removeItem('__move-buffer-probe__');
    return window.localStorage;
  } catch (e) {
    // localStorage unavailable (e.g. Safari Private Browsing).
    // Fall back to in-memory storage -- moves buffer within the tab only.
    const data = new Map();
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => { data.set(key, value); },
      removeItem: (key) => { data.delete(key); },
    };
  }
}

class MoveBuffer {
  constructor(key) {
    this.key = `move-buffer-${key}`;
    this.storage = makeStorage();
  }

  queue(move) {
    const existing = this.getAll();
    existing.push(move);
    if (existing.length > MAX_BUFFERED_MOVES) {
      existing.shift(); // drop the oldest
    }
    this.setObject(existing);
  }

  remove(id) {
    this.setObject(this.getAll().filter((m) => m.id !== id));
  }

  // Drops a cell from the queue wherever it appears, including from inside a
  // buffered batch, whose other cells are still worth sending.
  removeCell(x, y, space = 'board') {
    const remaining = this.getAll().map((m) => {
      if ((m.space || 'board') !== space) return m;
      if (m.cells) {
        const cells = m.cells.filter((c) => c.x !== x || c.y !== y);
        return cells.length > 0 ? { ...m, cells } : null;
      }
      return (m.x === x && m.y === y) ? null : m;
    });
    this.setObject(remaining.filter(Boolean));
  }

  getAll() {
    return JSON.parse(this.storage.getItem(this.key)) || [];
  }

  setObject(object) {
    this.storage.setItem(this.key, JSON.stringify(object));
  }
}

export default MoveBuffer;
