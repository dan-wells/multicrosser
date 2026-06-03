require 'test_helper'

class SeriesTest < ActiveSupport::TestCase
  setup do
    REDIS.flushdb
  end

  test "SERIES is a hash with string keys" do
    assert_instance_of Hash, Series::SERIES
    Series::SERIES.each_key { |k| assert_instance_of String, k }
  end

  test "each series has first_puzzle metadata" do
    Series::SERIES.each do |name, meta|
      assert meta.key?(:first_puzzle), "#{name} missing :first_puzzle"
      assert(meta[:first_puzzle].is_a?(Integer) || meta[:first_puzzle].is_a?(String),
        "#{name} first_puzzle should be an Integer (numeric series) or a String (date-based series)")
    end
  end

  test "each series has a source key" do
    Series::SERIES.each do |name, meta|
      assert meta.key?(:source), "#{name} missing :source"
    end
  end

  test "display_name returns the configured label when present" do
    assert_equal 'New York Times', Series.display_name('nytimes')
  end

  test "display_name falls back to titleize for series without an explicit label" do
    assert_equal 'Quiptic', Series.display_name('quiptic')
    assert_equal 'Quick Cryptic', Series.display_name('quick-cryptic')
  end

  test "SERIES includes quiptic and cryptic" do
    assert_includes Series::SERIES.keys, 'quiptic'
    assert_includes Series::SERIES.keys, 'cryptic'
  end

  test "get_all returns only series with crosswords in Redis" do
    crossword_data = [{
      'title' => 'Quiptic No 1',
      'source' => 'guardian',
      'series' => 'quiptic',
      'identifier' => '1',
      'date' => '2024-06-10T06:00:00.000Z'
    }].to_json
    REDIS.set("crossword-series-quiptic", crossword_data)

    result = Series.get_all
    series_names = result.map(&:first)

    assert_includes series_names, 'quiptic'
    refute_includes series_names, 'cryptic'

    quiptic_crosswords = result.find { |name, _| name == 'quiptic' }.last
    assert_equal 1, quiptic_crosswords.length
    assert_instance_of Crossword, quiptic_crosswords.first
  end

  test "get_all returns empty array when no series have data" do
    result = Series.get_all
    assert_empty result
  end
end
