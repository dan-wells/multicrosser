# Plan: Track Previous Room Names

**TODO item:** `track previous room names and put into a dropdown on homepage`

---

## Context

Users who regularly solve with the same group always type the same room name. The TODO asks whether a combined text-input/dropdown exists — yes, HTML5 `<datalist>` provides exactly this: a free-text input that also shows a dropdown of suggestions. No custom widget or framework needed.

The TODO also notes:
- Don't track randomly-generated room IDs (the hex strings assigned when no room is specified)
- May need a way to clean up the list

---

## Approach

All work is client-side JavaScript + a small HTML change. No backend changes needed.

### 1. Add `<datalist>` to the room input (`app/views/page/index.html.erb`)

```erb
<label for="goto-room">Room</label>
<input type="text" id="goto-room" name="room" placeholder="e.g. my-room"
       list="room-suggestions" autocomplete="off">
<datalist id="room-suggestions"></datalist>
```

### 2. Load stored names on page load

In the inline `<script>` block, add a function that reads from `localStorage` and populates the datalist:

```javascript
function loadPreviousRooms() {
  var rooms = JSON.parse(localStorage.getItem('previous-rooms') || '[]');
  var datalist = document.getElementById('room-suggestions');
  datalist.innerHTML = '';
  rooms.forEach(function(name) {
    var option = document.createElement('option');
    option.value = name;
    datalist.appendChild(option);
  });
}
loadPreviousRooms();
```

### 3. Save room name on navigation

In both `goToPuzzle` and `goToRandomPuzzle`, before setting `window.location`, save the room name if it looks user-chosen (not a random hex ID):

```javascript
function saveRoom(room) {
  if (!room) return;
  // Skip randomly-generated IDs (8 hex chars, matching the short random ID format)
  if (/^[0-9a-f]{6,8}$/.test(room)) return;

  var rooms = JSON.parse(localStorage.getItem('previous-rooms') || '[]');
  // Deduplicate: remove existing entry and prepend
  rooms = rooms.filter(function(r) { return r !== room; });
  rooms.unshift(room);
  // Cap at 10 entries
  rooms = rooms.slice(0, 10);
  localStorage.setItem('previous-rooms', JSON.stringify(rooms));
}
```

Call `saveRoom(room)` in `goToPuzzle` and `goToRandomPuzzle` just before `window.location = url`.

### 4. Random room ID format check

The current random ID generation is in `CrosswordsController` (or equivalent). Check what format is used (currently appears to be a short hex string based on codebase patterns) and adjust the regex in `saveRoom` to match it reliably.

### Cleanup

Cap at 10 entries (as above). A "Clear history" link could be added if desired, but the TODO doesn't require it — capping at 10 is sufficient for now.

---

## Files to modify

- `app/views/page/index.html.erb` — add `list` attribute + `<datalist>` element; extend inline `<script>` with `loadPreviousRooms` and `saveRoom` functions; call `saveRoom` in the two navigation functions

---

## Effort

Small. Pure client-side change, no backend involved.
