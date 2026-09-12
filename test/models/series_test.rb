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

  test "SERIES includes a series for each nonogram size" do
    [5, 10, 15, 20, 25].each do |size|
      assert_includes Series::SERIES.keys, "nonogram-#{size}"
    end
  end

  test "each nonogram series carries the metadata its source needs" do
    nonogram_series.each do |name, meta|
      assert_equal 1, meta[:first_puzzle], "#{name} should start at ID 1"
      assert meta[:last_puzzle].is_a?(Integer), "#{name} missing an Integer :last_puzzle"
      assert meta[:last_puzzle] > meta[:first_puzzle], "#{name} has an empty ID range"
      assert_equal "#{meta[:size]}x#{meta[:size]} Nonograms", meta[:display_name]
    end
  end

  test "nonogram series have no day schedule" do
    nonogram_series.each do |name, meta|
      refute meta.key?(:days), "#{name} should not declare :days -- nonograms are not published daily"
    end
  end

  test "every series' source names itself as the registry does" do
    Series::SERIES.each do |name, meta|
      assert_equal meta[:source], Source.for(name).name, "#{name} resolves to a differently-named source"
    end
  end

  test "picker_groups collapses the nonogram sizes into one entry" do
    groups = Series.picker_groups.to_h

    assert_equal nonogram_series.keys, groups['nonograms'].map(&:first)
    assert_equal %w[5x5 10x10 15x15 20x20 25x25],
                 groups['nonograms'].map { |name, _meta| Source.for(name).picker_label(name) }
  end

  test "picker_groups leaves an ungrouped series standing alone, in SERIES order" do
    groups = Series.picker_groups

    ungrouped = Series::SERIES.keys.reject { |name| Source.for(name).picker_group }
    assert_equal ungrouped + ['nonograms'], groups.map(&:first)
    ungrouped.each do |name|
      members = groups.to_h[name]
      assert_equal [name], members.map(&:first)
    end
  end

  test "get_all omits nonogram series, which have no feed" do
    REDIS.set("crossword-series-quiptic", [{
      'title' => 'Quiptic No 1',
      'series' => 'quiptic',
      'identifier' => '1',
      'date' => '2024-06-10T06:00:00.000Z'
    }].to_json)

    series_names = Series.get_all.map(&:first)

    assert_includes series_names, 'quiptic'
    nonogram_series.each_key { |name| refute_includes series_names, name }
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

  private

  def nonogram_series
    Series::SERIES.select { |_name, meta| meta[:source] == 'nonograms' }
  end
end
