# Add Links to Fifteensquared Posts

**Context:** Fifteensquared.net publishes explanations/discussions of Guardian crosswords after they're published. Linking from a puzzle page to the corresponding fifteensquared post would add value for solvers who want to see the solution explained.

**Challenge:** Matching a Guardian puzzle (series + number) to a fifteensquared post requires either:
- The RSS feed (latest ~20 posts): `http://www.fifteensquared.net/feed/`
- Category archive pages (e.g. `https://www.fifteensquared.net/category/guardian/guardianquiptic/`) for older puzzles

The RSS approach won't work for old puzzles. The archive approach requires pagination scraping.

**Approach:**
1. **Fetch RSS on a schedule** (add to the existing `crosswords.rake` task): parse fifteensquared RSS, extract puzzle title (contains series+number, e.g. "Quiptic 1289") and post URL, store in Redis: `REDIS.set("fifteensquared-quiptic/1289", post_url)`.
2. **Archive backfill task**: scrape paginated archive pages (`?page=N`) via Nokogiri, extract article titles + URLs, parse out series/number, store same Redis key pattern.
3. **Display on puzzle page**: in `RoomsController`, after loading puzzle JSON, look up `REDIS.get("fifteensquared-#{crossword_identifier}")` and pass `@fifteensquared_url` to the view.
4. **Link in view**: in `show.html.erb`, add `<a href="<%= @fifteensquared_url %>">Discussion on Fifteensquared</a>` if present.

**Title parsing:** Fifteensquared titles follow patterns like "Quiptic No 1289" or "Guardian Quiptic 1289 by Setter" — need a robust regex.

**Homepage integration:** The RSS fetch is run alongside the existing Guardian feed task, so fresh fifteensquared posts will be indexed whenever the rake task runs. Since the homepage already shows the 5 most recent puzzles per series (populated from the same feed cycle), any RSS-fetched fifteensquared links will naturally correspond to puzzles that are likely showing on the homepage. Consider surfacing the fifteensquared link directly in the homepage list alongside each puzzle title — a small "discussion" link next to each entry — in addition to the puzzle page link.

**Files to modify:**
- `lib/tasks/crosswords.rake` (add fifteensquared fetch tasks)
- New: `app/models/fifteensquared_feed.rb` (RSS + archive parsing)
- `app/controllers/rooms_controller.rb` (Redis lookup)
- `app/views/rooms/show.html.erb` (link display)
- `app/views/page/index.html.erb` (optional homepage link per puzzle)
- `app/controllers/page_controller.rb` (optional: look up fifteensquared URLs for the listed puzzles)

**Effort:** Medium–high. Scraping pagination is the uncertain part (page structure may change).
