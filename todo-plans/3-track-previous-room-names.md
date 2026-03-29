# Plan: Track Previous Room Names

**TODO item:** `track previous room names and put into a dropdown on homepage`

---

## Context

Users who regularly solve with the same group always type the same room name. The TODO asks whether a combined text-input/dropdown exists — yes, HTML5 `<datalist>` provides exactly this: a free-text input that also shows a dropdown of suggestions. No custom widget or framework needed.

The TODO also notes:
- Don't track randomly-generated room IDs (the hex strings assigned when no room is specified)
- May need a way to clean up the list

**Where to write the values:** On the puzzle page itself, not on form submit. The `crosswordIdentifier` dataset attribute already contains `series/identifier` (e.g. `quiptic/1337`); split on `/` to get both parts. Writing from the puzzle page ensures the saved values reflect what the user actually landed on (including random puzzle picks), rather than what they typed.

---

## Approach

All work is client-side JavaScript + a small HTML change. No backend changes needed.

### 1. Write to localStorage on the puzzle page (`app/javascript/packs/application.js`)

`crosswordIdentifier` is already destructured from `crosswordElement.dataset`. Split it to get series and identifier:

```javascript
const [series, identifier] = crosswordIdentifier.split('/');

localStorage.setItem('last_room',   room);
localStorage.setItem('last_series', series);
localStorage.setItem('last_puzzle', identifier);

// Maintain previous-rooms list (named rooms only, cap 5)
if (room && !/^[0-9a-f]{6,8}$/.test(room)) {
  const rooms = JSON.parse(localStorage.getItem('previous-rooms') || '[]');
  localStorage.setItem('previous-rooms', JSON.stringify(
    [room, ...rooms.filter(r => r !== room)].slice(0, 5)
  ));
}

// Maintain previous-puzzles list per series (cap 5)
const puzzles = JSON.parse(localStorage.getItem('previous-puzzles-' + series) || '[]');
localStorage.setItem('previous-puzzles-' + series, JSON.stringify(
  [identifier, ...puzzles.filter(p => p !== identifier)].slice(0, 5)
));
```

### 2. Add `<datalist>` elements to the form inputs (`app/views/page/index.html.erb`)

Add `autocomplete="off"` to both text inputs to suppress browser-supplied history suggestions. Add `list` attributes pointing to new `<datalist>` elements:

```erb
<input type="text" id="goto-number" name="number" autocomplete="off"
       list="puzzle-suggestions">
<datalist id="puzzle-suggestions"></datalist>

<input type="text" id="goto-room" name="room" placeholder="e.g. my-room"
       autocomplete="off" list="room-suggestions">
<datalist id="room-suggestions"></datalist>
```

### 3. Pre-fill the form from localStorage (extend existing `<script>` block)

Add to the bottom of the existing `<script>` tag in `index.html.erb`. Restores the last-visited series, puzzle, and room; populates both datalists. Puzzle suggestions are per-series and update when the series dropdown changes:

```javascript
(function() {
  var lastRoom    = localStorage.getItem('last_room');
  var lastSeries  = localStorage.getItem('last_series');
  var lastPuzzle  = localStorage.getItem('last_puzzle');
  var rooms       = JSON.parse(localStorage.getItem('previous-rooms') || '[]');

  if (lastRoom)   document.getElementById('goto-room').value   = lastRoom;
  if (lastPuzzle) document.getElementById('goto-number').value = lastPuzzle;
  if (lastSeries) {
    var sel = document.getElementById('goto-series');
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === lastSeries) { sel.selectedIndex = i; break; }
    }
    updatePuzzlePlaceholder();
  }

  // Populate room datalist
  var roomDatalist = document.getElementById('room-suggestions');
  rooms.forEach(function(name) {
    var opt = document.createElement('option');
    opt.value = name;
    roomDatalist.appendChild(opt);
  });

  // Populate puzzle datalist for the currently selected series; refresh on change
  function populatePuzzleDatalist() {
    var series  = document.getElementById('goto-series').value;
    var puzzles = JSON.parse(localStorage.getItem('previous-puzzles-' + series) || '[]');
    var datalist = document.getElementById('puzzle-suggestions');
    datalist.innerHTML = '';
    puzzles.forEach(function(num) {
      var opt = document.createElement('option');
      opt.value = num;
      datalist.appendChild(opt);
    });
  }
  populatePuzzleDatalist();
  document.getElementById('goto-series').addEventListener('change', populatePuzzleDatalist);
})();
```

### 4. Clearing on completion

Once the user finishes a puzzle, `last_puzzle`/`last_series` are no longer useful for "resume in progress". Clear them on completion so the homepage doesn't persistently suggest a puzzle that's already done. This requires completion detection (see cross-cutting note below). If a `react-crossword` callback is available:

```javascript
localStorage.removeItem('last_puzzle');
localStorage.removeItem('last_series');
```

### Cleanup

Both lists capped at 5 entries. A "Clear history" link could be added if desired but is not required by the TODO.

---

## Cross-cutting: completion detection

Clearing `last_puzzle`/`last_series` on completion is the same trigger needed by the timer (task 4) and the "mark complete" feature (task 7). Establish first what `react-crossword` 0.2.0 exposes — if a callback exists, one shared handler serves all three. If not, the manual "Mark as complete" button (task 7) is the shared fallback.

---

## Files to modify

- `app/javascript/packs/application.js` — write localStorage on load
- `app/views/page/index.html.erb` — add `autocomplete="off"` + `list` attributes + `<datalist>` elements; extend inline `<script>` with pre-fill and datalist population

---

## Effort

Small. Pure client-side change, no backend involved.
