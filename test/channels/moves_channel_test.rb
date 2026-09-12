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

  # --- value spaces ---

  test "a move naming a space is stored in that space's own Redis hash" do
    subscribe(crossword: "nonogram-15/2401181", room: "alpha", cols: 15, rows: 15)
    payload = { "id" => "abc", "space" => "row_marks", "x" => 3, "y" => 1, "value" => "1" }

    perform :move, payload

    assert_equal "1", @fake_redis.hgetall("row_marks-nonogram-15/2401181-alpha")["3-1"]
    assert_empty @fake_redis.hgetall("moves_channel-nonogram-15/2401181-alpha")
  end

  test "spaces are checked independently, so the same cell key can hold different values" do
    subscribe(crossword: "nonogram-15/2401181", room: "alpha", cols: 15, rows: 15)

    perform :move, { "id" => "a", "space" => "row_marks", "x" => 3, "y" => 1, "value" => "1" }
    perform :move, { "id" => "b", "space" => "col_marks", "x" => 3, "y" => 1, "value" => "1" }

    assert_equal "1", @fake_redis.hgetall("row_marks-nonogram-15/2401181-alpha")["3-1"]
    assert_equal "1", @fake_redis.hgetall("col_marks-nonogram-15/2401181-alpha")["3-1"]
  end

  test "a move naming an unknown space is ignored entirely" do
    subscribe(crossword: "nonogram-15/2401181", room: "alpha", cols: 15, rows: 15)
    channel_name = "moves_channel-nonogram-15/2401181-alpha"

    assert_broadcasts(channel_name, 0) do
      perform :move, { "id" => "abc", "space" => "../etc", "x" => 1, "y" => 2, "value" => "1" }
    end

    assert_empty @fake_redis.hgetall("--nonogram-15/2401181-alpha")
  end

  test "a rejection carries the space back so the sender can route it" do
    @fake_redis.hset("row_marks-nonogram-15/2401181-alpha", "3-1", "1")
    subscribe(crossword: "nonogram-15/2401181", room: "alpha", cols: 15, rows: 15)

    perform :move, { "id" => "abc", "space" => "row_marks", "x" => 3, "y" => 1, "value" => "", "previousValue" => "" }

    assert_equal "row_marks", transmissions.last["space"]
    assert_equal true, transmissions.last["rejected"]
  end

  test "subscribed transmits initialSpaces only when spaces are requested" do
    subscribe(crossword: "nonogram-15/2401181", room: "alpha", cols: 15, rows: 15)

    refute transmissions.any? { |t| t.key?("initialSpaces") }
  end

  test "subscribed transmits the requested spaces as flat hashes" do
    @fake_redis.hset("row_marks-nonogram-15/2401181-alpha", "3-1", "1")
    @fake_redis.hset("col_marks-nonogram-15/2401181-alpha", "0-0", "1")

    subscribe(crossword: "nonogram-15/2401181", room: "alpha", cols: 15, rows: 15,
              spaces: ["row_marks", "col_marks"])

    spaces = transmissions.last["initialSpaces"]
    assert_equal({ "3-1" => "1" }, spaces["row_marks"])
    assert_equal({ "0-0" => "1" }, spaces["col_marks"])
  end

  test "subscribed ignores an unknown space in the spaces param" do
    subscribe(crossword: "nonogram-15/2401181", room: "alpha", cols: 15, rows: 15,
              spaces: ["row_marks", "bogus"])

    assert_equal ["row_marks"], transmissions.last["initialSpaces"].keys
  end

  # --- move_batch ---

  test "move_batch writes every cell and broadcasts once" do
    subscribe(crossword: "nonogram-15/2401181", room: "alpha", cols: 15, rows: 15)
    channel_name = "moves_channel-nonogram-15/2401181-alpha"
    payload = { "id" => "abc", "value" => "1",
                "cells" => [{ "x" => 1, "y" => 1 }, { "x" => 1, "y" => 2 }, { "x" => 1, "y" => 3 }] }

    broadcasts = capture_broadcasts(channel_name) do
      perform :move_batch, payload
    end

    assert_equal 1, broadcasts.length
    broadcast = broadcasts.first
    broadcast = ActiveSupport::JSON.decode(broadcast) if broadcast.is_a?(String)
    assert_equal "abc", broadcast["id"]
    assert_equal "1", broadcast["value"]
    assert_equal 3, broadcast["cells"].length

    stored = @fake_redis.hgetall(channel_name)
    assert_equal %w[1 1 1], stored.values_at("1-1", "1-2", "1-3")
  end

  test "move_batch applies the cells that pass and rejects only the conflicting one" do
    channel_name = "moves_channel-nonogram-15/2401181-alpha"
    @fake_redis.hset(channel_name, "1-2", "x")
    subscribe(crossword: "nonogram-15/2401181", room: "alpha", cols: 15, rows: 15)
    baseline = transmissions.length

    payload = { "id" => "abc", "value" => "1", "cells" => [
      { "x" => 1, "y" => 1, "previousValue" => "" },
      { "x" => 1, "y" => 2, "previousValue" => "" },
      { "x" => 1, "y" => 3, "previousValue" => "" },
    ] }

    broadcasts = capture_broadcasts(channel_name) do
      perform :move_batch, payload
    end

    broadcast = broadcasts.first
    broadcast = ActiveSupport::JSON.decode(broadcast) if broadcast.is_a?(String)
    assert_equal [{ "x" => 1, "y" => 1 }, { "x" => 1, "y" => 3 }], broadcast["cells"]

    assert_equal "x", @fake_redis.hgetall(channel_name)["1-2"]
    assert_equal baseline + 1, transmissions.length
    rejection = transmissions.last
    assert_equal true, rejection["rejected"]
    assert_equal [{ "x" => 1, "y" => 2, "value" => "x" }], rejection["cells"]
  end

  test "move_batch with every cell conflicting broadcasts nothing" do
    channel_name = "moves_channel-nonogram-15/2401181-alpha"
    @fake_redis.hset(channel_name, "1-1", "x")
    subscribe(crossword: "nonogram-15/2401181", room: "alpha", cols: 15, rows: 15)

    assert_broadcasts(channel_name, 0) do
      perform :move_batch, { "id" => "abc", "value" => "1",
                             "cells" => [{ "x" => 1, "y" => 1, "previousValue" => "" }] }
    end
  end

  test "move_batch routes to the named space and is broadcast on the board stream" do
    subscribe(crossword: "nonogram-15/2401181", room: "alpha", cols: 15, rows: 15)
    channel_name = "moves_channel-nonogram-15/2401181-alpha"

    broadcasts = capture_broadcasts(channel_name) do
      perform :move_batch, { "id" => "abc", "space" => "col_marks", "value" => "1",
                             "cells" => [{ "x" => 2, "y" => 0 }] }
    end

    broadcast = broadcasts.first
    broadcast = ActiveSupport::JSON.decode(broadcast) if broadcast.is_a?(String)
    assert_equal "col_marks", broadcast["space"]
    assert_equal "1", @fake_redis.hgetall("col_marks-nonogram-15/2401181-alpha")["2-0"]
  end
  # --- bounds and payload hygiene ---

  test "a move outside the grid is ignored entirely" do
    subscribe(crossword: "cryptic/123", room: "alpha", cols: 15, rows: 15)
    channel_name = "moves_channel-cryptic/123-alpha"

    assert_broadcasts(channel_name, 0) do
      perform :move, { "id" => "abc", "x" => 15, "y" => 2, "value" => "A" }
      perform :move, { "id" => "abc", "x" => -1, "y" => 2, "value" => "A" }
    end

    assert_empty @fake_redis.hgetall(channel_name)
  end

  test "a mark outside its axis is ignored entirely" do
    subscribe(crossword: "nonogram-15/2401181", room: "alpha", cols: 15, rows: 15)

    perform :move, { "id" => "abc", "space" => "row_marks", "x" => 15, "y" => 0, "value" => "1" }
    perform :move, { "id" => "abc", "space" => "row_marks", "x" => 0, "y" => 15, "value" => "1" }

    assert_empty @fake_redis.hgetall("row_marks-nonogram-15/2401181-alpha")
  end

  test "move_batch drops the cells that fall outside the grid" do
    subscribe(crossword: "nonogram-15/2401181", room: "alpha", cols: 15, rows: 15)
    channel_name = "moves_channel-nonogram-15/2401181-alpha"

    broadcasts = capture_broadcasts(channel_name) do
      perform :move_batch, { "id" => "abc", "value" => "1",
                             "cells" => [{ "x" => 1, "y" => 1 }, { "x" => 99, "y" => 99 }] }
    end

    broadcast = broadcasts.first
    broadcast = ActiveSupport::JSON.decode(broadcast) if broadcast.is_a?(String)
    assert_equal [{ "x" => 1, "y" => 1 }], broadcast["cells"]
    assert_equal ["1-1"], @fake_redis.hgetall(channel_name).keys
  end

  test "move_batch carrying more cells than the grid holds is ignored entirely" do
    subscribe(crossword: "nonogram-5/12345", room: "alpha", cols: 5, rows: 5)
    channel_name = "moves_channel-nonogram-5/12345-alpha"
    cells = (0...26).map { |n| { "x" => n % 5, "y" => n / 5, "previousValue" => "" } }

    assert_broadcasts(channel_name, 0) do
      perform :move_batch, { "id" => "abc", "value" => "1", "cells" => cells }
    end

    assert_empty @fake_redis.hgetall(channel_name)
  end

  test "subscribed drops out-of-range keys from a requested space" do
    key = "row_marks-nonogram-15/2401181-alpha"
    @fake_redis.hset(key, "2-0", "1")
    @fake_redis.hset(key, "99-0", "1")

    subscribe(crossword: "nonogram-15/2401181", room: "alpha", cols: 15, rows: 15, spaces: ["row_marks"])

    assert_equal({ "2-0" => "1" }, transmissions.last["initialSpaces"]["row_marks"])
  end

  test "move broadcast does not echo the sender's own bookkeeping fields" do
    subscribe(crossword: "cryptic/123", room: "alpha", cols: 15, rows: 15)
    channel_name = "moves_channel-cryptic/123-alpha"

    broadcasts = capture_broadcasts(channel_name) do
      perform :move, { "id" => "abc", "x" => 1, "y" => 2, "value" => "A",
                       "previousValue" => "", "force" => true }
    end

    broadcast = broadcasts.first
    broadcast = ActiveSupport::JSON.decode(broadcast) if broadcast.is_a?(String)
    assert_equal %w[id x y value].sort, broadcast.keys.sort
  end
end
