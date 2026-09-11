require 'test_helper'
require 'minitest/mock'

class Source::NonogramsTest < ActiveSupport::TestCase
  setup do
    REDIS.flushdb
  end

  # --- fetch ---

  test "fetch parses the task string into column and row clues" do
    Faraday.stub(:get, stub_response(fixture('15x15_2401181'))) do
      data = JSON.parse(source.fetch('nonogram-15', '2401181'))

      assert_equal 15, data['colClues'].length
      assert_equal 15, data['rowClues'].length
      # Columns come first in the task string, rows after.
      assert_equal [6], data['colClues'].first
      assert_equal [1, 1, 1, 3, 2], data['colClues'][9]
      assert_equal [6, 1], data['rowClues'].first
      assert_equal [6, 1, 4], data['rowClues'].last
    end
  end

  test "fetch records dimensions, size and the verbatim task string" do
    Faraday.stub(:get, stub_response(fixture('15x15_2401181'))) do
      data = JSON.parse(source.fetch('nonogram-15', '2401181'))

      assert_equal 'nonogram', data['type']
      assert_equal '2401181', data['id']
      assert_equal 15, data['size']
      assert_equal({ 'cols' => 15, 'rows' => 15 }, data['dimensions'])
      assert_equal 'f3de0201ee7b6cb75453b9a892cff602', data['hashedSolution']
      assert_equal '15x15 Nonogram No 2,401,181', data['name']
      # The completion check hashes task + solution, so it must survive intact.
      assert data['task'].start_with?('6/6.1.1/6.4/'), "task was not stored verbatim"
    end
  end

  test "fetch caches the parsed puzzle in Redis" do
    Faraday.stub(:get, stub_response(fixture('15x15_2401181'))) do
      source.fetch('nonogram-15', '2401181')
    end

    cached = REDIS.get('nonogram-15/2401181')
    assert cached.present?, "expected the puzzle to be cached"
    assert_equal 15, JSON.parse(cached)['colClues'].length
  end

  test "fetch serves a cached puzzle without hitting the network" do
    REDIS.set('nonogram-15/2401181', '{"some":"data"}')

    Faraday.stub(:get, ->(*) { raise "should not hit the network" }) do
      assert_equal '{"some":"data"}', source.fetch('nonogram-15', '2401181')
    end
  end

  test "fetch returns nil for an out-of-range ID and caches nothing" do
    Faraday.stub(:get, stub_response(fixture('not_found'))) do
      assert_nil source.fetch('nonogram-15', '99999999')
    end

    refute REDIS.exists?('nonogram-15/99999999'), "a missing puzzle should not be cached"
  end

  test "fetch returns nil when the clue count does not match the grid" do
    truncated = fixture('15x15_2401181').sub(%r{/6\.1\.4'}, "'")

    Faraday.stub(:get, stub_response(truncated)) do
      assert_nil source.fetch('nonogram-15', '2401181')
    end
  end

  # The upstream site serves randomised, invalid `task` strings when it decides
  # it is being scraped. Those must never reach the cache, where a bad puzzle
  # would stick around indefinitely under an otherwise valid key.

  test "fetch rejects a task whose column and row totals disagree" do
    Faraday.stub(:get, stub_response(retasked("7/"))) do
      assert_nil source.fetch('nonogram-15', '2401181')
    end

    refute REDIS.exists?('nonogram-15/2401181'), "an inconsistent puzzle should not be cached"
  end

  test "fetch rejects a task with a run too long for its line" do
    Faraday.stub(:get, stub_response(retasked("16/"))) do
      assert_nil source.fetch('nonogram-15', '2401181')
    end
  end

  test "fetch rejects a task containing a zero-length run" do
    Faraday.stub(:get, stub_response(retasked("0/"))) do
      assert_nil source.fetch('nonogram-15', '2401181')
    end
  end

  test "fetch returns nil when the request fails" do
    Faraday.stub(:get, ->(*) { raise Faraday::ConnectionFailed, 'boom' }) do
      assert_nil source.fetch('nonogram-15', '2401181')
    end
  end

  # --- publisher_url ---

  test "publisher_url points at the specific puzzle for the series size" do
    url = source.publisher_url('nonogram-25', '2401181')

    assert url.start_with?('https://www.puzzle-nonograms.com/?'), "unexpected host: #{url}"
    assert_includes url, 'size=4'
    assert_includes url, 'specid=2401181'
    assert_includes url, 'specific=1'
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

  def stub_response(body)
    Struct.new(:body).new(body)
  end

  def fixture(name)
    File.read(Rails.root.join('test/fixtures/files/nonograms', "#{name}.html"))
  end

  # Replaces the first column clue in the fixture, keeping the group count
  # intact so validation rather than the length check is what rejects it.
  def retasked(first_clue)
    fixture('15x15_2401181').sub("var task = '6/", "var task = '#{first_clue}")
  end
end
