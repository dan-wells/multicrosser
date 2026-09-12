import generateId from './generate_id';

// Per-tab session ID for presence. sessionStorage means a reload reuses the
// same id; a new tab gets a new one (each tab is an independent cursor).
export default function sessionId() {
  try {
    let id = sessionStorage.getItem('crossword-session-id');
    if (!id) {
      id = generateId();
      sessionStorage.setItem('crossword-session-id', id);
    }
    return id;
  } catch (e) {
    return generateId();
  }
}
