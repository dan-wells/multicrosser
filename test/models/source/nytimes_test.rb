require 'test_helper'
require 'minitest/mock'

class Source::NytimesTest < ActiveSupport::TestCase
  setup do
    REDIS.flushdb
    @source = Source::Nytimes.new
  end

  def cache_puzzle(identifier, original_date)
    REDIS.set("nytimes/#{identifier}", { 'originalDate' => original_date }.to_json)
  end

  # --- commentary_url (Wordplay) -------------------------------------------

  test "commentary_url returns a Wordplay URL when original_date is on the earliest covered date" do
    cache_puzzle('170805', '2017-07-01')
    assert_equal(
      'https://www.nytimes.com/2017/06/30/crosswords/daily-puzzle-2017-07-01.html',
      @source.commentary_url('nytimes', '170805'),
    )
  end

  test "commentary_url returns a Wordplay URL for a recent puzzle" do
    cache_puzzle('260601', '2026-04-27')
    assert_equal(
      'https://www.nytimes.com/2026/04/26/crosswords/daily-puzzle-2026-04-27.html',
      @source.commentary_url('nytimes', '260601'),
    )
  end

  test "commentary_url returns nil for puzzles before Wordplay's earliest column" do
    cache_puzzle('170804', '2017-06-30')
    assert_nil @source.commentary_url('nytimes', '170804')
  end

  test "commentary_url returns nil when the puzzle isn't cached" do
    assert_nil @source.commentary_url('nytimes', '999999')
  end

  # --- Unsupported-puzzle sentinels ----------------------------------------

  test "fetch reads back nil for any unsupported: sentinel" do
    %w[unsupported:shaded unsupported:rebus unsupported:malformed].each do |sentinel|
      REDIS.set("nytimes/sample", sentinel)
      assert_nil @source.fetch('nytimes', 'sample'), "expected nil for sentinel #{sentinel.inspect}"
    end
  end

  test "fetch reads back nil for any transient: sentinel" do
    REDIS.set('nytimes/sample', 'transient:xwordinfo-unavailable')
    assert_nil @source.fetch('nytimes', 'sample')
  end

  test "fetch writes the rebus sentinel when the layout has a , marker" do
    body = File.read(Rails.root.join('test/fixtures/files/nytimes/240111.txt'))
    Faraday.stub(:get, stub_response(body)) do
      assert_nil @source.fetch('nytimes', '240111')
    end
    assert_equal 'unsupported:rebus', REDIS.get('nytimes/240111')
  end

  test "fetch writes the malformed sentinel for garbage input" do
    Faraday.stub(:get, stub_response('not a crossword')) do
      assert_nil @source.fetch('nytimes', 'garbage')
    end
    assert_equal 'unsupported:malformed', REDIS.get('nytimes/garbage')
  end

  # --- Shaded fallback via xwordinfo ----------------------------------------

  test "shaded puzzle falls back to xwordinfo and caches the parsed JSON on success" do
    nytsyn_body = File.read(Rails.root.join('test/fixtures/files/nytimes/240808.txt'))
    xwordinfo_body = File.read(Rails.root.join('test/fixtures/files/nytimes/xwordinfo_260430.html'))

    Faraday.stub(:get, faraday_router(nytsyn_body, xwordinfo_body)) do
      result = @source.fetch('nytimes', '240808')
      refute_nil result, 'expected fallback to return puzzle JSON'
      parsed = JSON.parse(result)
      assert_equal 'The New York Times crossword', parsed['name']
      # Shaded cells should be present in the parsed output.
      assert parsed['cellStyles'].any? { |s| s['style'] == 'shaded' }
    end

    cached = REDIS.get('nytimes/240808')
    refute cached.start_with?('unsupported:'), "expected JSON, got sentinel: #{cached}"
    refute cached.start_with?('transient:'),   "expected JSON, got sentinel: #{cached}"
  end

  test "shaded puzzle writes transient sentinel with TTL when xwordinfo returns a login page" do
    nytsyn_body = File.read(Rails.root.join('test/fixtures/files/nytimes/240808.txt'))
    login_body = "<html><a href='/Account/Login.aspx'>log in</a></html>"

    Faraday.stub(:get, faraday_router(nytsyn_body, login_body)) do
      assert_nil @source.fetch('nytimes', '240808')
    end
    assert_equal 'transient:xwordinfo-unavailable', REDIS.get('nytimes/240808')
    ttl = REDIS.ttl('nytimes/240808')
    assert ttl.positive? && ttl <= Source::Nytimes::TRANSIENT_TTL,
           "expected positive TTL <= #{Source::Nytimes::TRANSIENT_TTL}, got #{ttl}"
  end

  private

  def stub_response(body)
    Struct.new(:body, :env).new(body, nil)
  end

  # Faraday.get(url, params, headers) — return different bodies based on the URL.
  def faraday_router(nytsyn_body, xwordinfo_body)
    lambda do |url, *_args|
      if url == Source::Nytimes::BASE_URL
        stub_response(nytsyn_body)
      elsif url == Source::Nytimes::XWORDINFO_URL
        stub_response(xwordinfo_body)
      else
        raise "unexpected Faraday.get URL: #{url.inspect}"
      end
    end
  end
end
