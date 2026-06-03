class Series
  #SERIES = ['quiptic', 'quick', 'weekend', 'cryptic', 'speedy', 'prize', 'everyman']
  SERIES = {
    'quiptic' => { source: 'guardian', first_puzzle: 1 },
    'cryptic' => { source: 'guardian', first_puzzle: 21620, days: 1..5 },
    'quick-cryptic' => { source: 'guardian', first_puzzle: 1 },
    #'quick' => { source: 'guardian', first_puzzle: 9093 },
    'nytimes' => { source: 'nytimes', first_puzzle: '080602', days: 1..7, display_name: 'New York Times' },
  }

  def self.display_name(name)
    SERIES.dig(name, :display_name) || name.to_s.titleize
  end

  def self.get_all
    keys = SERIES.keys.map{|name| "crossword-series-#{name}"}
    series = ::REDIS.mget(*keys).map{|a_series| JSON.parse(a_series || '[]') }
    SERIES.keys.zip(series).map do |name, crossword_datas|
      [name, crossword_datas.map {|crossword_data| Crossword.new(crossword_data)}]
    end.select{|name, series| series.any? }
  end

  def self.latest_puzzle(name)
    data = ::REDIS.get("crossword-series-#{name}")
    return nil unless data
    crosswords = JSON.parse(data)
    crosswords.first&.dig('identifier')
  end
end
