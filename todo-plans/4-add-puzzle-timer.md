# Plan: Add Puzzle Timer

**TODO item:** `Add puzzle timer`

Notes from TODO:
- Should only count time actively on the page
- Probably don't want to show it while running, but have final time display on final check
- Or could add a button to show it with pause/reset etc. controls

---

## Context

The timer is a pure frontend feature. It needs to:
1. Count elapsed time only while the user is actively on the page (paused when the tab is hidden)
2. Either show final time at puzzle completion, or provide a show/pause/reset button

The crossword component is `react-crossword` 0.2.0. Checking what completion events it exposes is needed to decide between the two display approaches.

---

## Approach

### Timer logic (`app/javascript/packs/application.js`)

Implement a simple timer object:

```javascript
const timer = {
  startedAt: null,
  elapsed: 0,     // ms accumulated while running
  running: false,

  start() {
    this.startedAt = Date.now();
    this.running = true;
  },
  pause() {
    if (!this.running) return;
    this.elapsed += Date.now() - this.startedAt;
    this.running = false;
  },
  resume() {
    if (this.running) return;
    this.startedAt = Date.now();
    this.running = true;
  },
  total() {
    return this.elapsed + (this.running ? Date.now() - this.startedAt : 0);
  },
  format() {
    const secs = Math.floor(this.total() / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
};
```

Start the timer after `ReactDOM.render` completes (i.e. once the puzzle is interactive).

### Active-page detection (Page Visibility API)

```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    timer.pause();
  } else {
    timer.resume();
  }
});
```

### Display approaches

**Option A — Final time on completion (preferred per TODO):**

Check whether `react-crossword` 0.2.0 exposes a completion callback. The component's `onCorrect` fires per-cell, and there may be an `onCompleted` or similar. If so, pause the timer and render the final time in a `<div id="puzzle-timer">`.

If no completion callback is available in 0.2.0, this option requires either polling (checking if all cells are correct on each move) or upgrading the package. The `crosswordRef` exposes methods on the component instance — inspect whether a "is complete" check is available.

**Option B — Show/pause/reset button (simpler to implement reliably):**

Add a small control bar below the crossword grid. Always show elapsed time (updating every second via `setInterval`), with a pause/resume button and a reset button.

```html
<div id="puzzle-timer">
  <span id="timer-display">0:00</span>
  <button id="timer-toggle">Pause</button>
  <button id="timer-reset">Reset</button>
</div>
```

Update display every second:
```javascript
setInterval(() => {
  document.getElementById('timer-display').textContent = timer.format();
}, 1000);
```

This is straightforward to implement without needing completion detection.

### Recommended approach

Start with **Option B** (always-visible timer with pause/reset) as it's reliable regardless of the `react-crossword` API. If completion detection is confirmed available, Option A can be added on top.

---

## Files to modify

- `app/javascript/packs/application.js` — timer object, Page Visibility listener, start timer after render
- `app/views/rooms/show.html.erb` — add `<div id="puzzle-timer">` with display and controls

---

## Effort

Small–medium. The timer logic is straightforward; the main uncertainty is completion detection in `react-crossword` 0.2.0.
