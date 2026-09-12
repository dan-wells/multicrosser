import { describe, it, expect } from 'vitest';
import { toGrid, overlayPending } from '../grid';

const DIMENSIONS = { cols: 3, rows: 3 };

describe('overlayPending', () => {
  it('keeps a pending single move that the server snapshot has not caught up with', () => {
    const board = toGrid([], DIMENSIONS);

    overlayPending(board, [{ x: 1, y: 2, value: 'A', previousValue: '' }]);

    expect(board[1][2]).toBe('A');
  });

  it('drops a pending move whose cell a co-solver has since changed', () => {
    const board = toGrid([], DIMENSIONS);
    board[1][2] = 'Z';

    overlayPending(board, [{ x: 1, y: 2, value: 'A', previousValue: '' }]);

    expect(board[1][2]).toBe('Z');
  });

  it('ignores a pending move that falls outside the grid', () => {
    const board = toGrid([], DIMENSIONS);

    expect(() => overlayPending(board, [{ x: 9, y: 9, value: 'A', previousValue: '' }])).not.toThrow();
  });

  it('overlays every cell of a pending batch', () => {
    const board = toGrid([], DIMENSIONS);

    overlayPending(board, [{
      value: '1',
      cells: [{ x: 0, y: 0, previousValue: '' }, { x: 0, y: 1, previousValue: '' }],
    }]);

    expect([board[0][0], board[0][1]]).toEqual(['1', '1']);
  });

  it('keeps a pending clue tick rather than letting the server snapshot revert it', () => {
    const board = toGrid([], DIMENSIONS);
    const spaces = { row_marks: {}, col_marks: {} };

    overlayPending(board, [{
      space: 'row_marks', value: '1', cells: [{ x: 2, y: 0, previousValue: '' }],
    }], spaces);

    expect(spaces.row_marks['2-0']).toBe('1');
  });

  it('drops a pending clue tick a co-solver has since set', () => {
    const board = toGrid([], DIMENSIONS);
    const spaces = { row_marks: { '2-0': '1' }, col_marks: {} };

    overlayPending(board, [{
      space: 'row_marks', value: '', cells: [{ x: 2, y: 0, previousValue: '' }],
    }], spaces);

    expect(spaces.row_marks['2-0']).toBe('1');
  });

  it('leaves the board alone for a mark move when no spaces are tracked', () => {
    const board = toGrid([], DIMENSIONS);

    overlayPending(board, [{
      space: 'col_marks', value: '1', cells: [{ x: 0, y: 0, previousValue: '' }],
    }]);

    expect(board[0][0]).toBe('');
  });
});
