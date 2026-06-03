class Source::Guardian < Source
  def fetch(series, identifier)
    key = "#{series}/#{identifier}"
    cached = ::REDIS.get(key)
    return cached if cached.present?

    response = Faraday.get(publisher_url(series, identifier))
    html = Nokogiri::HTML(response.body)
    island = html.css('gu-island[name="CrosswordComponent"]')
    return nil unless island.any?
    props = island.first['props']
    return nil unless props
    outer = JSON.parse(CGI.unescapeHTML(props))
    data = outer['data'].to_json
    ::REDIS.set(key, data)
    data
  rescue JSON::ParserError
    nil
  end

  def publisher_url(series, identifier)
    "https://www.theguardian.com/crosswords/#{series}/#{identifier}"
  end

  def publisher_name
    'the Guardian'
  end

  def commentary_url(series, identifier)
    direct = ::REDIS.get("fifteensquared-#{series}/#{identifier}")
    direct ||
      "https://www.fifteensquared.net/?s=#{CGI.escape("guardian #{series} #{identifier}")}"
  end

  def commentary_label
    'Fifteensquared'
  end

  def commentary_is_search?(series, identifier)
    ::REDIS.get("fifteensquared-#{series}/#{identifier}").nil?
  end

  def random_identifier(series, day: nil)
    first = Series::SERIES[series][:first_puzzle]
    latest = Series.latest_puzzle(series)&.to_i
    return nil unless latest && latest >= first

    # Cryptic publishes Mon-Fri only; Saturday's slot (every 6th number)
    # belongs to the Prize series instead.  When a day filter is active
    # (Cryptic only), we fetch full crossword data to check the publication
    # day and cache it for future lookups so we can filter by difficulty.
    # This retry loop covers us if we hit a non-existent puzzle number or a
    # different day than requested. 15 retries gives >95% success rate.
    max_attempts = 15
    max_attempts.times do
      candidate = rand(first..latest)
      if day
        data = CrosswordFetcher.fetch(series, candidate)
        next unless data
        date = Time.at(JSON.parse(data)['date'] / 1000).utc.to_date
        next unless date.cwday == day
        return candidate.to_s
      else
        return candidate.to_s if ::REDIS.exists?("#{series}/#{candidate}")
        uri = URI(publisher_url(series, candidate))
        response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 5) do |http|
          http.head(uri.path)
        end
        return candidate.to_s if response.code == '200'
      end
    end
    nil
  end

  def feed_load
    response = Faraday.get "https://www.theguardian.com/crosswords/rss"
    xml = Nokogiri::XML(response.body)
    xml.css('item').each do |element|
      link = element.css('link').text
      series, identifier = link.split('/').last(2)
      next unless series.in?(Series::SERIES.keys)
      next unless Series::SERIES[series][:source] == 'guardian'

      crossword = Crossword.new(
        "title" => element.css('title').text,
        "series" => series,
        "identifier" => identifier,
        "date" => element.at('dc|date').text
      )
      crossword.save
    end
  end
end
