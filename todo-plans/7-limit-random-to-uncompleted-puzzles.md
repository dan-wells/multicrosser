# Limit Random Puzzle to Uncompleted Puzzles

**Context:** When using the Random button, users may land on a puzzle they've already solved in the same room. This task tracks which puzzles a room has completed and excludes them from the random selection. It also adds an explicit "mark complete" button.

**Data model:**
- Redis set: `completed-{room}` containing puzzle identifiers like `quiptic/1289`
- On "mark complete": `REDIS.sadd("completed-#{room}", "#{series}/#{identifier}")`
- Random selection: the frontend needs the list of completed puzzles to exclude them

**Architecture challenge:** The current random puzzle logic is entirely client-side JavaScript in `index.html.erb`. To exclude completed puzzles, the frontend needs to know which are completed. Options:
1. **API endpoint**: add a `GET /rooms/:room/completed` JSON endpoint; homepage JS fetches it before randomising — requires a room to be known before navigating to a puzzle (the room input is optional)
2. **Pass completed list in page data**: only works if the room is known on the homepage
3. **Server-side random**: add a `GET /:series/random?room=X` endpoint that picks a random puzzle server-side, excluding completed ones, and redirects — simplest integration

**Recommended: server-side random endpoint**

1. Add route: `get ':series/random', to: 'crosswords#random', as: 'random_crossword'`
2. `CrosswordsController#random`:
   - Reads `REDIS.smembers("completed-#{params[:room]}")` for completed set
   - Picks a random identifier from `first_puzzle..latest`, excluding completed + skipped numbers
   - Redirects to `/:series/:identifier[/:room]`
3. Update the Random button in `index.html.erb` to redirect to this endpoint
4. Add a "Mark as Complete" button on `show.html.erb`:
   - Sends `POST /rooms/:room/complete` with `series` and `identifier`
   - `RoomsController#complete` action: `REDIS.sadd("completed-#{params[:room]}", crossword_identifier); head :ok`
5. The "latest" puzzle number is needed server-side; currently only stored in Redis as part of the crossword series list — can read from `crossword-series-{name}` to find the max identifier.

**Completion detection:** The "Mark as complete" button also serves as the shared completion trigger for the timer (task 4) and the localStorage clear (task 3). If `react-crossword` exposes an automatic completion callback, that can replace or supplement the button. See cross-cutting note in the index.

**Files to modify:**
- `config/routes.rb`
- `app/controllers/crosswords_controller.rb` (add `random` action)
- `app/controllers/rooms_controller.rb` (add `complete` action)
- `app/views/page/index.html.erb` (update Random button)
- `app/views/rooms/show.html.erb` (add Mark Complete button)
- `app/models/series.rb` (expose latest puzzle lookup helper)

**Effort:** High — new data model, new endpoints, coordination between frontend random logic and backend completion tracking.
