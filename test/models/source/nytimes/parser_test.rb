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
