require "test_helper"

class MovesChannelTest < ActionCable::Channel::TestCase
  class FakeRedis
    def initialize
      @h = Hash.new { |h, k| h[k] = {} }
    end

    def hgetall(key)
      @h[key].dup
    end

    def hget(key, field)
      @h[key][field]
    end

    def hset(key, field, value)
      @h[key][field] = value
    end

  end

  def setup
    @fake_redis = FakeRedis.new
    @prev_redis = REDIS
    silence_warnings { Object.const_set(:REDIS, @fake_redis) }
  end

  def teardown
    silence_warnings { Object.const_set(:REDIS, @prev_redis) }
  end

  test "subscribed transmits an empty initialState grid for an unseen room" do
    subscribe(crossword: "cryptic/123", room: "alpha", cols: 15, rows: 15)

    assert subscription.confirmed?
    expected = Array.new(15) { Array.new(15) }
    assert_equal({ "initialState" => expected }, transmissions.last)
  end

  test "subscribed reflects prior moves stored in Redis" do
    channel_name = "moves_channel-cryptic/123-alpha"
    @fake_redis.hset(channel_name, "1-2", "A")
    @fake_redis.hset(channel_name, "3-4", "Z")

    subscribe(crossword: "cryptic/123", room: "alpha", cols: 15, rows: 15)
    grid = transmissions.last["initialState"]

    assert_equal "A", grid[1][2]
    assert_equal "Z", grid[3][4]
  end

  test "move action writes to Redis and broadcasts the payload including id" do
    subscribe(crossword: "cryptic/123", room: "alpha", cols: 15, rows: 15)
    channel_name = "moves_channel-cryptic/123-alpha"
    payload = { "id" => "abc", "x" => 1, "y" => 2, "value" => "A" }

    assert_broadcasts(channel_name, 1) do
      perform :move, payload
    end

    assert_equal "A", @fake_redis.hgetall(channel_name)["1-2"]
  end

  test "stale move (previousValue does not match) is not stored and not broadcast" do
    channel_name = "moves_channel-cryptic/123-alpha"
    @fake_redis.hset(channel_name, "1-2", "K")
    subscribe(crossword: "cryptic/123", room: "alpha", cols: 15, rows: 15)

    stale = { "id" => "abc", "x" => 1, "y" => 2, "value" => "T", "previousValue" => "" }

    assert_broadcasts(channel_name, 0) do
      perform :move, stale
    end

    assert_equal "K", @fake_redis.hgetall(channel_name)["1-2"]
  end

  test "stale move transmits a rejection (with current value) to the sender only" do
    channel_name = "moves_channel-cryptic/123-alpha"
    @fake_redis.hset(channel_name, "1-2", "K")
    subscribe(crossword: "cryptic/123", room: "alpha", cols: 15, rows: 15)
    baseline = transmissions.length

    stale = { "id" => "abc", "x" => 1, "y" => 2, "value" => "T", "previousValue" => "" }
    perform :move, stale

    assert_equal baseline + 1, transmissions.length
    rejection = transmissions.last
    assert_equal "abc", rejection["id"]
    assert_equal true, rejection["rejected"]
    assert_equal 1, rejection["x"]
    assert_equal 2, rejection["y"]
    assert_equal "K", rejection["value"]
  end

  test "forced move bypasses the previousValue check and is stored + broadcast even when current value differs" do
    channel_name = "moves_channel-cryptic/123-alpha"
    @fake_redis.hset(channel_name, "1-2", "K")
    subscribe(crossword: "cryptic/123", room: "alpha", cols: 15, rows: 15)

    forced = { "id" => "abc", "x" => 1, "y" => 2, "value" => "T", "previousValue" => "", "force" => true }

    assert_broadcasts(channel_name, 1) do
      perform :move, forced
    end

    assert_equal "T", @fake_redis.hgetall(channel_name)["1-2"]
  end

  test "forced moves are logged with a distinctive marker" do
    channel_name = "moves_channel-cryptic/123-alpha"
    subscribe(crossword: "cryptic/123", room: "alpha", cols: 15, rows: 15)

    log = StringIO.new
    original_logger = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(log)
    begin
      perform :move, { "id" => "abc", "x" => 1, "y" => 2, "value" => "T", "previousValue" => "", "force" => true }
    ensure
      Rails.logger = original_logger
    end

    assert_match(/FORCED/, log.string)
  end

  test "fresh move (previousValue matches current cell) is stored and broadcast normally" do
    channel_name = "moves_channel-cryptic/123-alpha"
    @fake_redis.hset(channel_name, "1-2", "K")
    subscribe(crossword: "cryptic/123", room: "alpha", cols: 15, rows: 15)

    fresh = { "id" => "abc", "x" => 1, "y" => 2, "value" => "T", "previousValue" => "K" }

    assert_broadcasts(channel_name, 1) do
      perform :move, fresh
    end

    assert_equal "T", @fake_redis.hgetall(channel_name)["1-2"]
  end

  test "move broadcast preserves the client-supplied id field" do
    subscribe(crossword: "cryptic/123", room: "alpha", cols: 15, rows: 15)
    channel_name = "moves_channel-cryptic/123-alpha"
    payload = { "id" => "abc-123", "x" => 5, "y" => 6, "value" => "Q" }

    broadcasts = capture_broadcasts(channel_name) do
      perform :move, payload
    end

    assert_equal 1, broadcasts.length
    broadcast = broadcasts.first
    broadcast = ActiveSupport::JSON.decode(broadcast) if broadcast.is_a?(String)
    assert_equal "abc-123", broadcast["id"]
    assert_equal 5, broadcast["x"]
    assert_equal 6, broadcast["y"]
    assert_equal "Q", broadcast["value"]
  end
end
