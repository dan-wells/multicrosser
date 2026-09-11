import React, {
  useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import NonogramGrid, { gridLayout } from './nonogram_grid';
import {
  EMPTY, ROW, CURSOR_MODES, UndoStack,
  cellKey, markKey, derive, clickValue, dragCells, isSolved, invertStroke,
} from './nonogram_logic';

const MIN_CELL = 14;
const MAX_CELL = 32;

const DEFAULT_SETTINGS = {
  cursorMode: 'rotate',
  showCounter: false,
  highlightLines: true,
  autoMark: true,
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

function Nonogram({ data, storageKey, onMove, onMoveBatch, controlRef }) {
  const { dimensions } = data;

  const boardRef = useRef(emptyBoard(dimensions));
  const marksRef = useRef({ rowMarks: {}, colMarks: {} });
  const [board, setBoard] = useState(boardRef.current);
  const [marks, setMarks] = useState(marksRef.current);

  const [settings, setSettings] = useState(loadSettings);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [lastChange, setLastChange] = useState(null);
  const [pending, setPending] = useState(null);
  const [cellSize, setCellSize] = useState(MAX_CELL);
  const [elapsed, setElapsed] = useState(() => Number(safeGet(`nonogram-timer-${storageKey}`)) || 0);
  const [solved, setSolved] = useState(false);

  const wrapperRef = useRef(null);
  const svgRef = useRef(null);
  const strokeRef = useRef(null);
  const undoRef = useRef(new UndoStack());

  const commitBoard = useCallback((next, changedKey) => {
    boardRef.current = next;
    setBoard(next);
    if (changedKey) setLastChange(changedKey);
    setSolved(isSolved(data, next));
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
    commitBoard(next, cellKey(cells[cells.length - 1].x, cells[cells.length - 1].y));
    return written;
  }, [commitBoard]);

  const sendStroke = useCallback((cells, value, record = true) => {
    const written = writeCells(cells, value);
    if (written.length === 0) return;
    onMoveBatch({ space: 'board', value, cells: written });
    if (record && undoRef.current) undoRef.current.push({ space: 'board', value, cells: written });
  }, [onMoveBatch, writeCells]);

  const setMark = useCallback((axis, line, index) => {
    const field = axis === ROW ? 'rowMarks' : 'colMarks';
    const key = markKey(line, index);
    const previousValue = marksRef.current[field][key] || EMPTY;
    const value = previousValue ? EMPTY : '1';
    commitMarks({ ...marksRef.current, [field]: { ...marksRef.current[field], [key]: value } });
    onMove({ space: axis === ROW ? 'row_marks' : 'col_marks', x: line, y: index, value, previousValue });
  }, [commitMarks, onMove]);

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
      commitBoard(next, cellKey(x, y));
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
      commitBoard(next, cells.length ? cellKey(cells[cells.length - 1].x, cells[cells.length - 1].y) : null);
    },

    // A fresh subscription replaces everything wholesale.
    replaceState(nextBoard, spaces) {
      boardRef.current = nextBoard;
      setBoard(nextBoard);
      setSolved(isSolved(data, nextBoard));
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
    const x = Math.floor((event.clientX - rect.left) / (cellSize * scale)) - layout.gutterCols;
    const y = Math.floor((event.clientY - rect.top) / (cellSize * scale)) - layout.gutterRows;
    if (x < 0 || y < 0 || x >= layout.cols || y >= layout.rows) return null;
    return { x, y };
  }, [cellSize, layout]);

  const handlePointerDown = useCallback((event) => {
    const cell = cellFromEvent(event);
    if (!cell) return;
    event.preventDefault();
    // A drag paints the value the starting cell would have taken on a click,
    // so a one-cell drag and a click are the same action.
    const mode = event.button === 2 ? 'cross' : settings.cursorMode;
    const value = clickValue(mode, boardRef.current[cell.x][cell.y]);
    strokeRef.current = { start: cell, value };
    setCursor(cell);
    setPending({ value, keys: new Set([cellKey(cell.x, cell.y)]) });
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (e) { /* no capture in jsdom */ }
  }, [cellFromEvent, settings.cursorMode]);

  const handlePointerMove = useCallback((event) => {
    if (!strokeRef.current) return;
    const cell = cellFromEvent(event);
    if (!cell) return;
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
    const cell = cellFromEvent(event) || stroke.start;
    setPending(null);
    sendStroke(dragCells(stroke.start, cell), stroke.value);
  }, [cellFromEvent, sendStroke]);

  const handleClueClick = useCallback((axis, line, index) => {
    setMark(axis, line, index);
  }, [setMark]);

  // --- keyboard ---------------------------------------------------------

  const handleKeyDown = useCallback((event) => {
    const moves = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1],
    };
    const step = moves[event.key];
    if (step) {
      event.preventDefault();
      setCursor((current) => ({
        x: Math.min(Math.max(current.x + step[0], 0), dimensions.cols - 1),
        y: Math.min(Math.max(current.y + step[1], 0), dimensions.rows - 1),
      }));
      return;
    }
    if (event.key === ' ' || event.key === 'Enter' || event.key === 'x') {
      event.preventDefault();
      const mode = event.key === 'x' ? 'cross' : settings.cursorMode;
      const value = clickValue(mode, boardRef.current[cursor.x][cursor.y]);
      sendStroke([cursor], value);
    }
  }, [cursor, dimensions, sendStroke, settings.cursorMode]);

  // --- undo / redo ------------------------------------------------------

  // An undo re-issues the change as an ordinary batch, checked against the
  // server like any other move, so it can be rejected rather than silently
  // trampling whatever a co-solver has since put there.
  const replayStroke = useCallback((stroke, forward) => {
    const batches = forward
      ? [{ space: stroke.space, value: stroke.value, cells: stroke.cells }]
      : invertStroke(stroke);
    batches.forEach((batch) => sendStroke(batch.cells, batch.value, false));
  }, [sendStroke]);

  const handleUndo = useCallback(() => {
    const stroke = undoRef.current.undo();
    if (stroke) replayStroke(stroke, false);
  }, [replayStroke]);

  const handleRedo = useCallback(() => {
    const stroke = undoRef.current.redo();
    if (stroke) replayStroke(stroke, true);
  }, [replayStroke]);

  // --- scaling ----------------------------------------------------------

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === 'undefined') return undefined;
    const update = () => {
      const available = wrapper.clientWidth;
      if (!available) return;
      const fitted = Math.floor(available / layout.totalCols);
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
        safeSet(`nonogram-timer-${storageKey}`, String(seconds + 1));
        return seconds + 1;
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

  const clues = useMemo(
    () => ({ rowClues: data.rowClues, colClues: data.colClues }),
    [data],
  );

  const derived = useMemo(
    () => derive(board, dimensions, clues, marks, settings.autoMark),
    [board, clues, dimensions, marks, settings.autoMark],
  );

  return (
    <div className="nonogram">
      <div className="nonogram-controls">
        <label>
          Click
          <select
            value={settings.cursorMode}
            onChange={(event) => updateSetting('cursorMode', event.target.value)}
          >
            {CURSOR_MODES.map((mode) => (
              <option key={mode} value={mode}>{mode}</option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.showCounter}
            onChange={(event) => updateSetting('showCounter', event.target.checked)}
          />
          Cell counter
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.highlightLines}
            onChange={(event) => updateSetting('highlightLines', event.target.checked)}
          />
          Highlight row and column
        </label>
        <label title="Ticking off every clue on a line crosses out the rest of it; filling a line in completely ticks off its clues.">
          <input
            type="checkbox"
            checked={settings.autoMark}
            onChange={(event) => updateSetting('autoMark', event.target.checked)}
          />
          Auto cross and tick
        </label>
        <button type="button" onClick={handleUndo} disabled={!undoRef.current.canUndo}>Undo</button>
        <button type="button" onClick={handleRedo} disabled={!undoRef.current.canRedo}>Redo</button>
        <span className="nonogram-timer">{formatTime(elapsed)}</span>
      </div>

      {solved && <p className="nonogram-solved" role="status">Solved in {formatTime(elapsed)}.</p>}

      <div
        className="nonogram-wrapper"
        ref={wrapperRef}
        onKeyDown={handleKeyDown}
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
          lastChange={lastChange}
          pending={pending}
          cellSize={cellSize}
          svgRef={svgRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClueClick={handleClueClick}
        />
      </div>
    </div>
  );
}

export default Nonogram;
