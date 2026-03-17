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

For puzzles not found in the RSS cache, construct a link to the Fifteensquared search page. This means every puzzle gets a useful link without requiring archive scraping.

Search URL pattern: `https://www.fifteensquared.net/?s=quiptic+1289` (verify the actual format on the site).

---

## Implementation

### 1. RSS parsing model (`app/models/fifteensquared_feed.rb`)

```ruby
class FifteensquaredFeed
  FEED_URL = 'http://www.fifteensquared.net/feed/'

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

### 3. Look up URL in controller (`app/controllers/rooms_controller.rb`)

```ruby
@fifteensquared_url = REDIS.get("fifteensquared-#{crossword_identifier}")
@fifteensquared_search_url = "https://www.fifteensquared.net/?s=#{CGI.escape("#{params[:series]} #{params[:identifier]}")}"
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

## Homepage integration (optional)

The RSS fetch runs alongside the existing Guardian feed task, so fresh fifteensquared links will correspond to puzzles shown on the homepage. Consider surfacing a "discussion" link next to each entry in the homepage puzzle list, looked up in `PageController` and passed to `index.html.erb`.

## Notes on archive scraping

Scraping paginated archive pages would provide historical data but requires many HTTP requests and is fragile if the page structure changes. The search URL fallback already provides a usable link for old puzzles without scraping. An archive backfill rake task can be added later if comprehensive historical links become important.

---

## Files to create/modify

- New: `app/models/fifteensquared_feed.rb`
- `lib/tasks/crosswords.rake` — add `load_fifteensquared` task
- `app/controllers/rooms_controller.rb` — add Redis lookup + search URL helper
- `app/views/rooms/show.html.erb` — add link
- `app/views/page/index.html.erb` (optional: homepage discussion links)
- `app/controllers/page_controller.rb` (optional: look up fifteensquared URLs for listed puzzles)

---

## Effort

Medium. RSS parsing and Redis storage follow the same pattern as the existing `CrosswordFeed`. The main uncertainty is the exact title format used by Fifteensquared (the regex may need tuning).
