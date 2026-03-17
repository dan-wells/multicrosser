# Plan: Add Links to Setter Pages

**TODO item:** `Add links to setter pages`

---

## Context

The puzzle page (`app/views/rooms/show.html.erb`) currently displays the setter's name as plain text:

```erb
<%- if @parsed_crossword['creator'] -%>
  Set by <%= @parsed_crossword['creator']['name'] %>
<%- end -%>
```

The goal is to make the setter's name a clickable link to their page on the Guardian website.

---

## Key Unknown: Creator URL Field

The Guardian crossword JSON is fetched from the `CrosswordComponent` island props on the Guardian page and cached in Redis. Currently only `creator['name']` is used. The Guardian's data structures typically include a `webUrl` field on contributor objects (e.g. `"webUrl": "https://www.theguardian.com/profile/picaroon"`).

**First step:** Inspect the actual `creator` object to confirm available fields. Options:
- Check a cached value in Redis: `redis-cli GET quiptic/1289 | python3 -m json.tool | grep -A5 creator`
- Inspect the Guardian page source for `CrosswordComponent` props and look at the `creator` key

---

## Approach

### If `creator['webUrl']` is present (most likely)

Replace the plain-text setter name with a link in `app/views/rooms/show.html.erb`:

```erb
<%- if @parsed_crossword['creator'] -%>
  Set by <%= link_to @parsed_crossword['creator']['name'],
                     @parsed_crossword['creator']['webUrl'] %>
<%- end -%>
```

This links directly to the setter's Guardian profile page (e.g. `https://www.theguardian.com/profile/picaroon`), which lists all their crosswords.

### If only `creator['name']` is available

The Guardian profile URL cannot be reliably constructed from a display name alone (e.g. "Paul" → `/profile/paul` is not guaranteed). Options in that case:

- Link to a Guardian crossword search: `https://www.theguardian.com/crosswords/series/#{params[:series]}` (series page, not setter-specific — not ideal)
- Skip making the name a link until a URL field is confirmed available

---

## Files to modify

- `app/views/rooms/show.html.erb` — wrap setter name in `link_to`

---

## Effort

Very small — a one-line template change once the URL field is confirmed.
