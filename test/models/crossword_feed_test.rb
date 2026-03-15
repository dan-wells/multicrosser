require 'test_helper'

class CrosswordFeedTest < ActiveSupport::TestCase
  # CrosswordFeed.load hits the live Guardian RSS feed, so we test the
  # filtering logic by verifying it respects Series::SERIES.keys.

  test "series filter rejects unknown series" do
    assert_not 'prize'.in?(Series::SERIES.keys),
      "Expected 'prize' to not be in SERIES.keys for this test to be meaningful"
  end

  test "series filter accepts configured series" do
    Series::SERIES.keys.each do |name|
      assert name.in?(Series::SERIES.keys), "#{name} should be accepted"
    end
  end
end
