# FIX:

* Day radio buttons on homepage are not limited to Mon-Fri for Guardian Cryptic; Sat -> Fri, Sun -> Tue
* NYT series is shown as `Nytimes`: should be `New York Times` everywhere except in page URLs
* NYT clue lists are _long_: need to be able to scroll them, and scroll to show clue when focusing in the grid.
  - Maybe Across and Down lists should have their own sections/scroll bars? 
  - But this would have to be in the react-crossword component? so more to patch
  - or just always show the sticky clue
* Author shows as "Set by [Set by Peter Gordon / Will Shortz]", where that [] is a broken link -- should just be text
* Want to check if Wordplay posts exist upfront; don't include link if not
  - think this is the first one still online: https://www.nytimes.com/2017/06/30/crosswords/daily-puzzle-2017-07-01.html
* Maybe move the extra titles to a subtitle on next line?
* Circled cells not visible
* Keyboard cell navigation not working correctly: [] moves between Down clues okay but not Across -- either jumps to Down clue with same/next number or does nothing (most likely?)
* Take any non-ascii characters (—) out of comments -- can stay in user-facing text
* multi-author puzzles list authors/eds like "Alice and Bob / Will Shortz", so it should not be a problem with >2 slashes
* nytsyn.pzzl.com actually returns puzzles for nonsense date inputs like 260235 -> march 7 !! so don't need to worry about this, we'll apparently always get a puzzle

# TODO:

- Check any puzzles with shaded squares (^) to see if they are properly aligned, and handle properly if so
  - https://nytsyn.pzzl.com/nytsyn-crossword/nytsyncrossword?date=241031
  - video solution shows truncation: https://www.youtube.com/watch?v=MIQaRB5KEQ8
  - How to handle shading with current clue highlight? Maybe hatching? or just keep the shading visible, or overwrite it -- maybe only needs to be visible in the context of the whole puzzle, not an individual clue
- Add support for multi-character input for rebus clues
  - https://www.nytimes.com/2023/12/08/crosswords/rebus-crossword-puzzle.html
  - https://nytsyn.pzzl.com/nytsyn-crossword/nytsyncrossword?date=240111 -- think / might actually be syntactic here: the user should type it, but it also defines logic for what are acceptable answers
  - simpler rebus: https://nytsyn.pzzl.com/nytsyn-crossword/nytsyncrossword?date=120105
  - NYT has a "rebus" button but also can hit Esc while typing

## Rebus: previously parsed via first-letter substitution; reverted

Until proper multi-character input lands, the parser raises
`UnsupportedRebus` on any layout row containing a comma. This routes the
puzzle through the same nil-handling path as shaded (`^`) puzzles: 404
from `RoomsController`, skipped by `random_identifier`'s retry loop.
Fixtures `240111` and `120105` are kept and now serve as the
unsupported-puzzle assertions in `parser_test.rb`.

### Cache sentinels

`Source::Nytimes#fetch` caches a `unsupported:<reason>` sentinel in Redis
under `nytimes/<identifier>` rather than the previous opaque empty string,
so a future fix to one format doesn't require flushing entries cached for
other reasons. Three reasons exist today:

- `unsupported:shaded` -- layout contains `^` (shaded cells)
- `unsupported:rebus` -- layout contains `,` (rebus cells)
- `unsupported:malformed` -- couldn't be parsed at all (e.g. pre-2008
  feed responses, garbage upstream)

When rebus support lands, purge just those entries so the next fetch
re-classifies them with the new code:

```ruby
# bundle exec rails runner '...'
REDIS.scan_each(match: 'nytimes/*') { |k| REDIS.del(k) if REDIS.get(k) == 'unsupported:rebus' }
```

Same shape for `unsupported:shaded` whenever that gets handled. Legacy
empty-string sentinels from the previous implementation self-heal: the
fetch path's `cached.present?` check treats them as a miss, so they get
re-fetched and re-classified on next access -- no migration needed for
those.

The previous behaviour treated each rebus cell as a single-letter cell
holding the first character of the comma-separated list, e.g. `B,A` in the
layout became a `B` cell with a `rebus: true` flag. That flag was never
read downstream, so removing the parsing was self-contained.

### To restore proper rebus parsing later

In `Source::Nytimes::Parser#parse_row`, drop the new
`raise UnsupportedPuzzle, 'rebus marker (,) in layout'` guard, and put
back the rebus-walking branch in the `else` clause:

