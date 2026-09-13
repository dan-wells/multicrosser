require 'test_helper'
require 'minitest/mock'

class RoomsControllerTest < ActionDispatch::IntegrationTest
  CROSSWORD_JSON = {
    "name" => "Cryptic crossword No 21620",
    "date" => 1_700_000_000_000,
    "creator" => { "name" => "Picaroon", "webUrl" => "https://example.com" }
  }.to_json

  NONOGRAM_JSON = {
    "type" => "nonogram",
    "id" => "2401181",
    "size" => 15,
    "dimensions" => { "cols" => 15, "rows" => 15 },
    "task" => "6/6.1.1",
    "colClues" => [[6], [6, 1, 1]],
    "rowClues" => [[5, 1]],
    "solution" => "n" * 225,
    "name" => "15x15 Nonogram No 2,401,181"
  }.to_json

  setup do
    REDIS.flushdb
  end

  test "show renders 404 puzzle_not_found when the series is unknown" do
    get "/garbage/123/room1"
    assert_response :not_found
    assert_match(/Puzzle not found/i, response.body)
    # Routed rather than literal, so the way back works wherever the app is mounted.
    assert_match(/href="#{root_path}"/, response.body)
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

  # --- puzzle type dispatch ---

  test "show names a missing nonogram the way the publisher does" do
    CrosswordFetcher.stub(:fetch, nil) do
      get "/nonogram-15/2401181/room1"
    end

    assert_response :not_found
    assert_match(/15x15 Nonogram No 2,401,181/, response.body)
    assert_no_match(/crossword/i, response.body)
  end

  test "show still names a missing crossword as a crossword" do
    CrosswordFetcher.stub(:fetch, nil) do
      get "/cryptic/21620/room1"
    end

    assert_response :not_found
    assert_match(/Cryptic crossword No 21620/, response.body)
  end

  test "show renders the nonogram partial for a nonogram series" do
    CrosswordFetcher.stub(:fetch, NONOGRAM_JSON) do
      get "/nonogram-15/2401181/room1"
    end

    assert_response :success
    assert_match(/js-nonogram/, response.body)
    assert_match(/15x15 Nonogram No 2,401,181/, response.body)
    # The new-puzzle link is built here rather than in the client, so that it
    # carries whatever path the app is mounted under.
    assert_match(/data-random-path="#{random_crossword_path(series: 'nonogram-15', room: 'room1')}"/,
                 response.body)
    # Nonograms are generated here, so there is no publisher to credit.
    assert_no_match(/Published by/, response.body)
  end

  # A nonogram carries no `date` or `creator`, so rendering the crossword
  # partial for one would raise rather than merely look wrong.
  test "show does not render crossword furniture for a nonogram" do
    CrosswordFetcher.stub(:fetch, NONOGRAM_JSON) do
      get "/nonogram-15/2401181/room1"
    end

    assert_response :success
    refute_match(/js-crossword/, response.body)
    refute_match(/Set by/, response.body)
  end

  test "show still renders the crossword partial for a crossword series" do
    CrosswordFetcher.stub(:fetch, CROSSWORD_JSON) do
      get "/cryptic/21620/room1"
    end

    assert_response :success
    assert_match(/js-crossword/, response.body)
    refute_match(/js-nonogram/, response.body)
  end
end
