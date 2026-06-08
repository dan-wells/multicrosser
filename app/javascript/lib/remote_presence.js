// Tracks remote sessions' cursor positions and selected clues, and reflects
// them into the DOM by toggling data-remote-cursor / data-remote-clue on the
// SVG cell groups, plus data-remote-entry on matching clue-list options. CSS
// in crossword-overrides.css does the actual highlighting.

class RemotePresence {
  constructor() {
    this.sessions = new Map(); // sessionId -> { x, y, entry_id, entry_cells }
    this.cellMap = null; // Map<"x-y", Element>
    this.crosswordElement = null;
    this.localEntryId = null; // local user's selected entry id, e.g. "12-across"
  }

  setCellMap(cellMap) {
    this.cellMap = cellMap;
  }

  setCrosswordElement(el) {
    this.crosswordElement = el;
  }

  setLocalEntry(entryId) {
    this.localEntryId = entryId || null;
    this.apply();
  }

  handleMessage(msg) {
    if (msg.type === 'presence_snapshot') {
      this.sessions.clear();
      Object.entries(msg.sessions || {}).forEach(([sid, state]) => {
        this.sessions.set(sid, state);
      });
    } else if (msg.type === 'presence') {
      if (msg.leave) {
        this.sessions.delete(msg.session_id);
      } else {
        this.sessions.set(msg.session_id, {
          x: msg.x,
          y: msg.y,
          entry_id: msg.entry_id,
          entry_cells: msg.entry_cells || [],
        });
      }
    }
    this.apply();
  }

  apply() {
    this.applyGrid();
    this.applyClueList();
  }

  applyGrid() {
    if (!this.cellMap) return;

    const cursorCells = new Set();
    const clueCells = new Set();
    this.sessions.forEach(({ x, y, entry_cells: entryCells }) => {
      if (Number.isInteger(x) && Number.isInteger(y)) {
        cursorCells.add(`${x}-${y}`);
      }
      (entryCells || []).forEach(([cx, cy]) => clueCells.add(`${cx}-${cy}`));
    });

    this.cellMap.forEach((el, key) => {
      if (cursorCells.has(key)) {
        el.setAttribute('data-remote-cursor', 'true');
      } else if (el.hasAttribute('data-remote-cursor')) {
        el.removeAttribute('data-remote-cursor');
      }

      // Cells in any remote user's selected clue carry data-remote-clue. CSS
      // composes this with data-cell-connected / :focus-within / data-cell-style
      // so cells in both a local and a remote clue get a combined visual.
      if (clueCells.has(key)) {
        el.setAttribute('data-remote-clue', 'true');
      } else if (el.hasAttribute('data-remote-clue')) {
        el.removeAttribute('data-remote-clue');
      }
    });
  }

  applyClueList() {
    if (!this.crosswordElement) return;

    const remoteEntryIds = new Set();
    this.sessions.forEach(({ entry_id: entryId }) => {
      if (entryId) remoteEntryIds.add(entryId);
    });

    this.crosswordElement.querySelectorAll('[data-entry-id]').forEach((el) => {
      const id = el.getAttribute('data-entry-id');
      // Suppress on the local user's own selected entry -- their local yellow
      // should win there.
      const shouldMark = remoteEntryIds.has(id) && id !== this.localEntryId;
      if (shouldMark) {
        el.setAttribute('data-remote-entry', 'true');
      } else if (el.hasAttribute('data-remote-entry')) {
        el.removeAttribute('data-remote-entry');
      }
    });
  }
}

export default RemotePresence;
