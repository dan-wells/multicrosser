import React, {
  useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import NonogramGrid, { gridLayout, MIN_CELL, MAX_CELL } from './nonogram_grid';
import {
  EMPTY, ROW, CURSOR_MODES, UndoStack,
  cellKey, markKey, derive, NOTHING_DERIVED, clickValue, dragCells, isSolved, invertStroke,
} from './nonogram_logic';

const CONFIRM_MS = 3000;

const CROSS_COLOR = '#cc0000';

const crossArms = (x, y, side, inset) => (
  <g stroke={CROSS_COLOR} strokeWidth={side * 0.17} strokeLinecap="round">
    <line x1={x + inset} y1={y + inset} x2={x + side - inset} y2={y + side - inset} />
    <line x1={x + side - inset} y1={y + inset} x2={x + inset} y2={y + side - inset} />
  </g>
);

const CURSOR_ICONS = {
  rotate: (
    <g>
      <rect x="7" y="2" width="11" height="11" fill="#fff" stroke="#222" strokeWidth="1.4" />
      <rect x="2" y="7" width="11" height="11" fill="#fff" stroke="#222" strokeWidth="1.4" />
      {crossArms(2, 7, 11, 3)}
      <rect x="11" y="10" width="12" height="12" fill="#222" />
    </g>
  ),
  black: <rect x="3" y="3" width="18" height="18" fill="#222" />,
  cross: crossArms(2, 2, 20, 4.5),
  blank: <rect x="3.75" y="3.75" width="16.5" height="16.5" fill="#fff" stroke="#222" strokeWidth="1.5" />,
};

const GLYPHS = {
  undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z',
  redo: 'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
};

const CURSOR_LABELS = {
  rotate: 'Click cycles filled, crossed, blank',
  black: 'Click fills a square',
  cross: 'Click crosses a square off',
  blank: 'Click clears a square',
};

const DEFAULT_SETTINGS = {
  cursorMode: 'rotate',
  showCounter: false,
  highlightLines: false,
  autoMark: false,
};

const safeGet = (key) => {
  try { return localStorage.getItem(key); } catch (e) { return null; }
};

const safeSet = (key, value) => {
  try { localStorage.setItem(key, value); } catch (e) { /* unavailable in e.g. private browsing */ }
};

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(safeGet('nonogram-settings') || '{}') };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const emptyBoard = (dimensions) =>
  Array.from({ length: dimensions.cols }, () => Array(dimensions.rows).fill(EMPTY));

