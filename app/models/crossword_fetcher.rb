module CrosswordFetcher
  def self.guardian_url(series, identifier)
    "https://www.theguardian.com/crosswords/#{series}/#{identifier}"
  end

  def self.fetch(series, identifier)
    key = "#{series}/#{identifier}"
    cached = ::REDIS.get(key)
    return cached if cached.present?

    response = Faraday.get(guardian_url(series, identifier))
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
end
