require 'test_helper'
require 'minitest/mock'

class CrosswordsControllerTest < ActionDispatch::IntegrationTest
  setup do
    REDIS.flushdb
  end

  # --- show ---

  test "show redirects to a freshly-named room for the requested puzzle" do
    get "/cryptic/21620"
    assert_response :redirect
    assert_match %r{\A.+/cryptic/21620/[0-9a-f]{8}\z}, response.location
  end

  # --- random: error paths ---

  test "random redirects to root with random_failed for an unknown series" do
    get "/garbage/random"
    assert_redirected_to root_path(error: 'random_failed')
  end

  test "random redirects to root with random_failed when there is no latest puzzle" do
    # No Redis entry for crossword-series-cryptic → latest_puzzle returns nil
    get "/cryptic/random"
    assert_redirected_to root_path(error: 'random_failed')
  end

  # --- random: no-day-filter branches ---

  test "random returns a cached puzzle without hitting the Guardian" do
    REDIS.set("crossword-series-cryptic", [{ "identifier" => "21620" }].to_json)
    REDIS.set("cryptic/21620", '{"some":"data"}')

    # If the controller falls through to HEAD, the test will time out hitting
    # the network. Stub Net::HTTP.start to fail loudly if that happens.
    Net::HTTP.stub(:start, ->(*) { raise "should not hit the network" }) do
      get "/cryptic/random"
    end

    assert_response :redirect
    assert_match %r{/cryptic/21620/[0-9a-f]{8}\z}, response.location
  end

  test "random falls back to a HEAD request and accepts 200" do
    REDIS.set("crossword-series-cryptic", [{ "identifier" => "21620" }].to_json)

    fake_http = Object.new
    fake_http.define_singleton_method(:head) { |_path| Struct.new(:code).new('200') }

    Net::HTTP.stub(:start, ->(*_args, **_kwargs, &block) { block.call(fake_http) }) do
      get "/cryptic/random"
    end

    assert_response :redirect
    assert_match %r{/cryptic/21620/[0-9a-f]{8}\z}, response.location
  end

  # --- random: day-filter branches ---

  test "random with a day filter returns a puzzle published on the requested weekday" do
    REDIS.set("crossword-series-cryptic", [{ "identifier" => "21620" }].to_json)

    # 2024-06-10 was a Monday (wday=1). Day filter accepts values 1..5.
    monday_ms = Time.utc(2024, 6, 10).to_i * 1000
    CrosswordFetcher.stub(:fetch, { "date" => monday_ms }.to_json) do
      get "/cryptic/random", params: { day: 1 }
    end

    assert_response :redirect
    assert_match %r{/cryptic/21620/[0-9a-f]{8}\z}, response.location
  end

  test "random with a day filter exhausts its retries and redirects with random_failed" do
    REDIS.set("crossword-series-cryptic", [{ "identifier" => "21620" }].to_json)

    # 2024-06-11 was a Tuesday — requesting day=1 (Monday) will never match.
    tuesday_ms = Time.utc(2024, 6, 11).to_i * 1000
    CrosswordFetcher.stub(:fetch, { "date" => tuesday_ms }.to_json) do
      get "/cryptic/random", params: { day: 1 }
    end

    assert_redirected_to root_path(error: 'random_failed')
  end
end
