require 'test_helper'

class CrosswordTest < ActiveSupport::TestCase
  setup do
    REDIS.flushdb
  end

  def valid_data(overrides = {})
    {
      'title' => 'Quiptic crossword No 1,234',
      'source' => 'guardian',
      'series' => 'quiptic',
      'identifier' => '1234',
      'date' => '2024-06-10T06:00:00.000Z'
    }.merge(overrides)
  end

  test "initialize extracts all fields" do
    cw = Crossword.new(valid_data)
    assert_equal 'Quiptic crossword No 1,234', cw.title
    assert_equal 'guardian', cw.source
    assert_equal 'quiptic', cw.series
    assert_equal '1234', cw.identifier
  end

  test "initialize raises on missing required field" do
    assert_raises(KeyError) { Crossword.new('title' => 'x') }
  end

  test "date parses XML schema timestamp and shifts by 2 hours" do
    cw = Crossword.new(valid_data('date' => '2024-06-10T06:00:00.000Z'))
    assert_equal Date.new(2024, 6, 10), cw.date
  end

  test "date shift can roll to next day" do
    cw = Crossword.new(valid_data('date' => '2024-06-10T23:00:00.000Z'))
    assert_equal Date.new(2024, 6, 11), cw.date
  end

  test "name includes number when title contains No" do
    cw = Crossword.new(valid_data('title' => 'Quiptic crossword No 1,234'))
    assert_includes cw.name, '(No 1,234)'
  end

  test "name omits number when title has no No" do
    cw = Crossword.new(valid_data('title' => 'Weekend crossword'))
    refute_includes cw.name, 'No'
  end

  test "name formats date correctly" do
    cw = Crossword.new(valid_data('date' => '2024-01-15T06:00:00.000Z'))
    assert_includes cw.name, 'Monday 15 January'
  end

  test "equality based on identifier" do
    a = Crossword.new(valid_data('identifier' => '100'))
    b = Crossword.new(valid_data('identifier' => '100', 'title' => 'Different title'))
    c = Crossword.new(valid_data('identifier' => '200'))

    assert_equal a, b
    refute_equal a, c
  end

  test "not equal to nil" do
    cw = Crossword.new(valid_data)
    refute_equal cw, nil
  end

  test "not equal to non-Crossword" do
    cw = Crossword.new(valid_data)
    refute_equal cw, "not a crossword"
  end

  test "to_json round-trips through JSON parse and Crossword.new" do
    original = Crossword.new(valid_data)
    restored = Crossword.new(JSON.parse(original.to_json))
    assert_equal original, restored
    assert_equal original.title, restored.title
    assert_equal original.source, restored.source
    assert_equal original.series, restored.series
  end

  test "save stores crossword in Redis series list" do
    cw = Crossword.new(valid_data)
    cw.save

    stored = JSON.parse(REDIS.get("crossword-series-quiptic"))
    assert_equal 1, stored.length
    assert_equal '1234', stored.first['identifier']
  end

  test "save does not duplicate existing crossword" do
    cw = Crossword.new(valid_data)
    cw.save
    cw.save

    stored = JSON.parse(REDIS.get("crossword-series-quiptic"))
    assert_equal 1, stored.length
  end

  test "save prepends new crossword and caps at 5" do
    6.times do |i|
      Crossword.new(valid_data('identifier' => i.to_s)).save
    end

    stored = JSON.parse(REDIS.get("crossword-series-quiptic"))
    assert_equal 5, stored.length
    # most recent should be first
    assert_equal '5', stored.first['identifier']
  end
end
