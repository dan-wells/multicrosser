# Update Package Versions

**Context:** The app has locked old versions: Rails 7.0.0, React 16.6.3, `react-crossword` 0.2.0, `webpacker` 5.0 (deprecated), `redis` gem ~4.0. The TODO notes that the guardian website doesn't have the across/down flip issue — suggesting a newer `react-crossword` fixes this — and asks whether to keep tab-through-clues behaviour or switch to `[]` navigation.

**Ruby gem updates:**
- `rails ~> 7.0.0` → `~> 7.2` (or 8.0): review Rails upgrade guides for breaking changes
- `redis ~> 4.0` → `~> 5.0`: the Redis 5.x gem has API changes (`redis.set` etc. mostly unchanged, but check deprecations)
- `puma ~> 5.0` → `~> 6.0`: minimal breaking changes
- `webpacker ~> 5.0`: **deprecated** — consider migrating to `jsbundling-rails` + esbuild, or `propshaft` for assets. This is the most significant Ruby-side change.
- `sqlite3 ~> 1.4` → `~> 2.0`

**JS package updates:**
- `react` 16.6.3 → 18.x: React 18 changes `ReactDOM.render` → `createRoot`. `application.js` uses `ReactDOM.render(...)` — must update.
- `react-dom` same version constraint
- `react-crossword` 0.2.0 → latest: API may have changed; check prop names and callback signatures against current code. A newer version likely fixes the across/down flip issue noted in the TODO, and may expose better completion detection callbacks (relevant to tasks 3, 4, and 7).
- `actioncable` 5.2.1 → latest (`@rails/actioncable`)
- `webpack` 4 → 5 (already in resolutions but dev deps say 4): align

**Decision needed (from TODO):** Keep tab-through-clues behaviour, or switch to `[]` for navigation? This determines which `react-crossword` version/config to use.

**Approach:**
1. Update Gemfile gems one group at a time, run tests after each
2. If migrating away from webpacker: install `jsbundling-rails`, move JS entry point, update asset pipeline config
3. Update `package.json`, run `yarn upgrade`, fix breaking API changes
4. For React 18: update `ReactDOM.render` call in `application.js`
5. Test `react-crossword` callbacks (`onMove`, grid manipulation methods) against new API

**Files to modify:**
- `Gemfile`
- `package.json`
- `app/javascript/packs/application.js` (React 18 API)
- Potentially `config/application.rb`, `config/webpacker.yml` if migrating bundler

**Effort:** Medium–high due to webpacker migration and React 18 API changes.
