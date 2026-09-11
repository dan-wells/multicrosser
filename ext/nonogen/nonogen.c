/* Nonogram generator.
 *
 * Draws candidate grids from a seeded stream until one is solvable by line
 * propagation alone, which makes its solution unique and reachable without
 * guessing, and prints it as JSON for `Source::Nonograms` to cache.
 *
 *   nonogen --seed 12345 --size 15
 *   nonogen --seed 12345 --rows 10 --cols 20 --density 0.5
 *   nonogen --selftest
 *
 * Output is a pure function of the arguments, so a seed can be used as a
 * durable puzzle identifier. Changing the generator changes every puzzle:
 * bump GENERATOR_VERSION when that happens, so cached puzzles stay traceable
 * to the code that produced them.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <time.h>

#define GENERATOR_VERSION "nonogen-1"

#define MAXN 64
#define MAXK (MAXN / 2 + 1)

typedef uint64_t u64;
typedef uint32_t u32;

/* ---------- bit helpers ---------- */

static u64 runmask(int start, int len)
{
    if (len <= 0) return 0;
    return ((len >= 64) ? ~0ULL : ((1ULL << len) - 1)) << start;
}

static u64 fullmask(int n)
{
    return (n >= 64) ? ~0ULL : ((1ULL << n) - 1);
}

/* ---------- PRNG ---------- */

/* splitmix64, so that a seed means the same puzzle on every platform. */
static u64 rng_state;

static void rng_seed(u64 seed)
{
    rng_state = seed;
}

