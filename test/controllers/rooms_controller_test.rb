require 'test_helper'
require 'minitest/mock'

class RoomsControllerTest < ActionDispatch::IntegrationTest
  CROSSWORD_JSON = {
    "name" => "Cryptic crossword No 21620",
    "date" => 1_700_000_000_000,
    "creator" => { "name" => "Picaroon", "webUrl" => "https://example.com" }
  }.to_json

  setup do
    REDIS.flushdb
  end

  test "show renders 404 puzzle_not_found when the series is unknown" do
    get "/garbage/123/room1"
    assert_response :not_found
    assert_match(/Puzzle not found/i, response.body)
  end

  test "show renders 404 puzzle_not_found when the fetcher returns nil" do
    CrosswordFetcher.stub(:fetch, nil) do
      get "/cryptic/21620/room1"
    end

    assert_response :not_found
    assert_match(/Puzzle not found/i, response.body)
    assert_match(/Cryptic/i, response.body)
    assert_match(/21620/, response.body)
  end

  test "show renders the crossword with a fifteensquared search URL when no direct link is cached" do
    CrosswordFetcher.stub(:fetch, CROSSWORD_JSON) do
      get "/cryptic/21620/room1"
    end

    assert_response :success
    # No fifteensquared-cryptic/21620 key in Redis → @fifteensquared_is_search = true
    # and the URL is a fifteensquared.net search URL.
    assert_match %r{fifteensquared\.net/\?s=}, response.body
    assert_match(/Search on/i, response.body)
  end

  test "show uses the cached direct fifteensquared URL when one is present" do
    direct_url = "https://www.fifteensquared.net/2023/11/14/guardian-cryptic-21620/"
    REDIS.set("fifteensquared-cryptic/21620", direct_url)

    CrosswordFetcher.stub(:fetch, CROSSWORD_JSON) do
      get "/cryptic/21620/room1"
    end

    assert_response :success
    assert_includes response.body, direct_url
    refute_match %r{fifteensquared\.net/\?s=}, response.body
  end
end
