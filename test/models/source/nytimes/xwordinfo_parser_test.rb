require 'test_helper'

class Source::Nytimes::XwordinfoParserTest < ActiveSupport::TestCase
  Parser = Source::Nytimes::XwordinfoParser

  ORIG_DATE = Date.new(2026, 4, 30).freeze
  # Pretend syndication date for the 4/30/2026 puzzle -- the real value
  # would come from the failed nytsyn response; for the parser test any
  # date is fine, we just need something consistent to assert against.
  SYN_DATE = Date.new(2026, 6, 18).freeze

  def fixture(name)
    File.read(Rails.root.join('test/fixtures/files/nytimes', "#{name}.html"))
  end

  def parse_260430(**overrides)
    Parser.parse(
      fixture('xwordinfo_260430'),
      syn_date: overrides.fetch(:syn_date, SYN_DATE),
      orig_date: overrides.fetch(:orig_date, ORIG_DATE),
      subtitle: overrides[:subtitle],
    )
  end

  # --- Basic shape ---

  test "parses 4/30/2026 into a CAPI-shaped hash" do
    data = parse_260430

    assert_equal 'The New York Times crossword', data['name']
    assert_equal({ 'rows' => 15, 'cols' => 15 }, data['dimensions'])
    assert_equal 'Lance Enfinger and John Kugelman / Will Shortz', data.dig('creator', 'name')
    assert_equal '2026-04-30', data['originalDate']
    assert_equal '2026-06-18T00:00:00Z', data['syndicationDate']
    assert_equal Time.utc(2026, 6, 18).to_i * 1000, data['date']
    assert data['solutionAvailable']
  end

  test "subtitle: nil when caller passes none" do
    assert_nil parse_260430['subtitle']
  end

  test "subtitle is preserved from the caller (carried over from nytsyn)" do
    assert_equal '"Some Title"', parse_260430(subtitle: '"Some Title"')['subtitle']
  end

  # --- Cell styles: both circled and shaded ---

  test "emits both circled and shaded cellStyles for 4/30/2026" do
    styles = parse_260430['cellStyles']
    refute_empty styles
    style_set = styles.map { |s| s['style'] }.uniq.sort
    assert_equal %w[circled shaded], style_set
  end

  test "shaded run 'TROUT' lies at row 2, columns 9..13" do
    # Row 3 of 4/30/2026 (y=2) has shaded T R O U T at x=9..13 -- the fish
    # crossing the EXITROUTE entry.
    styles = parse_260430['cellStyles']
    expected = (9..13).map { |x| { 'x' => x, 'y' => 2, 'style' => 'shaded' } }
    expected.each { |s| assert_includes styles, s }
  end

  # --- Entries: solutions and clue counts ---

  test "entries number correctly and 17-across solution is EXITROUTE" do
    data = parse_260430
    across = data['entries'].select { |e| e['direction'] == 'across' }
    assert_equal 'EXITROUTE', across.find { |e| e['number'] == 17 }['solution']
    # 1-across is CHER at (1, 0): three letters in row 0.
    cher = across.find { |e| e['number'] == 1 }
    assert_equal 'CHER', cher['solution']
    assert_equal({ 'x' => 1, 'y' => 0 }, cher['position'])
  end

  test "across clue text drops the trailing ' : ANSWER' suffix" do
    data = parse_260430
    one_across = data['entries'].find { |e| e['id'] == '1-across' }
    refute_match(/\bCHER\b/, one_across['clue'])
    assert_match(/Grammy-winning singer/, one_across['clue'])
  end

  # --- Non-square grid ---
  # 10/6/2022 is one of the rare NYT puzzles whose grid is rectangular but
  # not square (16 rows x 14 cols), with shaded cells. xwordinfo represents
  # this as a #PuzTable with uniformly-14-cell rows -- no padding character
  # is needed -- so the parser should hand back the true non-square shape.

  test "xwordinfo_221006 parses non-square (16x14) shaded grid" do
    data = Parser.parse(
      fixture('xwordinfo_221006'),
      syn_date: Date.new(2022, 11, 10),
      orig_date: Date.new(2022, 10, 6),
    )
    assert_equal({ 'rows' => 16, 'cols' => 14 }, data['dimensions'])
    assert_equal 'Simeon Seigel / Will Shortz', data.dig('creator', 'name')

    # 44 shaded cells in the fixture (confirmed by greping the source HTML).
    shaded = data['cellStyles'].select { |s| s['style'] == 'shaded' }
    assert_equal 44, shaded.size

    # 1-across is CIVET at (0, 0), a five-letter row-0 entry.
    across = data['entries'].select { |e| e['direction'] == 'across' }
    one_across = across.find { |e| e['number'] == 1 }
    assert_equal 'CIVET', one_across['solution']
    assert_equal({ 'x' => 0, 'y' => 0 }, one_across['position'])
  end

  # --- Failure modes ---

  test "raises LoginRequired when given a login-redirect page" do
    login_page = <<~HTML
      <html><body>
        <a href='/Account/Login.aspx'>log in</a>
      </body></html>
    HTML
    assert_raises(Parser::LoginRequired) do
      Parser.parse(login_page, syn_date: SYN_DATE, orig_date: ORIG_DATE)
    end
  end

  test "raises MalformedPage when there is no PuzTable" do
    assert_raises(Parser::MalformedPage) do
      Parser.parse('<html><body>no puzzle here</body></html>',
                   syn_date: SYN_DATE, orig_date: ORIG_DATE)
    end
  end
end
