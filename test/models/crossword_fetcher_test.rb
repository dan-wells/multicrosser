require 'test_helper'
require 'minitest/mock'

class CrosswordFetcherTest < ActiveSupport::TestCase
  setup do
    REDIS.flushdb
  end

  test "returns cached value when present" do
    REDIS.set("cryptic/123", '{"some":"data"}')
    assert_equal '{"some":"data"}', CrosswordFetcher.fetch("cryptic", "123")
  end

  test "does not treat cached empty string as a hit" do
    REDIS.set("cryptic/123", "")
    # Should attempt a live fetch rather than returning "", which would cause
    # JSON.parse("") to raise in the controller. We stub Faraday to return
    # a response with no gu-island, so fetch returns nil rather than "".
    Faraday.stub(:get, stub_response("")) do
      assert_nil CrosswordFetcher.fetch("cryptic", "123")
    end
  end

  private

  def stub_response(body)
    Struct.new(:body).new(body)
  end
end
