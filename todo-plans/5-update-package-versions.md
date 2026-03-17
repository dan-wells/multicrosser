# Plan: Update Package Versions

**TODO item:** `Update package versions to be recent enough for easy installation/maintenance`

Notes from TODO:
- guardian website doesn't have the issue of flipping between across/down directions (suggesting a newer `react-crossword` fixes this)
- decide whether to keep tabbing through clues or update to `[]` to navigate

---

## Context

Current locked versions:
- `rails ~> 7.0.0` (Rails 7.0.x)
- `redis ~> 4.0`
- `puma ~> 5.0`
- `webpacker ~> 5.0` (deprecated — no longer maintained)
- `react` 16.6.3
- `react-dom` 16.6.3
- `react-crossword` 0.2.0
- `actioncable` 5.2.1
- `webpack` 4 (pinned in resolutions)

---

## Ruby Gem Updates

### Rails (`~> 7.0` → `~> 7.2` or `8.0`)

- Review the [Rails upgrade guide](https://guides.rubyonrails.org/upgrading_ruby_on_rails.html) for 7.0 → 7.2 / 8.0
- Main risks: autoloading changes, deprecated APIs
- Run the test suite after upgrading

### redis gem (`~> 4.0` → `~> 5.0`)

- Redis 5.x removed some deprecated methods but `get`/`set`/`exists?`/`hgetall`/`hmset`/`sadd`/`smembers` are all still present
- `REDIS.exists?` was added in 4.2; check whether the existing `redis.exists?(crossword_identifier)` call works (it should)
- `hmset` was deprecated in Redis 5 in favour of `hset` with hash args — update `MovesChannel#move`

### puma (`~> 5.0` → `~> 6.0`)

- Minimal breaking changes; mostly straightforward

### webpacker (`~> 5.0`) — **deprecated, needs migration**

webpacker is no longer maintained. The recommended migration path for Rails 7+ is one of:
- **`jsbundling-rails` + esbuild** — simplest drop-in; esbuild is fast and the config is minimal
- **`importmap-rails`** — no bundler at all; works if you're happy with ES modules and no npm packages (not suitable here given React dependencies)

Migration steps for `jsbundling-rails` + esbuild:
1. Remove `webpacker` gem; add `jsbundling-rails`
2. Run `rails javascript:install:esbuild`
3. Move entry point from `app/javascript/packs/application.js` to `app/javascript/application.js`
4. Update `javascript_pack_tag` → `javascript_include_tag` (or use the jsbundling tag helper)
5. Update `stylesheet_pack_tag` → `stylesheet_link_tag`
6. Remove `config/webpacker.yml`; configure esbuild in `package.json` scripts

### sass-rails

With `jsbundling-rails`, SCSS can be handled by esbuild or by `cssbundling-rails`. Update accordingly.

---

## JavaScript Package Updates

### react + react-dom (16.6.3 → 18.x)

**Breaking change:** `ReactDOM.render` was removed in React 18. Update `app/javascript/packs/application.js`:

```javascript
// Before (React 16):
ReactDOM.render(<Crossword ... />, crosswordElement);

// After (React 18):
import { createRoot } from 'react-dom/client';
const root = createRoot(crosswordElement);
root.render(<Crossword ... />);
```

The `crosswordRef` usage (`crosswordRef.current.setCellValue(...)`) should still work.

### react-crossword (0.2.0 → latest)

This is the most impactful JS change. The current version (0.2.0) has the across/down flip issue noted in the TODO. A newer version fixes this.

**Decisions needed before upgrading:**
1. **Tab navigation vs `[]` navigation:** Decide which behaviour to keep. Check the newer `react-crossword` changelog/docs for how clue navigation is configured in the new API.
2. **Prop API changes:** Verify that `data`, `loadGrid`, `saveGrid`, `onMove`, and ref methods (`setCellValue`, `getCellValue`, `updateGrid`) still exist in the new API — they may have been renamed or restructured.

Check the [react-crossword changelog](https://github.com/JaredReisinger/react-crossword) before upgrading.

### actioncable (5.2.1 → latest)

Replace with `@rails/actioncable`. Update the import in `app/javascript/subscription.js` (or wherever `createSubscription` is defined):

```javascript
// Before:
import ActionCable from 'actioncable';
// After:
import { createConsumer } from '@rails/actioncable';
```

### webpack (4 → 5)

If migrating to esbuild, webpack is no longer needed — remove it entirely. If staying with webpacker (not recommended), the `resolutions` in `package.json` already pin webpack to 4; upgrading to 5 would require updating webpacker config.

---

## Recommended Update Sequence

1. Upgrade Ruby gems first (Rails, redis, puma) — least risky
2. Migrate from webpacker to jsbundling-rails + esbuild
3. Upgrade React to 18 and fix `ReactDOM.render`
4. Upgrade `react-crossword` — test carefully for the flip fix and any prop/API changes
5. Upgrade `actioncable` → `@rails/actioncable`
6. Run the full test suite and manually test the crossword

---

## Files to modify

- `Gemfile` — update gem versions, replace webpacker
- `package.json` — update JS dependencies, add esbuild scripts
- `app/javascript/packs/application.js` → move to `app/javascript/application.js`, update React 18 API
- `app/views/rooms/show.html.erb` — update `javascript_pack_tag` / `stylesheet_pack_tag`
- `app/views/layouts/application.html.erb` — same tag updates
- `config/webpacker.yml` — remove (replaced by esbuild config in package.json)

---

## Effort

Medium–high. The webpacker migration and React 18 API change are the most disruptive parts. The `react-crossword` upgrade requires careful testing.
