const MAX_BUFFERED_MOVES = 1000;

class MoveBuffer {
  constructor(key) {
    this.storage = window.localStorage;
    this.key = `move-buffer-${key}`;
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

  removeCell(x, y) {
    this.setObject(this.getAll().filter((m) => m.x !== x || m.y !== y));
  }

  getAll() {
    return JSON.parse(this.storage.getItem(this.key)) || [];
  }

  setObject(object) {
    this.storage.setItem(this.key, JSON.stringify(object));
  }
}

export default MoveBuffer;
