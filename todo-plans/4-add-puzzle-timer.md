# Add Puzzle Timer

**Context:** Users want to know how long they took to solve a puzzle. The timer should only count active time (paused when the tab is in the background or the user navigates away), and ideally show a final time after puzzle completion rather than a running clock to avoid pressure.

**Files to modify:**
- `app/javascript/packs/application.js` — add timer logic
- `app/views/rooms/show.html.erb` — add timer display element

**Approach:**
1. Add a `<div id="puzzle-timer" style="display:none">` (or visible) to `show.html.erb`.
2. In `application.js`, implement a timer object:
   - `startedAt`: timestamp when solving began
   - `elapsed`: accumulated milliseconds
   - `running`: boolean
   - `start()`: sets `startedAt = Date.now()`, `running = true`
   - `pause()`: adds `Date.now() - startedAt` to `elapsed`, `running = false`
   - `resume()`: sets `startedAt = Date.now()`, `running = true`
   - `display()`: formats `elapsed` as `mm:ss`
3. Use the [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API): listen to `document.addEventListener('visibilitychange', ...)` — pause when `document.hidden`, resume when visible.
4. Start timer when the crossword component is initialised (after `ReactDOM.render`).
5. Per the TODO's preferred approach: hide the timer while solving; show final elapsed time when the puzzle is completed. The `react-crossword` 0.2.0 component exposes `onCorrect` and `onLoadedCorrect` callbacks — check if "completed" can be detected (all cells correct). If not, show a "Show Timer" button instead.
6. Display format in the timer div: `Time: 4:32`.

**Completion detection:** This is a shared concern with the "track previous room names" (task 3) and "limit random to uncompleted puzzles" (task 7) features. See cross-cutting note in the index — if a completion callback is available in `react-crossword`, a single handler can serve all three. If not, a manual "Mark as complete" button becomes the shared fallback, and the timer would display its final time when that button is pressed.

**Simpler fallback:** Always show a running `mm:ss` clock in the page header with a pause button — avoids needing completion detection.

**Effort:** Small–medium. The Page Visibility API is straightforward; completion detection depends on `react-crossword` API.