```ruby
# Letter or other non-special; may start a rebus
if line[i + 1] == ','
  # Rebus: walk through ",X" pairs; cell letter is the leading char
  last_letter_pos = i
  j = i + 1
  while j < line.length && line[j] == ','
    next_pos = j + 1
    break if next_pos >= line.length
    next_char = line[next_pos]
    break if next_char == '#' || next_char == '%' || next_char == ','
    last_letter_pos = next_pos
    j = last_letter_pos + 1
  end
  cells << { type: :cell, letter: c, rebus: true }
  i = last_letter_pos + 1
else
  cells << { type: :cell, letter: c }
  i += 1
end
```

The `when '%'` arm should also restore its `letter == ','` check so a
circled cell that opens a rebus (`%X,Y,Z`) doesn't silently consume the
comma:

```ruby
when '%'
  letter = line[i + 1]
  raise MalformedPuzzle, 'circle marker without letter' if letter.nil? || letter == '#' || letter == '%' || letter == ','
  cells << { type: :cell, letter: letter, style: :circled }
  i += 2
```

And the explicit `when ','` raise (defensive: a stray comma not preceded
by a letter) should come back too:

```ruby
when ','
  raise MalformedPuzzle, 'unexpected comma'
```

That gets the parser back to the first-letter-substitution behaviour. The
real work for proper rebus support is then carrying the alternative
letters through the JSON payload (probably as a per-cell `alternatives`
array next to `style`), and patching `@guardian/react-crossword` to (a)
accept multi-character cell input and (b) treat any of the alternatives
as a valid answer.

### Deleted parser tests (for re-use)

The three tests removed from `parser_test.rb` -- worth restoring (and
extending to assert the alternatives) once first-letter substitution is
back in place:

```ruby
# --- Mid-line rebus (240111, "Alchemy" theme) ---

test "240111 rebus rows collapse to 15 cells with first-letter substitution" do
  data = Parser.parse(fixture('240111'))
  assert_equal({ 'rows' => 15, 'cols' => 15 }, data['dimensions'])

  # Row 4 (0-indexed): `RAP,B,/,A,UATTLE#FATAL#`
  # Per the documented simplification, the rebus cell uses its FIRST letter
  # (the letter immediately before the first comma), so the row should
  # resolve to RAPATTLE#FATAL with 15 cells total (the trailing # in the
  # raw file is the 15th cell).
  # The simplest check: the across answer at this row crosses 9 cells from
  # x=0 to x=8 and reads RAPATTLE (8 letters in 8 cells with row width 15).
  row_4_across = data['entries'].find do |e|
    e['direction'] == 'across' && e.dig('position', 'y') == 4 && e.dig('position', 'x') == 0
  end
  refute_nil row_4_across
  assert_equal 'RAPATTLE', row_4_across['solution']
  assert_equal 8, row_4_across['length']
end

test "240111 corner-style across at row 2 absorbs rebus" do
  data = Parser.parse(fixture('240111'))
  # Row 2: `DEFIB#ROOFTOP,B,/,A,UAR`
  # Expected: DEFIB (cells 0-4), # (5), then ROOFTOP[rebus->P]AR (cells 6-14)
  # The second across reads ROOFTOPAR (rebus letter is P from the rebus's
  # leading letter; the layout's P is consumed into the rebus block).
  row_2_acrosses = data['entries'].select { |e| e['direction'] == 'across' && e.dig('position', 'y') == 2 }
  assert_equal 2, row_2_acrosses.size
  assert_equal 'DEFIB', row_2_acrosses.first['solution']
  assert_equal 'ROOFTOPAR', row_2_acrosses.last['solution']
end

# --- Corner rebus (120105, "JACK in the box" theme) ---

test "120105 corner rebus is handled" do
  data = Parser.parse(fixture('120105'))
  assert_equal({ 'rows' => 15, 'cols' => 15 }, data['dimensions'])

  # Row 0: `BLACKJ,A,C,K##LUMBERJ,A,C,K`
  # Cells: BLACK (5) + rebus [J] (1) + ## (2) + LUMBER (6) + rebus [J] (1) = 15
  # Two across entries on this row: BLACKJ and LUMBERJ
  row_0_acrosses = data['entries'].select { |e| e['direction'] == 'across' && e.dig('position', 'y') == 0 }
  assert_equal 2, row_0_acrosses.size
  assert_equal 'BLACKJ',  row_0_acrosses.first['solution']
  assert_equal 'LUMBERJ', row_0_acrosses.last['solution']
end
```