function Nonogram({ data, storageKey, randomPath, onMoveBatch, onCursor, controlRef }) {
  const { dimensions } = data;

  const boardRef = useRef(emptyBoard(dimensions));
  const marksRef = useRef({ rowMarks: {}, colMarks: {} });
  const [board, setBoard] = useState(boardRef.current);
  const [marks, setMarks] = useState(marksRef.current);

  const [settings, setSettings] = useState(loadSettings);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [lastChange, setLastChange] = useState(null);
  const [pending, setPending] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [keyboardCursor, setKeyboardCursor] = useState(false);
  const [cellSize, setCellSize] = useState(MAX_CELL);
  const [elapsed, setElapsed] = useState(() => Number(safeGet(`nonogram-timer-${storageKey}`)) || 0);
  const [solvedAt, setSolvedAt] = useState(null);
  const solved = solvedAt !== null;

  const wrapperRef = useRef(null);
  const svgRef = useRef(null);
  const strokeRef = useRef(null);
  const undoRef = useRef(new UndoStack());
  const engagedRef = useRef(false);
  const confirmRef = useRef(null);
  const pointerFocusRef = useRef(false);
  const elapsedRef = useRef(elapsed);

  const commitBoard = useCallback((next, changedKeys) => {
    boardRef.current = next;
    setBoard(next);
    if (changedKeys && changedKeys.length) setLastChange(new Set(changedKeys));
    setSolvedAt(isSolved(data, next) ? elapsedRef.current : null);
  }, [data]);

  const commitMarks = useCallback((next) => {
    marksRef.current = next;
    setMarks(next);
  }, []);

  // --- applying moves ---------------------------------------------------

  // Writes cells locally and hands back what each one held, which is both the
  // optimistic check the server repeats and the material for an undo (local
  // so that an undo never reverts a co-solver's work).
  const writeCells = useCallback((cells, value) => {
    const next = boardRef.current.map((column) => column.slice());
    const written = cells.map(({ x, y }) => {
      const previousValue = next[x][y];
      next[x][y] = value;
      return { x, y, previousValue };
    }).filter((cell) => cell.previousValue !== value);
    if (written.length === 0) return [];
    commitBoard(next, cells.map(({ x, y }) => cellKey(x, y)));
    return written;
  }, [commitBoard]);

  // The clue-tick counterpart of `writeCells`, down to the previous values, so
  // a tick travels and is undone by the same machinery a stroke is.
  const writeMarks = useCallback((space, cells, value) => {
    const field = space === 'row_marks' ? 'rowMarks' : 'colMarks';
    const updated = { ...marksRef.current[field] };
    const written = cells.map(({ x, y }) => {
      const key = markKey(x, y);
      const previousValue = updated[key] || EMPTY;
      updated[key] = value;
      return { x, y, previousValue };
    }).filter((cell) => cell.previousValue !== value);
    if (written.length === 0) return [];
    commitMarks({ ...marksRef.current, [field]: updated });
    return written;
  }, [commitMarks]);

  const sendStroke = useCallback((space, cells, value, record = true) => {
    const written = space === 'board'
      ? writeCells(cells, value)
      : writeMarks(space, cells, value);
    if (written.length === 0) return;
    onMoveBatch({ space, value, cells: written });
    if (record && undoRef.current) {
      undoRef.current.push({
        space,
        value,
        cells: written,
        // Only board cells can be outlined; a tick has nothing to highlight.
        span: space === 'board' ? cells.map(({ x, y }) => cellKey(x, y)) : [],
      });
    }
  }, [onMoveBatch, writeCells, writeMarks]);

  const setMark = useCallback((axis, line, index) => {
    const field = axis === ROW ? 'rowMarks' : 'colMarks';
    const value = marksRef.current[field][markKey(line, index)] ? EMPTY : '1';
    sendStroke(axis === ROW ? 'row_marks' : 'col_marks', [{ x: line, y: index }], value);
  }, [sendStroke]);

  // The entry point drives these as messages arrive from the other players.
  useImperativeHandle(controlRef, () => ({
    applyMove({ space, x, y, value }) {
      if (space === 'row_marks' || space === 'col_marks') {
        const field = space === 'row_marks' ? 'rowMarks' : 'colMarks';
        commitMarks({
          ...marksRef.current,
          [field]: { ...marksRef.current[field], [markKey(x, y)]: value },
        });
        return;
      }
      const next = boardRef.current.map((column) => column.slice());
      if (!next[x]) return;
      next[x][y] = value;
      commitBoard(next, [cellKey(x, y)]);
    },

    applyBatch({ space, value, cells }) {
      if (space === 'row_marks' || space === 'col_marks') {
        const field = space === 'row_marks' ? 'rowMarks' : 'colMarks';
        const updated = { ...marksRef.current[field] };
        cells.forEach(({ x, y }) => { updated[markKey(x, y)] = value; });
        commitMarks({ ...marksRef.current, [field]: updated });
        return;
      }
      const next = boardRef.current.map((column) => column.slice());
      cells.forEach(({ x, y }) => { if (next[x]) next[x][y] = value; });
      commitBoard(next, cells.map(({ x, y }) => cellKey(x, y)));
    },

    // A fresh subscription replaces everything wholesale.
    replaceState(nextBoard, spaces) {
      boardRef.current = nextBoard;
      setBoard(nextBoard);
      setSolvedAt(isSolved(data, nextBoard) ? elapsedRef.current : null);
      commitMarks({
        rowMarks: (spaces && spaces.row_marks) || {},
        colMarks: (spaces && spaces.col_marks) || {},
      });
    },
  }), [commitBoard, commitMarks, data]);

  // --- pointer handling -------------------------------------------------

  const layout = useMemo(() => gridLayout(data, settings), [data, settings]);

  const cellFromEvent = useCallback((event) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / (layout.totalCols * cellSize);
    const x = Math.floor((event.clientX - rect.left) / (cellSize * scale) - layout.gutterWidth);
    const y = Math.floor((event.clientY - rect.top) / (cellSize * scale) - layout.gutterHeight);
    if (x < 0 || y < 0 || x >= layout.cols || y >= layout.rows) return null;
    return { x, y };
  }, [cellSize, layout]);

  // A stroke in progress is abandoned rather than committed: a second finger landing
  // means a pinch to zoom, so we should not leave a half-drawn run on the grid.
  const abandonStroke = useCallback(() => {
    strokeRef.current = null;
    setPending(null);
  }, []);

  const handlePointerDown = useCallback((event) => {
    if (strokeRef.current) {
      abandonStroke();
      return;
    }
    setKeyboardCursor(false);
    const cell = cellFromEvent(event);
    if (!cell) return;
    // A drag paints the value the starting cell would have taken on a click,
    // so a one-cell drag and a click are the same action.
    const mode = event.button === 2 ? 'cross' : settings.cursorMode;
    const value = clickValue(mode, boardRef.current[cell.x][cell.y]);
    // Touch controls differ: we only allow tapping, not dragging, so not to
    // conflict with mobile browser gestures like pinch-to-zoom.
    const tap = event.pointerType === 'touch';
    strokeRef.current = { start: cell, value, last: cell, tap };
    engagedRef.current = true;
    setCursor(cell);
    if (tap) return;
    event.preventDefault();
    setPending({ value, keys: new Set([cellKey(cell.x, cell.y)]) });
    if (wrapperRef.current && document.activeElement !== wrapperRef.current) {
      pointerFocusRef.current = true;
      wrapperRef.current.focus();
    }
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (e) { /* no capture in jsdom */ }
  }, [abandonStroke, cellFromEvent, settings.cursorMode]);

  const handlePointerMove = useCallback((event) => {
    if (!strokeRef.current || strokeRef.current.tap) return;
    const cell = cellFromEvent(event);
    if (!cell) return;
    strokeRef.current.last = cell;
    const cells = dragCells(strokeRef.current.start, cell);
    setPending({
      value: strokeRef.current.value,
      keys: new Set(cells.map(({ x, y }) => cellKey(x, y))),
    });
    setCursor(cell);
  }, [cellFromEvent]);

  const handlePointerUp = useCallback((event) => {
    const stroke = strokeRef.current;
    if (!stroke) return;
    strokeRef.current = null;
    const cell = cellFromEvent(event) || stroke.last;
    setPending(null);
    // A finger that came up somewhere else was on its way through, not tapping.
    if (stroke.tap && (cell.x !== stroke.start.x || cell.y !== stroke.start.y)) return;
    sendStroke('board', dragCells(stroke.start, cell), stroke.value);
  }, [cellFromEvent, sendStroke]);

  const handleClueClick = useCallback((axis, line, index) => {
    setMark(axis, line, index);
  }, [setMark]);

  // --- undo / redo ------------------------------------------------------

  // An undo re-issues the change as an ordinary batch, checked against the
  // server like any other move, so it can be rejected rather than silently
  // trampling whatever a co-solver has since put there.
  const replayStroke = useCallback((stroke, forward) => {
    const batches = forward
      ? [{ space: stroke.space, value: stroke.value, cells: stroke.cells }]
      : invertStroke(stroke);
    batches.forEach((batch) => sendStroke(batch.space, batch.cells, batch.value, false));
  }, [sendStroke]);

  // The highlight always sits on the stroke a further undo would revert, so
  // stepping back through the stack walks it back through the grid.
  const highlightUndoTop = useCallback(() => {
    const stroke = undoRef.current.current;
    setLastChange(stroke ? new Set(stroke.span) : null);
  }, []);

  const handleUndo = useCallback(() => {
    const stroke = undoRef.current.undo();
    if (stroke) replayStroke(stroke, false);
    highlightUndoTop();
  }, [highlightUndoTop, replayStroke]);

  const handleRedo = useCallback(() => {
    const stroke = undoRef.current.redo();
    if (stroke) replayStroke(stroke, true);
    highlightUndoTop();
  }, [highlightUndoTop, replayStroke]);

  // --- keyboard ---------------------------------------------------------

  const handleFocus = useCallback((event) => {
    if (event.target !== wrapperRef.current) return;
    if (pointerFocusRef.current) {
      pointerFocusRef.current = false;
      return;
    }
    setKeyboardCursor(true);
  }, []);

  const handleKeyDown = useCallback((event) => {
    const moves = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1],
    };
    const step = moves[event.key];
    if (step) {
      event.preventDefault();
      engagedRef.current = true;
      setKeyboardCursor(true);
      setCursor((current) => ({
        x: Math.min(Math.max(current.x + step[0], 0), dimensions.cols - 1),
        y: Math.min(Math.max(current.y + step[1], 0), dimensions.rows - 1),
      }));
      return;
    }
    const clears = event.key === 'Backspace' || event.key === 'Delete';
    if (event.key === ' ' || event.key === 'Enter' || event.key === 'x' || clears) {
      event.preventDefault();
      setKeyboardCursor(true);
      const current = boardRef.current[cursor.x][cursor.y];
      const value = clears ? EMPTY : clickValue(
        event.key === 'x' ? 'cross' : settings.cursorMode, current,
      );
      sendStroke('board', [cursor], value);
      return;
    }
    if (event.key === 'u' || event.key === 'i') {
      event.preventDefault();
      if (event.key === 'u') handleUndo(); else handleRedo();
    }
  }, [cursor, dimensions, handleRedo, handleUndo, sendStroke, settings.cursorMode]);

  // --- whole-puzzle actions ---------------------------------------------

  // Clearing the grid clears it for everyone in the room and cannot be undone,
  // so the first click only arms the button. The clue ticks go with the cells:
  // leaving them behind would keep crossing out lines just emptied.
  const handleStartOver = useCallback(() => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      confirmRef.current = setTimeout(() => setConfirmingClear(false), CONFIRM_MS);
      return;
    }
    clearTimeout(confirmRef.current);
    setConfirmingClear(false);

    const cells = [];
    for (let x = 0; x < dimensions.cols; x += 1) {
      for (let y = 0; y < dimensions.rows; y += 1) {
        if (boardRef.current[x][y] !== EMPTY) cells.push({ x, y });
      }
    }
    sendStroke('board', cells, EMPTY, false);

    [['row_marks', 'rowMarks'], ['col_marks', 'colMarks']].forEach(([space, field]) => {
      const ticked = Object.keys(marksRef.current[field])
        .filter((key) => marksRef.current[field][key])
        .map((key) => {
          const [line, index] = key.split('-');
          return { x: Number(line), y: Number(index) };
        });
      sendStroke(space, ticked, EMPTY, false);
    });

    undoRef.current = new UndoStack();
    setLastChange(null);
  }, [confirmingClear, dimensions, sendStroke]);

  useEffect(() => () => clearTimeout(confirmRef.current), []);

  // The timer is this player's own, kept in local storage rather than shared.
  const handleResetTimer = useCallback(() => {
    elapsedRef.current = 0;
    setElapsed(0);
    safeSet(`nonogram-timer-${storageKey}`, '0');
  }, [storageKey]);

  // --- scaling ----------------------------------------------------------

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === 'undefined') return undefined;
    const update = () => {
      const available = wrapper.clientWidth;
      if (!available) return;
      const fitted = Math.floor((available / layout.totalCols) * 100) / 100;
      setCellSize(Math.min(Math.max(fitted, MIN_CELL), MAX_CELL));
    };
    const observer = new ResizeObserver(update);
    observer.observe(wrapper);
    update();
    return () => observer.disconnect();
  }, [layout.totalCols]);

  // --- timer ------------------------------------------------------------

  useEffect(() => {
    if (solved) return undefined;
    const tick = setInterval(() => {
      if (document.hidden) return;
      setElapsed((seconds) => {
        elapsedRef.current = seconds + 1;
        safeSet(`nonogram-timer-${storageKey}`, String(elapsedRef.current));
        return elapsedRef.current;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [solved, storageKey]);

  const updateSetting = useCallback((key, value) => {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      safeSet('nonogram-settings', JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!onCursor || !engagedRef.current) return;
    const cells = [];
    for (let offset = 0; offset < dimensions.cols; offset += 1) cells.push([offset, cursor.y]);
    for (let offset = 0; offset < dimensions.rows; offset += 1) {
      if (offset !== cursor.y) cells.push([cursor.x, offset]);
    }
    onCursor({
      x: cursor.x, y: cursor.y, entry_id: null, entry_cells: cells,
    });
  }, [cursor, dimensions, onCursor]);

  const clues = useMemo(
    () => ({ rowClues: data.rowClues, colClues: data.colClues }),
    [data],
  );

  const derivedRef = useRef(NOTHING_DERIVED);
  const derived = useMemo(() => {
    const next = derive(
      board, dimensions, clues, marks, settings.autoMark ? null : derivedRef.current,
    );
    derivedRef.current = next;
    return next;
  }, [board, clues, dimensions, marks, settings.autoMark]);

  return (
    <div className="nonogram" data-highlight-lines={settings.highlightLines ? 'true' : 'false'}>
      <div className="nonogram-controls">
        <div className="nonogram-modes" role="group" aria-label="Click behaviour">
          {CURSOR_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              title={CURSOR_LABELS[mode]}
              aria-label={CURSOR_LABELS[mode]}
              aria-pressed={settings.cursorMode === mode}
              onClick={() => updateSetting('cursorMode', mode)}
            >
              <svg viewBox="0 0 24 24" role="presentation">{CURSOR_ICONS[mode]}</svg>
            </button>
          ))}
        </div>

        <div className="nonogram-history">
          {[['undo', 'Undo', handleUndo, !undoRef.current.canUndo],
            ['redo', 'Redo', handleRedo, !undoRef.current.canRedo]].map(
            ([name, label, onClick, disabled]) => (
              <button
                key={name}
                type="button"
                title={label}
                aria-label={label}
                onClick={onClick}
                disabled={disabled}
              >
                <svg viewBox="0 0 24 24" role="presentation">
                  <path d={GLYPHS[name]} fill="#222" />
                </svg>
              </button>
            ),
          )}
        </div>

        <span className="nonogram-timer">{formatTime(elapsed)}</span>
      </div>

      {solved && <p className="nonogram-solved" role="status">Puzzle solved in {formatTime(solvedAt)}</p>}

      <div
        className="nonogram-wrapper"
        ref={wrapperRef}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={() => setKeyboardCursor(false)}
        role="application"
        tabIndex={0}
      >
        <NonogramGrid
          data={data}
          board={board}
          derived={derived}
          marks={marks}
          settings={settings}
          cursor={cursor}
          showCursor={keyboardCursor}
          lastChange={lastChange}
          pending={pending}
          cellSize={cellSize}
          svgRef={svgRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={abandonStroke}
          onClueClick={handleClueClick}
        />
      </div>

      <div className="nonogram-actions">
        <button
          type="button"
          data-confirming={confirmingClear ? '' : undefined}
          onClick={handleStartOver}
        >
          {confirmingClear ? 'Confirm start over' : 'Start over'}
        </button>
        <button type="button" onClick={handleResetTimer}>Reset timer</button>
        <a href={randomPath}>New puzzle</a>
        <div className="nonogram-settings">
          <button
            type="button"
            title="Settings"
            aria-label="Settings"
            aria-pressed={showOptions}
            aria-expanded={showOptions}
            onClick={() => setShowOptions((open) => !open)}
          >
            <svg viewBox="0 0 24 24" role="presentation">
              <path d={GLYPHS.settings} fill="#222" />
            </svg>
          </button>
        </div>
      </div>

      <div className="nonogram-options" hidden={!showOptions}>
        <label title="Ticking off every clue on a line crosses out the rest of it; filling a line in completely ticks off its clues.">
          <input
            type="checkbox"
            checked={settings.autoMark}
            onChange={(event) => updateSetting('autoMark', event.target.checked)}
          />
          Auto cross and tick
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.showCounter}
            onChange={(event) => updateSetting('showCounter', event.target.checked)}
          />
          Show cell counters
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.highlightLines}
            onChange={(event) => updateSetting('highlightLines', event.target.checked)}
          />
          Highlight row and column
        </label>
      </div>
    </div>
  );
}

export default Nonogram;
