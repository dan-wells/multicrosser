# Plan: Track Previous Room Names

**TODO item:** `track previous room names and put into a dropdown on homepage`

---

## Context

Users who regularly solve with the same group always type the same room name. The TODO asks whether a combined text-input/dropdown exists — yes, HTML5 `<datalist>` provides exactly this: a free-text input that also shows a dropdown of suggestions. No custom widget or framework needed.

The TODO also notes:
- Don't track randomly-generated room IDs (the hex strings assigned when no room is specified)
- May need a way to clean up the list

**Where to write the values:** On the puzzle page itself, not on form submit. The puzzle page has `series`, `identifier`, and `room` available in the DOM (`crosswordElement.dataset`). Writing from the puzzle page ensures the saved values reflect what the user actually landed on (including random puzzle picks), rather than what they typed.

---

## Approach

All work is client-side JavaScript + a small HTML change. No backend changes needed.

### 1. Write to localStorage on the puzzle page (`app/javascript/packs/application.js`)

On load, save the current visit:

```javascript
var room       = crosswordElement.dataset.room;
var series     = crosswordElement.dataset.series;
var identifier = crosswordElement.dataset.identifier;

localStorage.setItem('last_room',    room);
localStorage.setItem('last_series',  series);
localStorage.setItem('last_puzzle',  identifier);

// Maintain previous-rooms list (named rooms only)
if (room && !/^[0-9a-f]{6,8}$/.test(room)) {
  var rooms = JSON.parse(localStorage.getItem('previous-rooms') || '[]');
  rooms = rooms.filter(function(r) { return r !== room; });
  rooms.unshift(room);
  rooms = rooms.slice(0, 10);
  localStorage.setItem('previous-rooms', JSON.stringify(rooms));
}
```

### 2. Add `<datalist>` to the room input (`app/views/page/index.html.erb`)

```erb
<input type="text" id="goto-room" name="room" placeholder="e.g. my-room"
       list="room-suggestions" autocomplete="off">
<datalist id="room-suggestions"></datalist>
```

### 3. Pre-fill the form from localStorage (inline `<script>` in `<head>`)

Run before the form renders to avoid any flash:

```javascript
(function() {
  var room       = localStorage.getItem('last_room');
  var series     = localStorage.getItem('last_series');
  var identifier = localStorage.getItem('last_puzzle');
  var rooms      = JSON.parse(localStorage.getItem('previous-rooms') || '[]');

  if (room)       document.getElementById('goto-room').value   = room;
  if (identifier) document.getElementById('goto-number').value = identifier;
  if (series) {
    var sel = document.getElementById('goto-series');
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === series) { sel.selectedIndex = i; break; }
    }
  }

  var datalist = document.getElementById('room-suggestions');
  rooms.forEach(function(name) {
    var opt = document.createElement('option');
    opt.value = name;
    datalist.appendChild(opt);
  });
})();
```

### 4. Clearing on completion

Once the user finishes a puzzle, `last_puzzle`/`last_series` are no longer useful for "resume in progress". Clear them on completion so the homepage doesn't persistently suggest a puzzle that's already done. This requires completion detection (see cross-cutting note below). If a `react-crossword` callback is available:

```javascript
localStorage.removeItem('last_puzzle');
localStorage.removeItem('last_series');
```

### Cleanup

Capped at 10 entries (as above). A "Clear history" link could be added if desired but is not required by the TODO.

---

## Cross-cutting: completion detection

Clearing `last_puzzle`/`last_series` on completion is the same trigger needed by the timer (task 4) and the "mark complete" feature (task 7). Establish first what `react-crossword` 0.2.0 exposes — if a callback exists, one shared handler serves all three. If not, the manual "Mark as complete" button (task 7) is the shared fallback.

---

## Files to modify

- `app/javascript/packs/application.js` — write localStorage on load
- `app/views/page/index.html.erb` — add `list` attribute + `<datalist>` element; extend inline `<script>` with pre-fill and datalist population

---

## Effort

Small. Pure client-side change, no backend involved.
