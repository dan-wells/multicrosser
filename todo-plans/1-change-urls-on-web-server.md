# Plan: Change URLs on Web Server

**TODO item:** `crosswords.wellsd.net -> wellsd.net/crosswords`

The sub-item to remove the `crossword/` part from individual puzzle URLs is already marked complete.

---

## Context

The app is currently served at the subdomain `crosswords.wellsd.net`. The goal is to move it to a path on the main domain: `wellsd.net/crosswords`. This is a deployment/infrastructure change.

---

## Approach

### 1. Web server config (nginx or equivalent)

- Change the server block to listen on `wellsd.net` instead of `crosswords.wellsd.net`
- Add a `location /crosswords` block pointing to the Rails app (via Puma socket/port)
- Add a redirect from the old subdomain:

```nginx
server {
  server_name crosswords.wellsd.net;
  return 301 https://wellsd.net/crosswords$request_uri;
}
```

### 2. Rails path prefix

When the app is mounted at `/crosswords` rather than `/`, Rails needs to know about the prefix so that route helpers generate correct URLs.

Set the `RAILS_RELATIVE_URL_ROOT` environment variable (e.g. in the systemd unit or `.env`):

```
RAILS_RELATIVE_URL_ROOT=/crosswords
```

Or set it in `config/application.rb`:

```ruby
config.relative_url_root = '/crosswords'
```

Rails route helpers (`crossword_path`, `room_path`, `root_path` etc.) and asset helpers will automatically prepend the prefix once this is set.

### 3. ActionCable

ActionCable's WebSocket URL is configured in `config/cable.yml` and in the JavaScript consumer. Check that the consumer URL resolves correctly under the new path. In `app/javascript/channels/consumer.js` (or equivalent), the default `createConsumer()` call uses a relative URL (`/cable`) which will be resolved relative to the page origin — this should work without changes if the nginx config proxies `/crosswords/cable` correctly.

### 4. DNS

Remove the `crosswords` subdomain DNS record (or keep it for the redirect server block above).

---

## Files to modify

- **Web server config** (outside the Rails repo) — nginx or equivalent
- **`config/application.rb`** — add `config.relative_url_root` if not using the env var approach
- **Environment/deployment config** — set `RAILS_RELATIVE_URL_ROOT`

No changes required to routes, controllers, or views.

---

## Effort

Small. The Rails change is a one-liner; the main work is in the server config and DNS.
