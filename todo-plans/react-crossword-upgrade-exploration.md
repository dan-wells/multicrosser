# Exploration: @guardian/react-crossword Upgrade — Keyboard Navigation Analysis

## Context

The multicrosser project uses the unscoped `react-crossword@0.2.0` package, which is
unmaintained. The user is considering migrating to `@guardian/react-crossword` (from
the `guardian/csnx` monorepo) and wants to know:

1. Which release changed clue navigation from Tab to `[` / `]`
2. Whether it makes sense to pin to a version before the change
3. Whether patching the old Tab behavior back in is feasible
4. How this relates to existing TODO items (see `todo-plans/5-update-package-versions.md`
   on branch `claude/plan-todo-items-r1u5z`)

---

## Finding: When Tab Navigation Changed

**This is not a single-version change — it happened across a complete rewrite.**

| Version | What happened |
|---------|---------------|
| **≤2.0.2** | Old codebase (same era as unscoped `react-crossword`). Tab navigates between clues. |
| **3.0.0** | **Complete rebuild.** Tab becomes standard browser behavior (moves focus between grid → clues panel → controls). No clue-by-clue keyboard shortcut exists at all. |
| 3.0.0 – 6.1.0 | No way to navigate between clues by keyboard (only arrow keys within the grid). |
| **6.2.0** | **Added `[` and `]` keys** to navigate between clues. |
| 6.3.0 – 16.0.0 (latest) | `[`/`]` navigation remains; mostly dependency bumps and minor features. |

**Source:** `CHANGELOG.md` from `guardian/csnx` repo; `npm view @guardian/react-crossword time`.

The v3.0.0 rebuild dropped Tab-navigates-clues entirely. The `[`/`]` feature was added
18 days later in v6.2.0 as the replacement. There is **no version of
`@guardian/react-crossword` ≥3.0.0 that has Tab-navigates-clues**.

---

## Recommendation: Pinning to a Pre-Change Version

**Pinning does not make sense.** Versions ≤2.0.2 are from the old codebase and offer no
advantage over the current unscoped `react-crossword@0.2.0` already in use. The v3.0.0
rebuild is a clean break — there's no intermediate version with modern code + old Tab
behavior.

---

## Patching Tab Behavior Back In

**Feasible and relatively simple.** The keyboard handling in v6.2.0+ already has `[`/`]`
navigation in the grid's `handleKeyDown`. A patch to also support Tab would be ~6 lines
in the same code block:

```typescript
if (event.key === 'Tab') {
  event.preventDefault();
  const currentEntry = entries.get(currentEntryId);
  if (event.shiftKey && currentEntry?.previousEntryId)
    handleSwitchClue(currentEntry.previousEntryId);
  else if (currentEntry?.nextEntryId)
    handleSwitchClue(currentEntry.nextEntryId);
}
```

### Patching approaches

The project currently uses **Yarn Classic (v1)** (based on `yarn.lock`).

| Approach | Pros | Cons |
|----------|------|------|
| **`patch-package`** | Works with Yarn v1 and npm. Well-established (~3M weekly downloads). Saves a `.patch` file in the repo that auto-applies on `postinstall`. | Extra devDependency. Requires `postinstall` hook. |
| **Yarn Berry `yarn patch`** | Built-in, no extra dependency. | Requires migrating to Yarn Berry (v2+), which is a separate project. |
| **`pnpm patch`** | Built-in, best-in-class for patching. | Requires migrating to pnpm. |
| **Fork the repo** | Full control. | Maintenance burden; must track upstream manually. |

**If patching:** Use `patch-package` for now (compatible with Yarn v1). If the project
migrates to pnpm or Yarn Berry as part of the broader package update (TODO item #5),
switch to the built-in patching at that time.

### Trade-off: is the patch worth maintaining?

The patch itself is small and isolated. However, `@guardian/react-crossword` has had
**13 major versions since v3.0.0**, and each bump could require re-verifying or updating
the patch. Given:

- The user doesn't have strong feelings about Tab vs `[]`
- Tab as standard browser navigation (grid → clues → controls) is arguably better for
  accessibility
- The `[]` keys are intuitive once you know they exist

**Recommendation: skip the patch and adopt `[`/`]`.** The maintenance cost outweighs
the ergonomic benefit. If the Tab behavior is later felt to be important, the patch
is simple enough to add at any time.

---

## Broader Upgrade Implications

Migrating from `react-crossword@0.2.0` to `@guardian/react-crossword` is **not a
version bump — it's a migration to a different package** with a completely different API
and significant new peer dependencies.

### New peer dependencies required

- `@emotion/react` ^11.11.4
- `@guardian/libs` (canary version)
- `@guardian/source` ^12.0.0
- `react` ^18.2.0 (current project uses React 16.6.3)
- `typescript` ~5.9.3 (current project has no TypeScript)

This pulls in the entire Guardian design system — a significant increase in dependency
footprint.

### API differences

The current code uses these on the component ref (in `app/javascript/packs/application.js`):

- `setCellValue(x, y, value, triggerCallback)` — for multiplayer sync
- `getCellValue(x, y)` — for conflict detection
- `updateGrid(initialState)` — for loading initial state
- `onMove` prop — callback for user input
- `data` prop — Guardian crossword JSON

These ref methods and props may not exist or may have different signatures in the new
package. The new package stores state in local storage and has a different data flow
model. This will require significant rework of the multiplayer synchronization code.

### Relevance to other TODO items

From `todo-plans/5-update-package-versions.md` (on `claude/plan-todo-items-r1u5z`):

- React 16 → 18 migration needed (`ReactDOM.render` → `createRoot`)
- Webpacker → esbuild migration recommended (webpacker is deprecated)
- ActionCable package update needed
- The across/down direction flip bug (noted in `TODO.md` line 16) is likely fixed

From the cross-cutting concern in `todo-plans/index.md`:

- Three tasks (timer #4, track rooms #3, limit random #7) depend on **completion
  detection**. The current `react-crossword` 0.2.0 may not expose a completion callback.
  The new `@guardian/react-crossword` _may_ provide better hooks for this, which would
  unblock the preferred approaches for all three features. This is worth investigating
  as part of the upgrade.

---

## Summary

1. **Don't pin to a pre-change version** — there's no useful version to pin to
2. **Upgrade to latest `@guardian/react-crossword`** when doing the broader package
   update (TODO item #5)
3. **Skip the Tab patch** unless it's strongly missed — the `[`/`]` keys work well,
   and the patch maintenance cost is high given the rapid major version cadence
4. If patching is desired later, use `patch-package` (Yarn v1 compatible) — it's a
   ~6-line change
5. The upgrade should be done as part of the broader TODO item #5, not in isolation,
   given the cascade of dependency changes required
6. **Investigate completion detection** in the new package — this could help unblock
   TODO items #3, #4, and #7
