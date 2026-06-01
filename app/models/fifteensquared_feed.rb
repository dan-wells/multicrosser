class FifteensquaredFeed
  FEED_URL = 'https://fifteensquared.net/feed/'

  SERIES_PATTERNS = {
    'quiptic' => /(?:guardian\s+)?quiptic(?:\s+no\.?)?\s+([\d,.]+)/i,
    'cryptic' => /guardian(?:\s+cryptic)?(?:\s+crossword)?(?:\s+no\.?)?\s+([\d,.]+)/i,
    'quick-cryptic' => /(?:guardian\s+)?quick cryptic (\d+)/i,
  }

  def self.load
    response = Faraday.get(FEED_URL)
    xml = Nokogiri::XML(response.body)
    xml.css('item').each do |item|
      title = item.css('title').text
      link  = item.css('link').text
      SERIES_PATTERNS.each do |series, pattern|
        if (m = title.match(pattern))
          number = m[1].delete(',.')
          ::REDIS.set("fifteensquared-#{series}/#{number}", link)
        end
      end
    end
  end
end
