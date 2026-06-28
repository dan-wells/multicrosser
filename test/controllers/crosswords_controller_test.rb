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

  # --- print ---

  test "print renders the crossword in a stripped-down layout" do
    crossword_json = {
      "name" => "Cryptic crossword No 21620",
      "date" => 1_700_000_000_000,
      "dimensions" => { "cols" => 15, "rows" => 15 },
      "creator" => { "name" => "Picaroon" }
    }.to_json
    CrosswordFetcher.stub(:fetch, crossword_json) do
      get "/print/cryptic/21620"
    end

    assert_response :success
    assert_match(/Cryptic crossword No 21620/, response.body)
    assert_match(/print-page/, response.body)
    assert_match(/data-source="guardian"/, response.body)
    # Print layout should not include the live-page banner
    assert_no_match(/Several People are Solving/, response.body)
  end

  test "print sets the NYT source for nytimes series" do
    crossword_json = {
      "name" => "NY Times, Sun, Apr 26, 2026",
      "date" => 1_700_000_000_000,
      "dimensions" => { "cols" => 21, "rows" => 21 }
    }.to_json
    CrosswordFetcher.stub(:fetch, crossword_json) do
      get "/print/nytimes/250426"
    end

    assert_response :success
    assert_match(/data-source="nytimes"/, response.body)
  end

  test "print renders 404 for an unknown series" do
    get "/print/garbage/123"
    assert_response :not_found
  end

  test "print renders 404 when the fetcher returns nil" do
    CrosswordFetcher.stub(:fetch, nil) do
      get "/print/cryptic/21620"
    end
    assert_response :not_found
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

  test "random with a day filter outside the series schedule (Sat for Cryptic) renders 404" do
    REDIS.set("crossword-series-cryptic", [{ "identifier" => "21620" }].to_json)
    get "/cryptic/random", params: { day: 6 }
    assert_response :not_found
    assert_match(/Puzzle not found/i, response.body)
  end

  test "random with a non-numeric day param renders 404" do
    REDIS.set("crossword-series-cryptic", [{ "identifier" => "21620" }].to_json)
    get "/cryptic/random", params: { day: 'abc' }
    assert_response :not_found
  end

  test "random silently ignores a day param on a series with no day schedule (quiptic)" do
    REDIS.set("crossword-series-quiptic", [{ "identifier" => "1" }].to_json)
    REDIS.set("quiptic/1", '{"some":"data"}')

    Net::HTTP.stub(:start, ->(*) { raise "should not hit the network" }) do
      get "/quiptic/random", params: { day: 1 }
    end

    assert_response :redirect
    assert_match %r{/quiptic/1/[0-9a-f]{8}\z}, response.location
  end

  test "random with a day filter exhausts its retries and redirects with random_failed" do
    REDIS.set("crossword-series-cryptic", [{ "identifier" => "21620" }].to_json)

    # 2024-06-11 was a Tuesday -- requesting day=1 (Monday) will never match.
    tuesday_ms = Time.utc(2024, 6, 11).to_i * 1000
    CrosswordFetcher.stub(:fetch, { "date" => tuesday_ms }.to_json) do
      get "/cryptic/random", params: { day: 1 }
    end

    assert_redirected_to root_path(error: 'random_failed')
  end

  # --- print_random ---

  test "print_random redirects to the print view for a cached puzzle" do
    REDIS.set("crossword-series-cryptic", [{ "identifier" => "21620" }].to_json)
    REDIS.set("cryptic/21620", '{"some":"data"}')

    Net::HTTP.stub(:start, ->(*) { raise "should not hit the network" }) do
      get "/print/cryptic/random"
    end

    assert_response :redirect
    assert_match %r{/print/cryptic/21620\z}, response.location
  end

  test "print_random redirects to root with random_failed for an unknown series" do
    get "/print/garbage/random"
    assert_redirected_to root_path(error: 'random_failed')
  end

  test "print_random honors the day param" do
    REDIS.set("crossword-series-cryptic", [{ "identifier" => "21620" }].to_json)

    monday_ms = Time.utc(2024, 6, 10).to_i * 1000
    CrosswordFetcher.stub(:fetch, { "date" => monday_ms }.to_json) do
      get "/print/cryptic/random", params: { day: 1 }
    end

    assert_response :redirect
    assert_match %r{/print/cryptic/21620\z}, response.location
  end

  # --- print_latest ---

  test "print_latest redirects to the print view for the most recent puzzle" do
    REDIS.set("crossword-series-cryptic", [
      { "identifier" => "21620" },
      { "identifier" => "21619" },
    ].to_json)

    get "/print/cryptic/latest"

    assert_response :redirect
    assert_match %r{/print/cryptic/21620\z}, response.location
  end

  test "print_latest redirects to root with random_failed for an unknown series" do
    get "/print/garbage/latest"
    assert_redirected_to root_path(error: 'random_failed')
  end

  test "print_latest redirects to root with random_failed when the series cache is empty" do
    # No Redis entry for crossword-series-cryptic
    get "/print/cryptic/latest"
    assert_redirected_to root_path(error: 'random_failed')
  end
end