static u64 rng_next(void)
{
    u64 z = (rng_state += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

/* Lemire's multiply-shift, rejecting the biased tail. */
static u64 rng_below(u64 bound)
{
    u64 r = rng_next();
    __uint128_t m = (__uint128_t)r * (__uint128_t)bound;
    u64 low = (u64)m;

    if (low < bound) {
        u64 threshold = (~bound + 1) % bound;
        while (low < threshold) {
            r = rng_next();
            m = (__uint128_t)r * (__uint128_t)bound;
            low = (u64)m;
        }
    }
    return (u64)(m >> 64);
}

/* ---------- line solver ---------- */

/* Fixes every cell of one line whose value is the same in all placements of
 * `clue` consistent with the cells already known.
 *
 * `known` marks decided cells and `val` says which of those are filled, both
 * as bitmasks over the line. Returns 0 if no placement is consistent at all.
 *
 * `F[j][i]` says runs 0..j-1 fit in cells 0..i-1 with cell i free to start,
 * and `B[j][i]` says runs j..k-1 fit in cells i..n-1. A transition out of a
 * reachable F state into a reachable B state is one placement's worth of
 * evidence, so the cells it covers can be filled and the gap it leaves can be
 * empty. A cell that never collects both kinds of evidence is forced.
 */
static int line_solve(const int *clue, int k, int n, u64 known, u64 val,
                      u64 *out_known, u64 *out_val)
{
    static char F[MAXK + 1][MAXN + 2];
    static char B[MAXK + 1][MAXN + 2];
    u64 known_filled = known & val;
    u64 known_empty = known & ~val;
    u64 can_fill = 0, can_empty = 0;
    int i, j;

    for (j = 0; j <= k; j++) {
        memset(F[j], 0, (size_t)n + 2);
        memset(B[j], 0, (size_t)n + 2);
    }

    F[0][0] = 1;
    for (i = 0; i <= n; i++) {
        for (j = 0; j <= k; j++) {
            if (!F[j][i]) continue;
            if (i < n && !((known_filled >> i) & 1)) F[j][i + 1] = 1;
            if (j < k) {
                int end = i + clue[j];
                if (end <= n && !(known_empty & runmask(i, clue[j]))) {
                    if (end == n) F[j + 1][n] = 1;
                    else if (!((known_filled >> end) & 1)) F[j + 1][end + 1] = 1;
                }
            }
        }
    }
    if (!F[k][n]) return 0;

    B[k][n] = 1;
    for (i = n; i >= 0; i--) {
        for (j = k; j >= 0; j--) {
            char reachable = (i == n && j == k);
            if (!reachable && i < n && !((known_filled >> i) & 1) && B[j][i + 1]) reachable = 1;
            if (!reachable && j < k) {
                int end = i + clue[j];
                if (end <= n && !(known_empty & runmask(i, clue[j]))) {
                    if (end == n) reachable = B[j + 1][n];
                    else if (!((known_filled >> end) & 1)) reachable = B[j + 1][end + 1];
                }
            }
            B[j][i] = reachable;
        }
    }

    for (i = 0; i <= n; i++) {
        for (j = 0; j <= k; j++) {
            if (!F[j][i]) continue;
            if (i < n && !((known_filled >> i) & 1) && B[j][i + 1]) can_empty |= 1ULL << i;
            if (j < k) {
                int end = i + clue[j], ok = 0;
                if (end <= n && !(known_empty & runmask(i, clue[j]))) {
                    if (end == n) ok = B[j + 1][n];
                    else if (!((known_filled >> end) & 1)) ok = B[j + 1][end + 1];
                }
                if (ok) {
                    can_fill |= runmask(i, clue[j]);
                    if (end < n) can_empty |= 1ULL << end;
                }
            }
        }
    }

    *out_known = fullmask(n) & ~(can_fill & can_empty);
    *out_val = can_fill & ~can_empty;
    return 1;
}

/* ---------- grid solver ---------- */

typedef struct {
    int rows, cols;
    int row_clue[MAXN][MAXK], row_len[MAXN];
    int col_clue[MAXN][MAXK], col_len[MAXN];
} Puzzle;

/* Line propagation over rows then columns until a pass changes nothing.
 * Returns 1 only if every cell was fixed, which is what makes the puzzle
 * both uniquely solvable and solvable without guessing. `known_out`, when
 * given, receives the cells that were determined, so a caller that wants to
 * repair a stalled grid knows where it went wrong; `val_out` receives the
 * grid it recovered.
 */
static int grid_solve(const Puzzle *p, int *passes_out, u64 *known_out, u64 *val_out)
{
    u64 row_known[MAXN], row_val[MAXN];
    u64 colmask = fullmask(p->cols);
    int r, c, changed = 1, passes = 0;

    memset(row_known, 0, sizeof row_known);
    memset(row_val, 0, sizeof row_val);

    while (changed) {
        changed = 0;
        passes++;

        for (r = 0; r < p->rows; r++) {
            u64 nk, nv;
            if (!line_solve(p->row_clue[r], p->row_len[r], p->cols, row_known[r], row_val[r], &nk, &nv))
                return 0;
            if (nk != row_known[r]) changed = 1;
            row_known[r] = nk;
            row_val[r] = nv;
        }

        for (c = 0; c < p->cols; c++) {
            u64 ck = 0, cv = 0, nk, nv;
            for (r = 0; r < p->rows; r++) {
                if (!((row_known[r] >> c) & 1)) continue;
                ck |= 1ULL << r;
                if ((row_val[r] >> c) & 1) cv |= 1ULL << r;
            }
            if (!line_solve(p->col_clue[c], p->col_len[c], p->rows, ck, cv, &nk, &nv))
                return 0;
            if (nk == ck) continue;
            changed = 1;
            for (r = 0; r < p->rows; r++) {
                if (!((nk >> r) & 1)) continue;
                row_known[r] |= 1ULL << c;
                if ((nv >> r) & 1) row_val[r] |= 1ULL << c;
                else row_val[r] &= ~(1ULL << c);
            }
        }
    }

    if (passes_out) *passes_out = passes;
    for (r = 0; r < p->rows; r++) {
        if (known_out) known_out[r] = row_known[r];
        if (val_out) val_out[r] = row_val[r];
    }
    for (r = 0; r < p->rows; r++)
        if (row_known[r] != colmask) return 0;
    return 1;
}

/* ---------- generation ---------- */

typedef struct {
    int rows, cols, fill;
    int allow_empty_lines;
    int min_passes, max_passes;
    int repair_budget;
    long timeout_ms;
} Options;

static void clues_from_line(u64 line, int n, int *clue, int *len)
{
    int i, run = 0;

    *len = 0;
    for (i = 0; i < n; i++) {
        if ((line >> i) & 1) {
            run++;
        } else if (run) {
            clue[(*len)++] = run;
            run = 0;
        }
    }
    if (run) clue[(*len)++] = run;
}

static void clues_from_grid(const u64 *grid, Puzzle *p)
{
    int r, c;

    for (r = 0; r < p->rows; r++)
        clues_from_line(grid[r], p->cols, p->row_clue[r], &p->row_len[r]);
    for (c = 0; c < p->cols; c++) {
        u64 col = 0;
        for (r = 0; r < p->rows; r++)
            if ((grid[r] >> c) & 1) col |= 1ULL << r;
        clues_from_line(col, p->rows, p->col_clue[c], &p->col_len[c]);
    }
}

static void random_grid(u64 *grid, int rows, int cols, int fill)
{
    static int cells[MAXN * MAXN];
    int total = rows * cols, i;

    for (i = 0; i < total; i++) cells[i] = i;
    for (i = 0; i < fill; i++) {
        int j = i + (int)rng_below((u64)(total - i));
        int swap = cells[i];
        cells[i] = cells[j];
        cells[j] = swap;
    }
    memset(grid, 0, sizeof(u64) * MAXN);
    for (i = 0; i < fill; i++) grid[cells[i] / cols] |= 1ULL << (cells[i] % cols);
}

static int has_empty_line(const Puzzle *p)
{
    int i;

    for (i = 0; i < p->rows; i++) if (p->row_len[i] == 0) return 1;
    for (i = 0; i < p->cols; i++) if (p->col_len[i] == 0) return 1;
    return 0;
}

static double now_ms(void)
{
    struct timespec ts;

    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec * 1000.0 + ts.tv_nsec / 1e6;
}

/* Swaps one filled and one empty cell from the region the solver could not
 * determine. Most of a stalled grid is fine, so moving the ambiguity is far
 * cheaper than drawing a whole new grid. Returns 0 if there is nothing to
 * swap, which means the caller should start over.
 */
static int repair_grid(u64 *grid, const u64 *known, int rows, int cols)
{
    static int filled[MAXN * MAXN], empty[MAXN * MAXN];
    u64 colmask = fullmask(cols);
    int nfilled = 0, nempty = 0, r, c, from, to;

    for (r = 0; r < rows; r++) {
        u64 undetermined = colmask & ~known[r];
        for (c = 0; c < cols; c++) {
            if (!((undetermined >> c) & 1)) continue;
            if ((grid[r] >> c) & 1) filled[nfilled++] = r * cols + c;
            else empty[nempty++] = r * cols + c;
        }
    }
    if (nfilled == 0 || nempty == 0) return 0;

    from = filled[rng_below((u64)nfilled)];
    to = empty[rng_below((u64)nempty)];
    grid[from / cols] &= ~(1ULL << (from % cols));
    grid[to / cols] |= 1ULL << (to % cols);
    return 1;
}

/* Fills `grid` and `p` with a puzzle meeting every constraint in `opt`.
 * Returns the number of solver runs it took, or -1 if the time limit expired
 * first -- which the shipped sizes never approach, but an extreme `--density`
 * asked for by hand can.
 */
static long generate(const Options *opt, u64 *grid, Puzzle *p, int *passes_out)
{
    double deadline = now_ms() + (double)opt->timeout_ms;
    long solves = 0;
    int repairs_left = opt->repair_budget;
    u64 known[MAXN];

    p->rows = opt->rows;
    p->cols = opt->cols;
    random_grid(grid, opt->rows, opt->cols, opt->fill);

    for (;;) {
        int passes = 0, solved = 0, r;

        clues_from_grid(grid, p);
        if (opt->allow_empty_lines || !has_empty_line(p)) {
            solves++;
            solved = grid_solve(p, &passes, known, NULL);
            if (solved &&
                (opt->min_passes <= 0 || passes >= opt->min_passes) &&
                (opt->max_passes <= 0 || passes <= opt->max_passes)) {
                *passes_out = passes;
                return solves;
            }
            /* A puzzle rejected only for its difficulty is fully determined,
               so there is no ambiguous region to repair: start over. */
            if (solved) for (r = 0; r < opt->rows; r++) known[r] = 0;
        } else {
            for (r = 0; r < opt->rows; r++) known[r] = 0;
        }

        if ((solves & 15) == 0 && now_ms() > deadline) return -1;

        if (repairs_left-- <= 0 || !repair_grid(grid, known, opt->rows, opt->cols)) {
            random_grid(grid, opt->rows, opt->cols, opt->fill);
            repairs_left = opt->repair_budget;
        }
    }
}

/* ---------- output ---------- */

/* The clue string the client already understands: column clues first, then
 * row clues, groups separated by '/' and runs within a group by '.'.
 */
static void write_task(const Puzzle *p, char *out)
{
    int len = 0, i, j;

    for (i = 0; i < p->cols; i++) {
        if (p->col_len[i] == 0) len += sprintf(out + len, "0");
        for (j = 0; j < p->col_len[i]; j++)
            len += sprintf(out + len, "%d%s", p->col_clue[i][j], j + 1 < p->col_len[i] ? "." : "");
        len += sprintf(out + len, "/");
    }
    for (i = 0; i < p->rows; i++) {
        if (p->row_len[i] == 0) len += sprintf(out + len, "0");
        for (j = 0; j < p->row_len[i]; j++)
            len += sprintf(out + len, "%d%s", p->row_clue[i][j], j + 1 < p->row_len[i] ? "." : "");
        if (i + 1 < p->rows) len += sprintf(out + len, "/");
    }
}

static void write_solution(const u64 *grid, const Puzzle *p, char *out)
{
    int r, c, len = 0;

    for (r = 0; r < p->rows; r++)
        for (c = 0; c < p->cols; c++) out[len++] = ((grid[r] >> c) & 1) ? 'y' : 'n';
    out[len] = '\0';
}

static void print_clue_array(const int clue[][MAXK], const int *len, int count)
{
    int i, j;

    putchar('[');
    for (i = 0; i < count; i++) {
        putchar('[');
        for (j = 0; j < len[i]; j++) printf("%d%s", clue[i][j], j + 1 < len[i] ? "," : "");
        printf(i + 1 < count ? "]," : "]");
    }
    putchar(']');
}

static void print_json(const u64 *grid, const Puzzle *p, int passes, long solves)
{
    char task[MAXN * MAXN * 4], solution[MAXN * MAXN + 1];

    write_task(p, task);
    write_solution(grid, p, solution);

    printf("{\"task\":\"%s\",", task);
    printf("\"dimensions\":{\"cols\":%d,\"rows\":%d},", p->cols, p->rows);
    printf("\"colClues\":");
    print_clue_array(p->col_clue, p->col_len, p->cols);
    printf(",\"rowClues\":");
    print_clue_array(p->row_clue, p->row_len, p->rows);
    printf(",\"solution\":\"%s\"", solution);
    printf(",\"generator\":\"%s\",\"passes\":%d,\"solves\":%ld}\n", GENERATOR_VERSION, passes, solves);
}

/* ---------- selftest ---------- */

/* Reference line solver: every line of length n, filtered by the clue and the
 * known cells, intersected. Obviously correct and exponential, so it exists
 * only to check the DP above.
 */
static int brute_line(const int *clue, int k, int n, u64 known, u64 val,
                      u64 *out_known, u64 *out_val)
{
    u64 all_filled = fullmask(n), any_filled = 0, candidate;
    int found = 0;

    for (candidate = 0; candidate < (1ULL << n); candidate++) {
        int candidate_clue[MAXK], candidate_len, i, matches = 1;

        if ((candidate & known) != (val & known)) continue;
        clues_from_line(candidate, n, candidate_clue, &candidate_len);
        if (candidate_len != k) continue;
        for (i = 0; i < k; i++)
            if (candidate_clue[i] != clue[i]) { matches = 0; break; }
        if (!matches) continue;

        all_filled &= candidate;
        any_filled |= candidate;
        found = 1;
    }
    if (!found) return 0;
    *out_known = fullmask(n) & (all_filled | ~any_filled);
    *out_val = all_filled;
    return 1;
}

static int selftest_lines(long cases)
{
    long t;
    int failures = 0;

    for (t = 0; t < cases; t++) {
        int n = 1 + (int)rng_below(14);
        u64 line = rng_next() & fullmask(n);
        int clue[MAXK], k;
        u64 known, val, dp_known = 0, dp_val = 0, brute_known = 0, brute_val = 0;
        int dp_ok, brute_ok;

        clues_from_line(line, n, clue, &k);

        /* Known cells drawn from the line itself are always consistent; every
           third case uses noise instead, so the contradiction path is
           exercised too. */
        known = rng_next() & fullmask(n) & (rng_next() | rng_next());
        val = (t % 3 == 0) ? (rng_next() & fullmask(n)) : line;

        dp_ok = line_solve(clue, k, n, known, val, &dp_known, &dp_val);
        brute_ok = brute_line(clue, k, n, known, val, &brute_known, &brute_val);

        if (dp_ok != brute_ok ||
            (dp_ok && (dp_known != brute_known || (dp_val & dp_known) != (brute_val & brute_known)))) {
            int i;
            printf("line mismatch n=%d clue=", n);
            for (i = 0; i < k; i++) printf("%d.", clue[i]);
            printf(" known=%llx val=%llx dp=(%d,%llx,%llx) brute=(%d,%llx,%llx)\n",
                   (unsigned long long)known, (unsigned long long)val,
                   dp_ok, (unsigned long long)dp_known, (unsigned long long)dp_val,
                   brute_ok, (unsigned long long)brute_known, (unsigned long long)brute_val);
            if (++failures > 10) return failures;
        }
    }
    return failures;
}

/* Checks the generator's own promise: the clues really do describe the grid
 * it emitted, and line propagation really does recover that exact grid.
 */
static int clues_match(const Puzzle *a, const Puzzle *b)
{
    int i, j;

    if (a->rows != b->rows || a->cols != b->cols) return 0;
    for (i = 0; i < a->rows; i++) {
        if (a->row_len[i] != b->row_len[i]) return 0;
        for (j = 0; j < a->row_len[i]; j++)
            if (a->row_clue[i][j] != b->row_clue[i][j]) return 0;
    }
    for (i = 0; i < a->cols; i++) {
        if (a->col_len[i] != b->col_len[i]) return 0;
        for (j = 0; j < a->col_len[i]; j++)
            if (a->col_clue[i][j] != b->col_clue[i][j]) return 0;
    }
    return 1;
}

static int selftest_puzzles(long count)
{
    int sizes[] = { 5, 6, 10 };
    long t;
    int failures = 0;

    for (t = 0; t < count; t++) {
        Options opt = { 0, 0, 0, 0, 0, 0, 50, 10000 };
        Puzzle p, derived;
        u64 grid[MAXN], recovered[MAXN];
        int n = sizes[t % 3], passes = 0, r;

        opt.rows = opt.cols = n;
        opt.fill = (n * n + 1) / 2;
        if (generate(&opt, grid, &p, &passes) < 0) {
            printf("generate timed out at %dx%d\n", n, n);
            return ++failures;
        }

        derived.rows = derived.cols = n;
        clues_from_grid(grid, &derived);
        if (!clues_match(&derived, &p)) {
            printf("clues do not describe the emitted grid at %dx%d\n", n, n);
            failures++;
        }
        if (!grid_solve(&p, NULL, NULL, recovered)) {
            printf("emitted puzzle is not line-solvable at %dx%d\n", n, n);
            failures++;
            continue;
        }
        for (r = 0; r < n; r++) {
            if (recovered[r] == grid[r]) continue;
            printf("solver recovered a different grid at %dx%d row %d\n", n, n, r);
            failures++;
            break;
        }
    }
    return failures;
}

static int selftest(long cases)
{
    int failures = selftest_lines(cases) + selftest_puzzles(60);

    printf("selftest: %ld line cases, 60 puzzles -- %d failures\n", cases, failures);
    return failures;
}

/* ---------- cli ---------- */

static void usage(void)
{
    fprintf(stderr,
            "usage: nonogen --seed N [--size N | --rows N --cols N] [--density D]\n"
            "               [--allow-empty-lines] [--min-passes N] [--max-passes N]\n"
            "               [--repair N] [--timeout-ms N]\n"
            "       nonogen --selftest [--cases N]\n");
}

int main(int argc, char **argv)
{
    Options opt = { 15, 0, 0, 0, 0, 0, 50, 10000 };
    double density = 0.5;
    u64 seed = 0;
    long cases = 200000, solves;
    int run_selftest = 0, have_seed = 0, passes = 0, i;
    u64 grid[MAXN];
    Puzzle p;

    for (i = 1; i < argc; i++) {
        const char *arg = argv[i];
        int needs_value = strcmp(arg, "--allow-empty-lines") && strcmp(arg, "--selftest");
        if (needs_value && i + 1 >= argc) { usage(); return 2; }

        if (!strcmp(arg, "--seed")) { seed = strtoull(argv[++i], NULL, 10); have_seed = 1; }
        else if (!strcmp(arg, "--size")) opt.rows = opt.cols = atoi(argv[++i]);
        else if (!strcmp(arg, "--rows")) opt.rows = atoi(argv[++i]);
        else if (!strcmp(arg, "--cols")) opt.cols = atoi(argv[++i]);
        else if (!strcmp(arg, "--density")) density = atof(argv[++i]);
        else if (!strcmp(arg, "--min-passes")) opt.min_passes = atoi(argv[++i]);
        else if (!strcmp(arg, "--max-passes")) opt.max_passes = atoi(argv[++i]);
        else if (!strcmp(arg, "--repair")) opt.repair_budget = atoi(argv[++i]);
        else if (!strcmp(arg, "--timeout-ms")) opt.timeout_ms = atol(argv[++i]);
        else if (!strcmp(arg, "--cases")) cases = atol(argv[++i]);
        else if (!strcmp(arg, "--allow-empty-lines")) opt.allow_empty_lines = 1;
        else if (!strcmp(arg, "--selftest")) run_selftest = 1;
        else { usage(); return 2; }
    }

    if (!opt.cols) opt.cols = opt.rows;
    rng_seed(seed);

    if (run_selftest) return selftest(cases) ? 1 : 0;

    if (!have_seed) { usage(); return 2; }
    if (opt.rows < 1 || opt.cols < 1 || opt.rows > MAXN || opt.cols > MAXN) {
        fprintf(stderr, "nonogen: rows and cols must be between 1 and %d\n", MAXN);
        return 2;
    }
    if (density <= 0.0 || density >= 1.0) {
        fprintf(stderr, "nonogen: density must be between 0 and 1\n");
        return 2;
    }
    opt.fill = (int)(density * opt.rows * opt.cols + 0.5);
    if (opt.fill < 1) opt.fill = 1;
    if (opt.fill > opt.rows * opt.cols) opt.fill = opt.rows * opt.cols;

    solves = generate(&opt, grid, &p, &passes);
    if (solves < 0) {
        fprintf(stderr, "nonogen: no puzzle found within %ld ms\n", opt.timeout_ms);
        return 1;
    }
    print_json(grid, &p, passes, solves);
    return 0;
}
