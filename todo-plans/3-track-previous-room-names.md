# Track Previous Room Names (and last puzzle)

**Context:** Two related convenience features, both using `localStorage` (not cookies — no consent notice required, as localStorage is purely client-side and never transmitted to the server):

1. **Pre-fill last used room + puzzle number** on the homepage form, so users can easily return to an in-progress puzzle that isn't in the recent list.
2. **Datalist dropdown of previous named rooms**, surfaced via HTML5 `<datalist>` — the combined text-input/dropdown the TODO asked about.

**Where to write the values:** On the puzzle page itself (`show.html.erb` / `application.js`), not on form submit. The puzzle page already has `series`, `identifier`, and `room` available in the DOM (`crosswordElement.dataset`). Writing from the puzzle page ensures the saved values reflect what the user actually landed on (including random puzzle picks), rather than what they typed.

**Files to modify:**
- `app/views/page/index.html.erb` — add `<datalist>` element, pre-fill `value` attributes from localStorage in a `<script>` in `<head>`
- `app/javascript/packs/application.js` — write `last_room`, `last_series`, `last_puzzle` to localStorage on load
- (or inline `<script>` in `show.html.erb` if keeping it out of the webpack bundle)

**Approach:**
1. In `application.js` (puzzle page), on load: write `localStorage.setItem('last_room', room)`, `localStorage.setItem('last_series', series)`, `localStorage.setItem('last_puzzle', identifier)`.
2. Also maintain `previous-rooms`: read current array, prepend current room if it's a named room (not an 8-char hex: `/^[0-9a-f]{8}$/.test(room)`), deduplicate, cap at 10, save back.
3. On the homepage, in a `<script>` in the `<head>` (so it runs before form renders, preventing any flash):
   - Read `last_room`, `last_series`, `last_puzzle` from localStorage
   - Set `value` attributes on `#goto-room`, `#goto-number`; set `selected` on the matching `<option>` in `#goto-series`
   - Read `previous-rooms` and populate `<datalist id="room-suggestions">`
4. Link `<input id="goto-room">` to the datalist via `list="room-suggestions"`.

**Clearing on completion:** Once the user finishes a puzzle, the stored `last_puzzle` (and `last_series`) are no longer useful for "resume in progress" and could be cleared, so the homepage form doesn't persistently suggest a puzzle that's already done. This requires completion detection — the same open question as in the timer plan (depends on what `react-crossword` 0.2.0 exposes). If a completion callback is available, call `localStorage.removeItem('last_puzzle')` and `localStorage.removeItem('last_series')` there. Note that this interacts with the "limit random to uncompleted puzzles" feature (task 7), which also needs completion detection — the three features could share a single completion handler. See cross-cutting note in the index.

**No backend changes needed.**

**Verification:** Visit a puzzle, return to homepage — room, series, and puzzle number fields are pre-filled; room name appears in datalist dropdown. Complete a puzzle, return to homepage — puzzle/series fields are cleared, room field remains.
