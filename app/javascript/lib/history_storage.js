const HISTORY_LIMIT = 5;
const ROOM_HEX_PATTERN = /^[0-9a-f]{6,8}$/;

const readList = (key) => JSON.parse(localStorage.getItem(key) || '[]');

const writeList = (key, items) => {
  localStorage.setItem(key, JSON.stringify(items.slice(0, HISTORY_LIMIT)));
};

const prepend = (key, value) => {
  const existing = readList(key);
  writeList(key, [value, ...existing.filter((v) => v !== value)]);
};

// Most recent puzzle series
export const recordSeries = (series) => {
  localStorage.setItem('last-series', series);
};

// Per-series puzzle history, cap at 5
export const recordPuzzle = (series, identifier) => {
  prepend(`previous-puzzles-${series}`, identifier);
};

// Room history -- save named rooms only, skip random hex IDs
export const recordRoom = (room) => {
  if (!room || ROOM_HEX_PATTERN.test(room)) return;
  localStorage.setItem('last-room', room);
  prepend('previous-rooms', room);
};

// Last day filter for cryptics
export const recordDay = (day) => {
  localStorage.setItem('last-day', day);
};

export const previousPuzzles = (series) => readList(`previous-puzzles-${series}`);
export const previousRooms = () => readList('previous-rooms');
export const lastSeries = () => localStorage.getItem('last-series');
export const lastRoom = () => localStorage.getItem('last-room');
export const lastDay = () => localStorage.getItem('last-day');
