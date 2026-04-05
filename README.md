# Multiplayer Crosswords with Multicrosser

This is a Rails Application that uses WebSockets and the [react-crossword](https://github.com/zetter/react-crossword) component to create multiplayer crosswords, originally created by [Chris Zetter](https://chriszetter.com). You can [read a blog post about why he built it and how it works](https://chriszetter.com/blog/2018/12/02/multiplayer-crosswords/).

You can see a demo at [wellsd.net/crosswords](https://wellsd.net/crosswords).

## The Source of the Crosswords Data

Crosswords are scraped from the Guardian Crossword pages which contain a JSON representation of each crossword. The crosswords are re-used following their [Open Licence Terms](https://syndication.theguardian.com/open-licence-terms/).

## Setup

To run this project:
+ Install Redis and make sure the server is running
+ Run `./bin/setup` to install Ruby and JavaScript dependencies
+ Run `./bin/rails crosswords:load_from_feed` to load the latest crosswords to display on the homepage
+ Run `yarn build` to compile JavaScript and CSS assets
+ Run `bin/dev` to start the Rails server and esbuild watch process together (or run `bin/rails server` and `yarn build --watch` in separate terminals)

After pulling changes, run `./bin/update` to install any new dependencies, rebuild assets, and restart the server.

## Deployment

On the production server, from `/var/www/multicrosser`:

```
sh deploy/deploy.sh
```

This pulls the latest code, installs dependencies, builds JS/CSS assets, precompiles for the asset pipeline, and restarts the app.

## Codebase Overview

### URL Routing (`config/routes.rb`)

- `/` — the homepage
- `/crossword/:source/:series/:identifier` — generates a random room ID and redirects to the URL below (so each visitor gets a fresh private session unless they share the link)
- `/crossword/:source/:series/:identifier/:room` — the actual multiplayer crossword page

### Backend: Controllers (`app/controllers/`)

- `page_controller.rb` — serves the homepage; asks `Series` for the list of recent crosswords to display
- `crosswords_controller.rb` — handles crossword URLs that don't yet have a room ID; generates a random room ID and redirects
- `rooms_controller.rb` — serves the crossword page; fetches the puzzle JSON from the Guardian (or from Redis if already cached) and passes it to the view

### Backend: Models (`app/models/`)

- `series.rb` — holds the list of active crossword series (quiptic, quick, weekend, etc.); `get_all` reads their metadata from Redis and returns the most recent 5 per series
- `crossword.rb` — represents a crossword's metadata (title, series, identifier, date); `save` writes it to the Redis series list
- `crossword_feed.rb` — fetches the Guardian's RSS feed and saves metadata for recent crosswords into Redis

### Backend: Channel (`app/channels/moves_channel.rb`)

Handles the WebSocket connection for a room:

- When a client joins: sends them the current grid state from Redis
- When a client sends a move: records the letter in Redis and broadcasts it to everyone else in the room

### Frontend (`app/javascript/`)

- `crossword.js` — entry point; renders the React crossword component into the page
- `homepage.js` — entry point for the homepage; handles form state, puzzle/room history, and navigation
- `lib/subscription.js` — connects to the server over WebSocket; sends moves the user types, and applies moves received from other players
- `lib/move_buffer.js` — queues moves in the browser's local storage while offline; replays them when the connection is restored

### Views (`app/views/`)

- `page/index.html.erb` — the homepage: lists recent crosswords grouped by series
- `rooms/show.html.erb` — the crossword page: shows the title, date, setter, and the interactive grid

### Styling

There are two separate CSS pipelines:

- `app/assets/stylesheets/application.css` — processed by Sprockets (the Rails asset pipeline). Contains global styles for layout, typography, and the homepage.
- `app/javascript/lib/crossword-overrides.css` — bundled by esbuild (imported in `crossword.js`). Contains overrides for styles injected at runtime by the `react-crossword` component.

In production, assets are compiled in two steps:

```
RAILS_ENV=production yarn build
RAILS_ENV=production bundle exec rails assets:precompile
```

`yarn build` runs esbuild and outputs `crossword.js`, `crossword.css`, and `homepage.js` to `app/assets/builds/`. Sprockets then fingerprints everything (including those files) into `public/assets/`.

## Testing

Make sure Redis is running, then:

```
bundle exec rails test                              # all tests
bundle exec rails test test/models/crossword_test.rb  # a single file
```

Tests use a separate Redis database (db 1) so they won't affect your development data.

## How it works

### Sending a Move

Here's what happens when a player types a character:

1. Client: `react-crossword` calls `setCellValue` to update the grid
  * `setCellValue` calls the `onMove` callback with cell location and value
  * `onMove` callback calls the `move` function in the action cable subscription
  * The `move` function sends the move to the server
2. Server: `MovesChannel#move` is run
  * The move is recorded in Redis
  * The move is rebroadcast to others in the channel
3. On all clients:
  * The `received` function runs in the Action Cable subscriptions which calls the `onReceiveMove` callback
  * `onReceiveMove` calls `setCellValue` with the `triggerOnMoveCallback` option set to `false` so `onMove` isn't called again
  * `setCellValue` updates the crossword gird

### Loading Crosswords

The homepage displays a list of recent crosswords per series. This metadata (title, series, identifier, date) is loaded from the Guardian's RSS feed by the `crosswords:load_from_feed` rake task, which stores the most recent 5 crosswords per series in Redis.

Any crossword can also be accessed directly by URL (e.g. `/rooms/guardian/quiptic/1`) without appearing on the homepage. The first time a crossword is opened, `RoomsController` fetches the puzzle data from the Guardian website, extracts the JSON from the page's `CrosswordComponent` element, and caches it in Redis for subsequent visits.

### Working with Intermittent Connections

If the move can't be broadcast with Action Cable it's stored in the `MoveBuffer`. On reconnection:

1. The remote state of the grid will be received from the server and updated
2. The moves in the moves buffer will be replayed

When the move `MoveBuffer` is replayed, moves will only apply if the cell they change still has the same character in it when the move was made. For example, if you change an 'A' to a 'B' while offline this move will be discarded if someone has since changed the 'A' to a 'C' and broadcast it to the server before you.

The `MoveBuffer` uses local storage so will persist if the page is refreshed or the browser is closed.

### Redis

Redis is used for three purposes:

+ **Homepage crossword lists** — keyed by `crossword-series-{name}` (e.g. `crossword-series-quiptic`). Each key holds a JSON array of crossword metadata objects (title, source, series, identifier, date), ordered most recent first.
+ **Cached puzzle data** — keyed by `{source}/{series}/{identifier}` (e.g. `guardian/quiptic/1289`). Each key holds the full crossword JSON fetched from the Guardian. Populated lazily the first time a crossword is opened.
+ **Room grid state** — keyed by `moves_channel-{crossword}-{room}`. A Redis hash mapping cell coordinates (`x-y`) to their current values. This is the authoritative state of each multiplayer solving session.
