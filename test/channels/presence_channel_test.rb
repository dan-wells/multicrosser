require "test_helper"

class PresenceChannelTest < ActionCable::Channel::TestCase
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

    def hdel(key, field)
      @h[key].delete(field)
    end

    def expire(_key, _ttl)
      # no-op in tests
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

  test "cursor action writes presence to Redis and broadcasts a presence update" do
    subscribe(crossword: "cryptic/123", room: "alpha", session_id: "sess-1")
    channel_name = "presence_channel-cryptic/123-alpha"
    presence_key = "presence-cryptic/123-alpha"
    payload = { "x" => 4, "y" => 5, "entry_id" => "12-across", "entry_cells" => [[4, 5], [5, 5], [6, 5]] }

    broadcasts = capture_broadcasts(channel_name) do
      perform :cursor, payload
    end

    assert_equal 1, broadcasts.length
    broadcast = broadcasts.first
    broadcast = ActiveSupport::JSON.decode(broadcast) if broadcast.is_a?(String)
    assert_equal "presence", broadcast["type"]
    assert_equal "sess-1", broadcast["session_id"]
    assert_equal 4, broadcast["x"]
    assert_equal 5, broadcast["y"]
    assert_equal "12-across", broadcast["entry_id"]
    assert_equal [[4, 5], [5, 5], [6, 5]], broadcast["entry_cells"]

    stored = ActiveSupport::JSON.decode(@fake_redis.hgetall(presence_key)["sess-1"])
    assert_equal 4, stored["x"]
    assert_equal 5, stored["y"]
    assert_equal "12-across", stored["entry_id"]
    assert_equal [[4, 5], [5, 5], [6, 5]], stored["entry_cells"]
  end

  test "subscribed transmits a presence_snapshot of other sessions already in the room" do
    presence_key = "presence-cryptic/123-alpha"
    @fake_redis.hset(presence_key, "sess-other", { x: 1, y: 2, entry_id: "3-down", entry_cells: [[1, 2], [2, 2]] }.to_json)

    subscribe(crossword: "cryptic/123", room: "alpha", session_id: "sess-me")

    snapshot = transmissions.find { |t| t["type"] == "presence_snapshot" }
    assert snapshot, "expected a presence_snapshot transmission"
    assert_equal({ "x" => 1, "y" => 2, "entry_id" => "3-down", "entry_cells" => [[1, 2], [2, 2]] }, snapshot["sessions"]["sess-other"])
    assert_nil snapshot["sessions"]["sess-me"], "snapshot should not echo our own session back to us"
  end

  test "subscribed omits presence_snapshot when no other sessions are present" do
    subscribe(crossword: "cryptic/123", room: "alpha", session_id: "sess-me")

    snapshot = transmissions.find { |t| t["type"] == "presence_snapshot" }
    # Either no snapshot at all, or an empty one -- both acceptable. Just no entries.
    assert(snapshot.nil? || snapshot["sessions"].empty?)
  end

  test "unsubscribed removes presence and broadcasts a leave message" do
    subscribe(crossword: "cryptic/123", room: "alpha", session_id: "sess-1")
    channel_name = "presence_channel-cryptic/123-alpha"
    presence_key = "presence-cryptic/123-alpha"
    perform :cursor, { "x" => 1, "y" => 1, "entry_id" => "1-across", "entry_cells" => [[1, 1]] }
    assert @fake_redis.hgetall(presence_key)["sess-1"]

    broadcasts = capture_broadcasts(channel_name) do
      subscription.unsubscribe_from_channel
    end

    assert_equal 1, broadcasts.length
    broadcast = broadcasts.first
    broadcast = ActiveSupport::JSON.decode(broadcast) if broadcast.is_a?(String)
    assert_equal "presence", broadcast["type"]
    assert_equal "sess-1", broadcast["session_id"]
    assert_equal true, broadcast["leave"]
    assert_nil @fake_redis.hgetall(presence_key)["sess-1"]
  end
end
