class MoveBuffer {
  constructor(key) {
    this.storage = window.localStorage;
    this.key = `move-buffer-${key}`;
  }

  queue(move) {
    const existing = this.getAll();
    existing.push(move);
    this.setObject(existing);
  }

  remove(id) {
    this.setObject(this.getAll().filter((m) => m.id !== id));
  }

  getAll() {
    return JSON.parse(this.storage.getItem(this.key)) || [];
  }

  setObject(object) {
    this.storage.setItem(this.key, JSON.stringify(object));
  }
}

export default MoveBuffer;
