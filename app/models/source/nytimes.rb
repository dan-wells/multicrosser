class Source::Nytimes < Source
  BASE_URL = 'https://nytsyn.pzzl.com/nytsyn-crossword/nytsyncrossword'.freeze
  # Wordplay's archive only goes back this far; older puzzles get no link.
  WORDPLAY_EARLIEST = Date.new(2017, 7, 1).freeze
  # Sentinel prefix for puzzles the parser can't handle yet. The suffix records
  # why, so when support lands later we can purge just the affected entries
  # (e.g. all `unsupported:rebus`) and let them re-fetch with the new parser.
  UNSUPPORTED_PREFIX = 'unsupported:'.freeze

  def fetch(_series, identifier)
    key = redis_key(identifier)
    cached = ::REDIS.get(key)
    return nil if cached.is_a?(String) && cached.start_with?(UNSUPPORTED_PREFIX)
    return cached if cached.present?

    response = Faraday.get(BASE_URL, date: identifier)
    begin
      parsed = Parser.parse(response.body)
      json = parsed.to_json
      ::REDIS.set(key, json)
      json
    rescue Parser::UnsupportedShaded
      ::REDIS.set(key, "#{UNSUPPORTED_PREFIX}shaded")
      nil
    rescue Parser::UnsupportedRebus
      ::REDIS.set(key, "#{UNSUPPORTED_PREFIX}rebus")
      nil
    rescue Parser::MalformedPuzzle
      ::REDIS.set(key, "#{UNSUPPORTED_PREFIX}malformed")
      nil
    end
  rescue Faraday::Error
    nil
  end

  def publisher_url(_series, identifier)
    date = original_date(identifier) or return nil
    "https://www.nytimes.com/crosswords/game/daily/#{date.strftime('%Y/%m/%d')}"
  end

  def publisher_name
    'the New York Times'
  end

  def commentary_url(_series, identifier)
    date = original_date(identifier) or return nil
    return nil if date < WORDPLAY_EARLIEST

    day_before = date - 1
    "https://www.nytimes.com/#{day_before.strftime('%Y/%m/%d')}/crosswords/" \
      "daily-puzzle-#{date.strftime('%Y-%m-%d')}.html"
  end

  def commentary_label
    'Wordplay'
  end

  def commentary_is_search?(_series, _identifier)
    false
  end

  def random_identifier(series, day: nil)
    first = Date.strptime(Series::SERIES[series][:first_puzzle], '%y%m%d')
    latest_str = Series.latest_puzzle(series)
    latest = latest_str ? Date.strptime(latest_str, '%y%m%d') : Date.today
    return nil if latest < first

    days_in_range = (latest - first).to_i

    max_attempts = 15
    max_attempts.times do
      candidate_date = latest - rand(0..days_in_range)
      next if day && candidate_date.cwday != day
      candidate = candidate_date.strftime('%y%m%d')
      # Skip a known-unsupported date without re-hitting nytsyn: the sentinel
      # is authoritative until the relevant entries are purged.
      cached = ::REDIS.get(redis_key(candidate))
      next if cached.is_a?(String) && cached.start_with?(UNSUPPORTED_PREFIX)
      next unless fetch(series, candidate)
      return candidate
    end
    nil
  end

  def feed_load
    today = Time.now.utc.to_date.strftime('%y%m%d')
    data = fetch('nytimes', today) or return
    parsed = JSON.parse(data)
    crossword = Crossword.new(
      'title' => parsed.fetch('name'),
      'series' => 'nytimes',
      'identifier' => today,
      'date' => parsed.fetch('syndicationDate'),
    )
    crossword.save
  end

  private

  def redis_key(identifier)
    "nytimes/#{identifier}"
  end

  def original_date(identifier)
    data = ::REDIS.get(redis_key(identifier))
    return nil if data.blank?
    Date.iso8601(JSON.parse(data).fetch('originalDate'))
  rescue StandardError
    nil
  end
end
