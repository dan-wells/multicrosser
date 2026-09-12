require 'test_helper'
require 'minitest/mock'
require 'open3'

class Source::NonogramsTest < ActiveSupport::TestCase
  setup do
    REDIS.flushdb
  end

  # --- fetch ---

  test "fetch generates a puzzle of the size the series asks for" do
    data = JSON.parse(source.fetch('nonogram-10', '4242'))

    assert_equal 'nonogram', data['type']
    assert_equal '4242', data['id']
    assert_equal 10, data['size']
    assert_equal({ 'cols' => 10, 'rows' => 10 }, data['dimensions'])
    assert_equal 10, data['colClues'].length
    assert_equal 10, data['rowClues'].length
    assert_equal '10x10 Nonogram No 4,242', data['name']
  end

  test "fetch returns clues that describe a half-filled grid" do
    data = JSON.parse(source.fetch('nonogram-15', '77'))
    filled = data['rowClues'].sum(&:sum)

    assert_equal data['colClues'].sum(&:sum), filled
    assert_equal (15 * 15 + 1) / 2, filled
    assert data['rowClues'].none?(&:empty?), "a row was left blank"
    assert data['colClues'].none?(&:empty?), "a column was left blank"
  end

  # The client checks completion by comparing its grid against this string, so
  # it has to be row-major 'y'/'n' over the whole grid.
  test "fetch ships the solution the clues describe" do
    data = JSON.parse(source.fetch('nonogram-10', '31337'))
    solution = data['solution']

    assert_equal 100, solution.length
    assert_match(/\A[yn]+\z/, solution)
    assert_equal data['rowClues'].sum(&:sum), solution.count('y')
    data['rowClues'].each_with_index do |clue, row|
      runs = solution[row * 10, 10].split('n').reject(&:empty?).map(&:length)
      assert_equal clue, runs, "row #{row} does not match its clue"
    end
  end

  # Clue gutters get unreadable, and the grid looks like noise, long before a
  # line reaches its arithmetic limit of runs; a solid line gives itself away.
  test "fetch keeps every line inside the generator's clue limits" do
    { 'nonogram-5' => 5, 'nonogram-15' => 15, 'nonogram-25' => 25 }.each do |series, size|
      clues = JSON.parse(source.fetch(series, '867530')).values_at('rowClues', 'colClues').flatten(1)
      spans = clues.map(&:length).max
      longest = clues.flatten.max

      assert_operator spans, :<=, 6, "#{series} has a line of #{spans} runs"
      assert_operator longest, :<, size, "#{series} has a completely filled line"
    end
  end

  test "fetch returns the same puzzle for the same identifier" do
    first = source.fetch('nonogram-10', '4242')
    REDIS.flushdb

    assert_equal first, source.fetch('nonogram-10', '4242')
  end

  test "fetch returns different puzzles for neighbouring identifiers" do
    refute_equal source.fetch('nonogram-10', '1'), source.fetch('nonogram-10', '2')
  end

  test "fetch caches the generated puzzle in Redis" do
    source.fetch('nonogram-5', '9')

    cached = REDIS.get('nonogram-5/9')
    assert cached.present?, "expected the puzzle to be cached"
    assert_equal 5, JSON.parse(cached)['colClues'].length
  end

  test "fetch serves a cached puzzle without running the generator" do
    REDIS.set('nonogram-15/2401181', '{"some":"data"}')

    Open3.stub(:capture2, ->(*) { raise "should not run the generator" }) do
      assert_equal '{"some":"data"}', source.fetch('nonogram-15', '2401181')
    end
  end

  test "fetch returns nil for an identifier outside the series range" do
    assert_nil source.fetch('nonogram-5', '0')
    assert_nil source.fetch('nonogram-5', (Series::SERIES['nonogram-5'][:last_puzzle] + 1).to_s)
    assert_nil source.fetch('nonogram-5', 'nonsense')
    refute REDIS.exists?('nonogram-5/nonsense'), "a bad identifier should not be cached"
  end

  test "fetch returns nil when the generator fails" do
    Open3.stub(:capture2, ['', failed_status]) do
      assert_nil source.fetch('nonogram-5', '9')
    end

    refute REDIS.exists?('nonogram-5/9'), "a failed generation should not be cached"
  end

  test "fetch returns nil when the generator has not been built" do
    original = Source::Nonograms::GENERATOR
    silence_warnings { Source::Nonograms.const_set(:GENERATOR, Rails.root.join('ext/nonogen/absent').to_s) }

    begin
      assert_nil source.fetch('nonogram-5', '9')
    ensure
      silence_warnings { Source::Nonograms.const_set(:GENERATOR, original) }
    end

    refute REDIS.exists?('nonogram-5/9'), "a missing generator should not be cached"
  end

  # The version is kept so a cached puzzle says what made it; the counters
  # behind it are generator diagnostics no client has any use for.
  test "fetch caches the generator version but not its run counters" do
    data = JSON.parse(source.fetch('nonogram-5', '9'))

    assert_match(/\Anonogen-/, data['generator'])
    refute data.key?('passes'), "passes reached the cache"
    refute data.key?('solves'), "solves reached the cache"
  end

  test "fetch returns nil when the generator emits a puzzle of the wrong size" do
    wrong_size = source.fetch('nonogram-10', '4242')
    REDIS.flushdb

    Open3.stub(:capture2, [wrong_size, ok_status]) do
      assert_nil source.fetch('nonogram-5', '4242')
    end
  end

  # --- the generator itself ---

  test "the generator passes its own checks" do
    out, status = Open3.capture2(Source::Nonograms::GENERATOR, '--selftest', '--cases', '20000')

    assert status.success?, "selftest failed: #{out}"
    assert_includes out, '0 failures'
  end

  test "the generator gives up on an unsatisfiable request rather than spinning" do
    out, status = Open3.capture2e(
      Source::Nonograms::GENERATOR,
      '--seed', '1', '--size', '10', '--max-run', '1', '--timeout-ms', '200',
    )

    refute status.success?
    assert_match(/no puzzle found/, out)
  end

  # --- random_identifier ---

  test "random_identifier returns an ID within the series range" do
    identifier = source.random_identifier('nonogram-5')

    assert_match(/\A\d+\z/, identifier)
    assert_includes 1..Series::SERIES['nonogram-5'][:last_puzzle], identifier.to_i
  end

  test "random_identifier ignores the day filter" do
    assert_match(/\A\d+\z/, source.random_identifier('nonogram-10', day: 3))
  end

  test "puzzle_name delimits a real ID and passes anything else through" do
    assert_equal '15x15 Nonogram No 2,401,181', source.puzzle_name('nonogram-15', '2401181')
    assert_equal '5x5 Nonogram No nonsense', source.puzzle_name('nonogram-5', 'nonsense')
  end

  # --- feed ---

  test "the source reports no feed, which is what sends latest to a random puzzle" do
    refute source.has_feed?
    assert Source.for('cryptic').has_feed?
  end

  # --- picker ---

  test "picker_group puts every size in one family" do
    assert_equal 'nonograms', source.picker_group
  end

  test "picker_label names the size of the series" do
    assert_equal '5x5', source.picker_label('nonogram-5')
    assert_equal '25x25', source.picker_label('nonogram-25')
  end

  # --- registration ---

  test "Source.for resolves every nonogram series to this source" do
    Series::SERIES.each do |name, meta|
      next unless meta[:source] == 'nonograms'
      assert_instance_of Source::Nonograms, Source.for(name)
    end
  end

  private

  def source
    Source::Nonograms.new
  end

  def ok_status
    Struct.new(:success?).new(true)
  end

  def failed_status
    Struct.new(:success?).new(false)
  end
end
