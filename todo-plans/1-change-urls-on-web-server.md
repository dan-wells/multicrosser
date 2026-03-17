# Change URLs on Web Server

**Context:** The TODO lists two sub-items: moving the app from `crosswords.wellsd.net` to `wellsd.net/crosswords`, and removing `crossword/` from puzzle URLs. The second sub-item is already marked `[x]` complete. The remaining work is purely a server/deployment change — no Rails application code needs modification.

**Files to modify:** None in the Rails app. Web server config (nginx or similar) outside the repo.

**Approach:**
- Update the nginx (or equivalent) server config to:
  1. Redirect `crosswords.wellsd.net` → `wellsd.net/crosswords`
  2. Serve the Rails app at `wellsd.net/crosswords` with a path prefix
- If a path prefix is needed, set `config.relative_url_root = '/crosswords'` in `config/application.rb` and update `config/routes.rb` to scope routes under `/crosswords`
- Update `RAILS_RELATIVE_URL_ROOT` env var if using Puma/Passenger

**Notes:** If the app is currently deployed at the root of `crosswords.wellsd.net`, a path prefix requires changes to route helpers, asset paths, and ActionCable config (`config/cable.yml`). A subdomain-to-path move is the non-trivial part; the nginx redirect itself is trivial.

**Effort:** Small (nginx config) to medium (if Rails path prefix needed)
