class FifteensquaredFeed
  FEED_URL = 'https://www.fifteensquared.net/feed/'

  SERIES_PATTERNS = {
    'quiptic' => /guardian\s+quiptic\s+([\d,]+)/i,
    'cryptic' => /guardian\s+cryptic\s+(?:no\.?\s*)?([\d,]+)/i,
  }

  def self.load
    response = Faraday.get(FEED_URL)
    xml = Nokogiri::XML(response.body)
    xml.css('item').each do |item|
      title = item.css('title').text
      link  = item.css('link').text
      SERIES_PATTERNS.each do |series, pattern|
        if (m = title.match(pattern))
          number = m[1].delete(',')
          redis.set("fifteensquared-#{series}/#{number}", link)
        end
      end
    end
  end

  def self.redis
    ::REDIS
  end
end
