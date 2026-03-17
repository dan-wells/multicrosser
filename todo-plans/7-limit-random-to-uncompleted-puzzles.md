# Plan: Limit Random Puzzle to Uncompleted Puzzles

**TODO item:** `limit random puzzle button to avoid any puzzles which have been completed in the specified room`

Notes from TODO:
- Need to track puzzle completion in Redis
- Maybe also have an explicit "mark complete" button in case you come across one you've already done

---

## Context

The current "Random" button picks a random puzzle entirely client-side in JavaScript. To exclude completed puzzles, the backend needs to be involved: only the server knows which puzzles a given room has completed (stored in Redis).

The room name is optional on the homepage — users can hit Random without specifying a room. The exclusion only applies when a room is provided.

---

## Approach

Move random puzzle selection to a server-side endpoint. The frontend Random button redirects to this endpoint with the series and room, and the server picks a random uncompleted puzzle and redirects to it.

### Data model

Redis set per room, containing completed puzzle identifiers:

```
Key:   completed-{room}
Type:  Set
Value: e.g. {"quiptic/1289", "quiptic/1301", "cryptic/29943"}
```

### 1. Mark Complete endpoint

Add a route and controller action to record a completed puzzle:

**`config/routes.rb`:**
```ruby
post ':series/:identifier/:room/complete', to: 'rooms#complete', as: 'complete_puzzle'
```

**`app/controllers/rooms_controller.rb`:**
```ruby
def complete
  redis.sadd("completed-#{params[:room]}", crossword_identifier)
  head :ok
end
```

### 2. Mark Complete button (`app/views/rooms/show.html.erb`)

Add a button that POSTs to the complete endpoint via fetch:

```erb
<button id="mark-complete" onclick="markComplete()">Mark as complete</button>

<script>
  function markComplete() {
    fetch('<%= complete_puzzle_path(params[:series], params[:identifier], params[:room]) %>',
          { method: 'POST',
            headers: { 'X-CSRF-Token': '<%= form_authenticity_token %>' } })
      .then(() => {
        document.getElementById('mark-complete').textContent = 'Marked complete';
        document.getElementById('mark-complete').disabled = true;
      });
  }
</script>
```

On page load, also check if already completed and update button state accordingly (optional enhancement).

### 3. Server-side random endpoint

**`config/routes.rb`:**
```ruby
get ':series/random', to: 'crosswords#random', as: 'random_crossword'
```

**`app/controllers/crosswords_controller.rb`:**
```ruby
def random
  series = params[:series]
  room   = params[:room]
  config = Series::SERIES[series]
  return head :not_found unless config

  completed = room.present? ? redis.smembers("completed-#{room}") : []
  completed_ids = completed.map { |c| c.split('/').last.to_i }.to_set

  # Get the latest known puzzle number from the cached series data
  series_data = JSON.parse(redis.get("crossword-series-#{series}") || '[]')
  latest = series_data.map { |d| d['identifier'].to_i }.max
  return redirect_to root_path unless latest

  first  = config[:first_puzzle]
  skip_period = config[:skip_period]
  skip_ref    = config[:skip_ref]

  candidates = (first..latest).reject do |n|
    completed_ids.include?(n) ||
      (skip_period && skip_ref &&
       (((n - skip_ref) % skip_period + skip_period) % skip_period == skip_period - 1))
  end

  return redirect_to root_path if candidates.empty?

  identifier = candidates.sample
  if room.present?
    redirect_to room_path(series, identifier, room)
  else
    redirect_to crossword_path(series, identifier)
  end
end

private

def redis
  ::REDIS
end
```

### 4. Update the Random button (`app/views/page/index.html.erb`)

Replace the client-side `goToRandomPuzzle` JavaScript call with a redirect to the new server-side endpoint:

```javascript
function goToRandomPuzzle(form) {
  var series = form.series.value;
  var room   = form.room.value.trim();
  var errorEl = document.getElementById('goto-error');
  var option  = form.series.options[form.series.selectedIndex];

  if (!option.getAttribute('data-latest-puzzle')) {
    errorEl.textContent = 'No puzzles available for ' + series;
    return false;
  }

  errorEl.textContent = '';
  var url = '/' + encodeURIComponent(series) + '/random';
  if (room) url += '?room=' + encodeURIComponent(room);
  window.location = url;
  return false;
}
```

The random endpoint needs `room` as a query param:

**`config/routes.rb`:**
```ruby
get ':series/random', to: 'crosswords#random', as: 'random_crossword'
```

The controller reads `params[:room]` from the query string.

---

## Notes on the candidate range

The server-side random selection iterates `first..latest`, which could be a large range (e.g. Cryptic puzzles go from 21620 upwards). Building the candidates array is O(n) in the range size but happens in memory and is fast for ranges up to ~10,000.

The skip logic mirrors the existing JavaScript skip logic in `index.html.erb`, ensuring consistency.

---

## Files to modify

- `config/routes.rb` — add `complete` and `random` routes
- `app/controllers/rooms_controller.rb` — add `complete` action
- `app/controllers/crosswords_controller.rb` — add `random` action
- `app/views/rooms/show.html.erb` — add "Mark as complete" button
- `app/views/page/index.html.erb` — update `goToRandomPuzzle` to use server endpoint

---

## Effort

High. Requires new Redis data model, two new controller actions, coordination between homepage frontend and new backend endpoint, and careful handling of edge cases (no room specified, all puzzles completed, empty series).
