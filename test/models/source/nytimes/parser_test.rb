require 'test_helper'

class Source::Nytimes::ParserTest < ActiveSupport::TestCase
  Parser = Source::Nytimes::Parser

  def fixture(name)
    File.read(Rails.root.join('test/fixtures/files/nytimes', "#{name}.txt"))
  end

  # --- Basic parsing of a vanilla puzzle (today's syndicated) ---

  test "parses 260601 (vanilla Monday) into a CAPI-shaped hash" do
    data = Parser.parse(fixture('260601'))

    assert_equal 'The New York Times crossword', data['name']
    assert_equal({ 'rows' => 15, 'cols' => 15 }, data['dimensions'])
    assert_equal 'Neville Fogarty / Will Shortz', data.dig('creator', 'name')
    assert_equal '2026-04-27', data['originalDate']
    assert_equal '2026-06-01T00:00:00Z', data['syndicationDate']
    assert_equal Time.utc(2026, 6, 1).to_i * 1000, data['date']
    assert_equal [], data['cellStyles']
    assert data['solutionAvailable']
  end

  test "260601 entries are numbered + ordered correctly" do
    data = Parser.parse(fixture('260601'))
    across = data['entries'].select { |e| e['direction'] == 'across' }
    down   = data['entries'].select { |e| e['direction'] == 'down' }

    assert_equal 35, across.size  # header declared 35 across
    assert_equal 43, down.size    # header declared 43 down

    # First across is at row 0, lefmost non-black; number must be 1
    assert_equal 1, across.first['number']
    assert_equal 0, across.first.dig('position', 'y')
    # IDs follow "#-direction" pattern
    assert_equal "1-across", across.first['id']
    assert_equal "1-down",   down.first['id']
  end

  # --- Sunday puzzle with title + circled cells ---

  test "260426 parses Sunday-sized grid with subtitle separate from name" do
    data = Parser.parse(fixture('260426'))
    assert_equal 'The New York Times crossword', data['name']
    assert_equal 'Sound It Out', data['subtitle']
    assert_equal({ 'rows' => 21, 'cols' => 21 }, data['dimensions'])
    assert_equal 'Alex Eaton-Salners / Will Shortz', data.dig('creator', 'name')
  end

  test "260601 (no extra title) emits subtitle: nil" do
    data = Parser.parse(fixture('260601'))
    assert_equal 'The New York Times crossword', data['name']
    assert_nil data['subtitle']
  end

  test "260426 emits circled cellStyles where %X markers appear" do
    data = Parser.parse(fixture('260426'))
    styles = data['cellStyles']
    refute_empty styles
    assert styles.all? { |s| s['style'] == 'circled' }
    # Row 2 of 260426 is `INST%R%U%M%ENT#BETAS#ETAL`, where %R %U %M %E
    # mark four circled cells at x = 4..7, y = 2.
    expected = [
      { 'x' => 4,  'y' => 2, 'style' => 'circled' },
      { 'x' => 5,  'y' => 2, 'style' => 'circled' },
      { 'x' => 6,  'y' => 2, 'style' => 'circled' },
      { 'x' => 7,  'y' => 2, 'style' => 'circled' },
    ]
    expected.each { |s| assert_includes styles, s }
  end

  # --- Rebus puzzles: treated as unsupported pending multi-character input ---

  test "240111 (mid-line rebus, comma markers) raises UnsupportedPuzzle" do
    assert_raises(Parser::UnsupportedPuzzle) do
      Parser.parse(fixture('240111'))
    end
  end

  test "120105 (corner rebus, comma markers) raises UnsupportedPuzzle" do
    assert_raises(Parser::UnsupportedPuzzle) do
      Parser.parse(fixture('120105'))
    end
  end

  # --- Shaded puzzle (240808): treated as unsupported ---

  test "240808 (shaded ^) raises UnsupportedPuzzle" do
    assert_raises(Parser::UnsupportedPuzzle) do
      Parser.parse(fixture('240808'))
    end
  end

  # --- Non-square / `.`-padded grids ---
  # The syndication feed always reports a square rows/cols count, but pads
  # unused cells with `.`. We trim edge rows/cols that are entirely padding
  # and treat any remaining internal `.` as a regular black cell.

  test "260609 trims a whole row of `.` padding to non-square dimensions" do
    data = Parser.parse(fixture('260609'))
    # Declared 16x16, last row is 16 dots -> trims to 15x16.
    assert_equal({ 'rows' => 15, 'cols' => 16 }, data['dimensions'])
    assert_equal 37, data['entries'].count { |e| e['direction'] == 'across' }
    assert_equal 42, data['entries'].count { |e| e['direction'] == 'down' }
    assert_equal [], data['cellStyles']
  end

  test "221014 trims whole columns of `.` padding to non-square dimensions" do
    data = Parser.parse(fixture('221014'))
    # Declared 19x19. Cols 0-1 and 17-18 are entirely `.`, so they trim --
    # leaving 19 rows x 15 cols. No row is fully padding.
    assert_equal({ 'rows' => 19, 'cols' => 15 }, data['dimensions'])
    assert_equal 34, data['entries'].count { |e| e['direction'] == 'across' }
    assert_equal 34, data['entries'].count { |e| e['direction'] == 'down' }
  end

  test "240801 octagonal `.` corners are converted to black within an unchanged bbox" do
    # 240801 is a stepped-octagon puzzle. Every row and column has at
    # least one content cell, so the bbox stays the full 16x16 -- no edge
    # trimming is possible. The four stepped triangles of `.` in the
    # corners must all become black cells (i.e. not covered by any entry).
    data = Parser.parse(fixture('240801'))
    assert_equal({ 'rows' => 16, 'cols' => 16 }, data['dimensions'])

    occupied = Set.new
    data['entries'].each do |e|
      e['length'].times do |i|
        ex = e['position']['x'] + (e['direction'] == 'across' ? i : 0)
        ey = e['position']['y'] + (e['direction'] == 'down' ? i : 0)
        occupied << [ex, ey]
      end
    end

    # Each row of the stepped corners that was `.` in the source -- they
    # all sit inside the bbox, so they must be converted to black.
    expected_black = [
      # Top-left triangle (rows 0..3)
      [0, 0], [1, 0], [2, 0], [3, 0],
      [0, 1], [1, 1], [2, 1],
      [0, 2], [1, 2],
      [0, 3],
      # Top-right triangle (rows 0..3)
      [12, 0], [13, 0], [14, 0], [15, 0],
      [13, 1], [14, 1], [15, 1],
      [14, 2], [15, 2],
      [15, 3],
      # Bottom-left triangle (rows 12..15)
      [0, 12],
      [0, 13], [1, 13],
      [0, 14], [1, 14], [2, 14],
      [0, 15], [1, 15], [2, 15], [3, 15],
      # Bottom-right triangle (rows 12..15)
      [15, 12],
      [14, 13], [15, 13],
      [13, 14], [14, 14], [15, 14],
      [12, 15], [13, 15], [14, 15], [15, 15],
    ]
    expected_black.each do |x, y|
      refute_includes occupied, [x, y], "expected (#{x}, #{y}) to be a black cell"
    end
  end

  # --- Pre-archive degenerate document (080601 = day before earliest) ---

  test "080601 (pre-archive dummy doc with all zeros) raises MalformedPuzzle" do
    assert_raises(Parser::MalformedPuzzle) do
      Parser.parse(fixture('080601'))
    end
  end

  # --- Defensive: empty / garbage input ---

  test "empty string raises MalformedPuzzle" do
    assert_raises(Parser::MalformedPuzzle) { Parser.parse('') }
  end

  test "random bytes raises MalformedPuzzle" do
    assert_raises(Parser::MalformedPuzzle) { Parser.parse('not a puzzle') }
  end
end
