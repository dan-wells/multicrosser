# nonogen

A dependency-free C program that generates nonograms.
Every puzzle it emits has exactly one solution, reachable by line-by-line deduction alone.

`Source::Nonograms` shells out to it once per puzzle and caches the JSON in Redis.
The puzzle identifier in a URL is the generator's seed, so a puzzle is reproducible from its link and nothing needs to be stored to keep that link meaningful.

## Build

```
make            # or `make -C ext/nonogen` from the project root
```

`bin/setup` and `deploy/deploy.sh` both do this.
The binary is gitignored.

### Versioning

Any change to the generator changes the puzzle a given seed produces.
Bump `GENERATOR_VERSION` when that happens and flush the cached nonograms, or a room will serve clues from one version against a solution from another.
The version is copied into each cached puzzle's `generator` field.

## Usage

```
./nonogen --seed 1337 --size 15
./nonogen --seed 1337 --rows 10 --cols 20 --density 0.4
./nonogen --selftest
```

| Option | Default | Meaning |
|---|---|---|
| `--seed N` | required | Seeds the PRNG; the whole output is a function of it |
| `--size N` | 15 | Shorthand for equal `--rows` and `--cols` |
| `--rows N` / `--cols N` | – | Set independently for a non-square grid |
| `--density D` | 0.5 | Fraction of cells filled, rounded to an exact count |
| `--beta B` | per size | Clustering strength; 0 gives a uniformly random grid |
| `--sweeps N` | 20 | Clustering proposals per cell |
| `--max-spans N` | 6 | Most runs allowed in one line; 0 for no limit |
| `--max-run N` | line - 1 | Longest run allowed; the default forbids a solid line |
| `--allow-empty-lines` | off | Permit a blank row or column |
| `--min-passes N` / `--max-passes N` | 0 | Accept only puzzles taking this many solver passes |
| `--repair N` | 50 | Repair attempts before redrawing the grid from scratch |
| `--timeout-ms N` | 10000 | Give up rather than search forever |
| `--selftest` `[--cases N]` | 200000 | Run the [checks below](#testing) and exit |

Output is one line of JSON on stdout:

```json
{"task":"2.1/3/...","dimensions":{"cols":5,"rows":5},"colClues":[[2,1],...],
 "rowClues":[[1,1],...],"solution":"nynyy...","generator":"nonogen-2",
 "passes":3,"solves":1}
```

`task` is the clue string the client already understands (columns first, then rows, groups separated by `/` and runs by `.`).
`solution` is row-major, `y` for filled.
`passes` and `solves` are diagnostics: propagation passes to reach the full grid, and candidate grids tried.

## How it works

1. Draw a grid with the requested number of filled cells.
2. Cluster the filled cells together to reduce the number of short runs.
3. Derive the clues from the grid.
4. Reject it outright if it breaks a constraint – a blank line, too many runs in a line, or a run that is too long.
5. Solve it by line propagation from blank: for each line in turn, fix the cells that hold the same value in *every* placement of that line's clue consistent with what is already known. Repeat until a pass fixes nothing.
6. Accept if every cell was fixed. Otherwise repair the grid – swap one filled and one empty cell from the region the solver could not determine – and go back to step 3. After `--repair` attempts, draw a fresh grid instead.

### Why the solution is unique

Each cell the solver fixes is *entailed* – it holds that value in every valid placement of its line's clue, given what is already known.
By induction, the fully fixed grid is the only solution, and acceptance means no guessing is needed, since the solver only ever reasons about a single line.
There is no uniqueness search and no backtracking; correctness rests on one function, `line_solve`, which is small, pure and exhaustively testable.

### Why the grid is clustered

A uniformly random half-filled grid produces many one- and two-cell runs per line (6.4 at 25×25, vs ~3.4 in puzzles published on [puzzle-nonograms.com](https://www.puzzle-nonograms.com/)), which reads as noise and fills the clue gutters.

`anneal` fixes this before the clues are derived.
It proposes swapping a random filled cell with a random empty one and accepts with Metropolis probability `min(1, exp(-beta * dE))`, where the energy is the boundary length of the filled region – fewer boundary edges means fewer, longer runs.
Higher `--beta` clusters more strongly; the default per size is calibrated to match published puzzle density.
Clustered grids are also easier to line-solve, so this also speeds up generation at larger puzzle sizes compared to uniform sampling.

`--beta` defaults per size (`default_beta`), calibrated so a line carries about as many runs as a published puzzle of that size:

| size | beta | runs per line | worst runs per line | longest run | time per puzzle |
|---|---|---|---|---|---|
| 5x5 | 0.3 | 1.5 | 2-3 | 3-4 | 1.7 ms |
| 10x10 | 0.6 | 2.1 | 3-4 | 6-9 | 2.3 ms |
| 15x15 | 0.65 | 2.8 | 4-5 | 8-13 | 2.7 ms |
| 20x20 | 0.8 | 2.9 | 5-6 | 12-18 | 5.0 ms |
| 25x25 | 0.8 | 3.4 | 5-6 | 14-20 | 8.0 ms |

Times include process spawn, measured over 200 seeds on a development machine; the production box is roughly 6x slower.

## Testing

```
./nonogen --selftest --cases 20000
```

- **Line solver against brute force.** For random clues, line lengths and known-cell patterns, enumerate every placement directly and intersect them, then compare against `line_solve`. Any disagreement is reported.
- **Generated puzzles against their own promise.** Re-derive the clues from the emitted grid and check they match what was printed, check the constraints hold, and check that line propagation recovers that exact grid.

`test/models/source/nonograms_test.rb` runs `--selftest` as part of `bundle exec rails test`, so a broken solver fails the Ruby suite.
