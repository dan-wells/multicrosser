# Plan: Add Links to Fifteensquared Posts

**TODO item:** `Add links to fifteensquared posts per puzzle`

Notes from TODO:
- RSS feed: `http://www.fifteensquared.net/feed/`
- For old puzzles, need to see about parsing the archive (e.g. `https://www.fifteensquared.net/category/guardian/guardianquiptic/`)

---

## Context

Fifteensquared publishes explanations and discussions of Guardian crosswords shortly after they're published. Linking from a puzzle page to the corresponding post lets solvers read explanations after finishing.

The challenge is matching a Guardian puzzle (series + identifier number) to a Fifteensquared blog post. Fifteensquared post titles typically contain the puzzle name, e.g.:
- "Guardian Quiptic 1289 by Picaroon"
- "Guardian Cryptic No 29943"

---

## Approach

### Two tiers

**Tier 1 — RSS feed for recent puzzles:**

Scrape the Fifteensquared RSS feed on a schedule (alongside the existing Guardian RSS fetch). Parse post titles to extract series and puzzle number. Store the Fifteensquared URL in Redis, keyed by puzzle identifier.

**Tier 2 — Search URL fallback for older puzzles:**

For puzzles not found in the RSS cache, construct a link to the Fifteensquared search page for that puzzle number. This doesn't require scraping the archive.

Fifteensquared's search URL pattern: `https://www.fifteensquared.net/?s=quiptic+1289` (or similar — verify the actual search URL format on the site).

This means every puzzle can have a useful "Look up on Fifteensquared" link, even without a direct match. If a direct match was found via RSS, link to the specific post; otherwise link to a search.

---

## Implementation

### 1. RSS parsing model (`app/models/fifteensquared_feed.rb`)

```ruby
class FifteensquaredFeed
  FEED_URL = 'http://www.fifteensquared.net/feed/'

  # Maps Guardian series names to Fifteensquared title keywords
  SERIES_PATTERNS = {
    'quiptic'  => /quiptic\s+(?:no\.?\s*)?(\d+)/i,
    'cryptic'  => /cryptic\s+(?:no\.?\s*)?(\d+)/i,
  }

  def self.load
    response = Faraday.get(FEED_URL)
    xml = Nokogiri::XML(response.body)
    xml.css('item').each do |item|
      title = item.css('title').text
      link  = item.css('link').text
      SERIES_PATTERNS.each do |series, pattern|
        if (m = title.match(pattern))
          redis.set("fifteensquared-#{series}/#{m[1]}", link)
        end
      end
    end
  end

  def self.redis
    ::REDIS
  end
end
```

### 2. Rake task

Add to `lib/tasks/crosswords.rake`:

```ruby
desc 'Fetch Fifteensquared RSS and cache post URLs'
task load_fifteensquared: :environment do
  FifteensquaredFeed.load
end
```

Run on a schedule (e.g. daily cron), alongside the existing Guardian RSS task.

### 3. Look up URL in controller

In `RoomsController#show`, after loading puzzle data:

```ruby
@fifteensquared_url = redis.get("fifteensquared-#{crossword_identifier}")
@fifteensquared_search_url = fifteensquared_search_url
```

Helper method:

```ruby
def fifteensquared_search_url
  query = "#{params[:series]} #{params[:identifier]}"
  "https://www.fifteensquared.net/?s=#{CGI.escape(query)}"
end
```

### 4. Display in view (`app/views/rooms/show.html.erb`)

```erb
<p>
  <%- if @fifteensquared_url -%>
    <a href="<%= @fifteensquared_url %>">Discussion on Fifteensquared</a>
  <%- else -%>
    <a href="<%= @fifteensquared_search_url %>">Search Fifteensquared</a>
  <%- end -%>
</p>
```

---

## Notes on the archive approach (not recommended for now)

Scraping paginated archive pages (`https://www.fifteensquared.net/category/guardian/guardianquiptic/page/N/`) would give historical data but:
- Requires many HTTP requests (potentially hundreds of pages)
- Page structure may change
- The search URL fallback already provides a usable link for old puzzles without scraping

The archive can always be added later as a one-off backfill rake task if comprehensive historical links become important.

---

## Files to create/modify

- New: `app/models/fifteensquared_feed.rb`
- `lib/tasks/crosswords.rake` — add `load_fifteensquared` task
- `app/controllers/rooms_controller.rb` — add Redis lookup + search URL helper
- `app/views/rooms/show.html.erb` — add link

---

## Effort

Medium. RSS parsing and Redis storage follow the same pattern as the existing `CrosswordFeed`. The main uncertainty is the exact title format used by Fifteensquared (the regex may need tuning) and confirming the search URL pattern.
