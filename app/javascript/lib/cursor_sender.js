// Cursor moves arrive far faster than anyone can read them, so they are
// coalesced into one send per quiet period, and a payload identical to the one
// already sent is dropped.
export default function createCursorSender(send, delay = 50) {
  let lastSent = null;
  let timer = null;

  return function schedule(payload) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const next = typeof payload === 'function' ? payload() : payload;
      if (!next) return;
      const serialized = JSON.stringify(next);
      if (serialized === lastSent) return;
      lastSent = serialized;
      send(next);
    }, delay);
  };
}
