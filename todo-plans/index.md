# TODO Plans

Plans for each uncompleted TODO item, ranked 1–7 from most to least straightforward.

| # | File | Task | Effort |
|---|------|------|--------|
| 1 | [1-change-urls-on-web-server.md](1-change-urls-on-web-server.md) | Move from `crosswords.wellsd.net` → `wellsd.net/crosswords` | Small–medium |
| 2 | [2-add-links-to-setter-pages.md](2-add-links-to-setter-pages.md) | Link setter name to Guardian profile page | Very small |
| 3 | [3-track-previous-room-names.md](3-track-previous-room-names.md) | Pre-fill last room/puzzle; datalist of previous rooms | Small |
| 4 | [4-add-puzzle-timer.md](4-add-puzzle-timer.md) | Active-only puzzle timer | Small–medium |
| 5 | [5-update-package-versions.md](5-update-package-versions.md) | Update Rails, React, webpacker, etc. | Medium–high |
| 6 | [6-add-fifteensquared-links.md](6-add-fifteensquared-links.md) | Link to fifteensquared discussion posts | Medium–high |
| 7 | [7-limit-random-to-uncompleted-puzzles.md](7-limit-random-to-uncompleted-puzzles.md) | Exclude completed puzzles from random selection | High |

## Research

- [completion-detection-research.md](completion-detection-research.md) — What `@guardian/react-crossword@17.0.0` exposes (spoiler: no completion callback)

## Cross-cutting concern: completion detection

Three tasks depend on being able to detect when a user has completed a puzzle:

- **Task 4 (timer):** show final elapsed time on completion
- **Task 3 (track previous rooms):** clear the stored `last_puzzle`/`last_series` from localStorage
- **Task 7 (limit random):** trigger "mark as complete" to exclude the puzzle from future random picks

Establish early what `react-crossword` 0.2.0 actually exposes for this (callback, event, or nothing). If a completion callback exists, a single shared handler can serve all three features. If not, a manual "Mark as complete" button (already planned in task 7) becomes the shared solution for all three — the timer would show its final time when that button is pressed, and the localStorage would be cleared at the same time.
