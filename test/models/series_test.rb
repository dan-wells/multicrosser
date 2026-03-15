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
      assert_kind_of Integer, meta[:first_puzzle]
    end
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
