require 'test_helper'

class FifteensquaredFeedTest < ActiveSupport::TestCase
  # Helpers

  def match_number(series, title)
    pattern = FifteensquaredFeed::SERIES_PATTERNS[series]
    m = title.match(pattern)
    m && m[1].delete(',.')
  end

  def assert_matches(series, title, expected_number)
    actual = match_number(series, title)
    assert_equal expected_number, actual,
      "Expected #{series} pattern to extract '#{expected_number}' from: #{title.inspect}"
  end

  def assert_no_match(series, title)
    actual = match_number(series, title)
    assert_nil actual,
      "Expected #{series} pattern NOT to match: #{title.inspect} (got '#{actual}')"
  end

  # -- Quiptic ------------------------------------------------------------------

  test "quiptic: plain number" do
    assert_matches 'quiptic', 'Guardian Quiptic 1370 by Budmo', '1370'
  end

  test "quiptic: comma separator" do
    assert_matches 'quiptic', 'Guardian Quiptic 1,372 by Harpo', '1372'
  end

  test "quiptic: european separator" do
    assert_matches 'quiptic', 'Guardian Quiptic 1.357/Hectence', '1357'
  end

  # not observed, just in case
  test "quiptic: No. with comma-formatted number" do
    assert_matches 'quiptic', 'Guardian Quiptic No. 1,234 by Setter', '1234'
  end

  test "quiptic: No without dot" do
    assert_matches 'quiptic', 'Guardian Quiptic No 1234 / Notes', '1234'
  end

  test "quiptic: does not match cryptic title" do
    assert_no_match 'quiptic', 'Guardian Cryptic 28000 by Setter'
  end

  # -- Cryptic -------------------------------------------------------------------

  test "cryptic: plain number" do
    assert_matches 'cryptic', 'Guardian Cryptic 29970 Brummie', '29970'
  end

  test "cryptic: No. with comma-formatted number" do
    assert_matches 'cryptic', 'Guardian Cryptic No. 28,000 by Setter', '28000'
  end

  test "cryptic: No without dot" do
    assert_matches 'cryptic', 'Guardian Cryptic No 28000', '28000'
  end

  test "cryptic: omitted 'Cryptic' word" do
    assert_matches 'cryptic', 'Guardian No. 28,000 by Setter', '28000'
  end

  test "cryptic: extra 'crossword' word" do
    assert_matches 'cryptic', 'Guardian Cryptic crossword No 29,969 by Paul', '29969'
  end

  test "cryptic: omitted 'Cryptic' word, no 'No.'" do
    assert_matches 'cryptic', 'Guardian 29,968 / Maskarade', '29968'
  end

  test "cryptic: european separator" do
    assert_matches 'cryptic', 'Guardian Cryptic 1.333/Pasquale', '1333'
  end

  test "cryptic: does not match non-Guardian source" do
    assert_no_match 'cryptic', 'Financial Times Cryptic 28000'
  end

  test "cryptic: does not match quiptic title" do
    assert_no_match 'cryptic', 'Guardian Quiptic 1234 by Setter'
  end
end
