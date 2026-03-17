# Add Links to Setter Pages

**Context:** The puzzle page shows `Set by [Name]` but the name is not clickable. The goal is to link the setter's name to their Guardian profile page.

**Key question:** Does the crossword JSON's `creator` object include a `webUrl` or similar field beyond just `name`? The Guardian Content API typically provides a full URL for contributors (e.g. `"webUrl": "https://www.theguardian.com/profile/picaroon"`). Check a cached puzzle JSON (from Redis, or by inspecting the page source) to confirm the available fields before writing any code.

**Approach:**
1. Inspect the actual `creator` object to confirm available fields.
2. Wrap the setter name in a link in `show.html.erb` using whatever URL field is present:
   ```erb
   <%- if @parsed_crossword['creator'] -%>
     Set by <%= link_to @parsed_crossword['creator']['name'],
                        @parsed_crossword['creator']['webUrl'] %>
   <%- end -%>
   ```

**Files to modify:**
- `app/views/rooms/show.html.erb` — one-line change to wrap setter name in a link

**Effort:** Very small — one-line template change (assuming a URL is available in the JSON).
