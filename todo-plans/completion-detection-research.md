# Completion Detection in @guardian/react-crossword@17.0.0

Research into what the migrated crossword package exposes for detecting
puzzle completion — relevant to tasks 3, 4, and 7.

## Summary

**No completion callback or event is exposed.** The package has no
`onComplete`, `onSolved`, or similar prop. The only external callback
is `onMove({ x, y, value, previousValue })`, which fires per cell.

## What exists internally

| Mechanism | Location | What it does |
|-----------|----------|--------------|
| `ValidAnswers` context | `dist/context/ValidAnswers.js` | Maintains a `Set<string>` of entry IDs confirmed correct via Check buttons |
| Clue completion check | `dist/components/Clues.js` | Checks if all cells in a clue are filled (not necessarily correct); dims completed clues to 0.6 opacity |
| Check word / Check all | `dist/components/Controls.js` | Compares progress against solutions; updates `validAnswers` set; removes incorrect letters |
| Progress context | `dist/context/Progress.js` | `string[][]` grid of cell values; we've already patched this to disable localStorage |

All of these are **internal contexts** — not exported from the public
API. The only public export is the `Crossword` component itself.

## What we have access to

Through our existing patches:

- **`onMove` callback** (patched into `ContextProvider.js` /
  `useUpdateCell.js`): fires on every cell change with
  `{ x, y, value, previousValue }`.
- **`CrosswordHandle` ref** (patched into `Crossword.js`): exposes
  `setCellValue(x, y, value)`, `getCellValue(x, y)`, and
  `updateGrid(moves)`. No completion-related methods.

## Options for detecting completion

### Option A: Poll via onMove + ref (automatic detection)

On each `onMove` call, check whether all cells are filled by iterating
the crossword data's cell list and calling `getCellValue(x, y)` on
each. This detects "grid full" but **not "grid correct"** — the
solutions are in the CAPI data object, so we could compare against
those too, but that would reveal answers without the user choosing to
check.

Pros: fully automatic, no user action required.
Cons: runs on every keystroke; needs access to the cell list from the
crossword data to know which cells to check.

### Option B: Manual "Mark as complete" button (already in task 7 plan)

A button outside the React component that the user clicks when done.
Triggers the completion handler for all three tasks.

Pros: simple, no dependency on internal state, user-controlled.
Cons: requires user action; could forget to click it.

### Option C: Hybrid — auto-detect grid full, confirm with user

Detect when all cells are filled (Option A), then show a prompt or
highlight the "Mark as complete" button. Doesn't reveal correctness.

### Option D: Patch an `onCheckAll` callback into Controls.js

The existing "Check all" button in `CheckGrid` (`Controls.js`) already
computes which entries are valid vs invalid. After it runs, if
`invalidAnswers` is empty, the entire grid is correct. We can patch
three files to expose this:

1. **`ContextProvider.js`**: Add `OnCheckAllContext` + `useOnCheckAll`
   (same pattern as our existing `onMove` context)
2. **`Crossword.js`**: Accept `onCheckAll` prop, thread it through
   `ContextProvider`
3. **`Controls.js`**: Import `useOnCheckAll`; at the end of
   `CheckGrid.check()`, call
   `onCheckAll({ isComplete: invalidAnswers.size === 0 })`

Pros: definitive correctness signal (not just "grid full"); uses the
component's own solution-checking logic; fires only on deliberate user
action (Check all); small patch touching 3 files we already patch.
Cons: requires the user to click Check all — not fully automatic.

## Recommendation

**Option D (patch `onCheckAll`) is the best approach.** It gives a
definitive "puzzle solved" signal with minimal patching, and the user
action (clicking Check all) is a natural part of the solving flow. The
three files it touches are all already patched for other reasons.

Option B (manual button) remains a useful fallback or complement — e.g.
for puzzles the user has already completed elsewhere and wants to mark
off without re-checking.

## Impact on existing plans

The "cross-cutting concern" section in `index.md` asked whether
`react-crossword` exposes a completion callback. The answer is **no**,
but we can create one by patching the Check all button. A single
`onCheckAll({ isComplete })` handler can serve all three features:

- **Task 3 (track previous rooms):** clear `last_puzzle`/`last_series`
  from localStorage when `isComplete` is true
- **Task 4 (timer):** show final elapsed time when `isComplete` is true
- **Task 7 (limit random):** POST to server to record completion in
  Redis when `isComplete` is true

A manual "Mark as complete" button (task 7) is still useful as a
secondary trigger for puzzles the user doesn't want to Check all.
