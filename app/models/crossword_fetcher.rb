module CrosswordFetcher
  def self.fetch(series, identifier)
    key = "#{series}/#{identifier}"
    cached = REDIS.get(key)
    return cached if cached

    url = "https://www.theguardian.com/crosswords/#{series}/#{identifier}"
    response = Faraday.get(url)
    html = Nokogiri::HTML(response.body)
    island = html.css('gu-island[name="CrosswordComponent"]')
    return nil unless island.any?
    props = island.first['props']
    return nil unless props
    outer = JSON.parse(CGI.unescapeHTML(props))
    data = outer['data'].to_json
    REDIS.set(key, data)
    data
  end
end
