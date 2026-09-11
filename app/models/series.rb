class Series
  #SERIES = ['quiptic', 'quick', 'weekend', 'cryptic', 'speedy', 'prize', 'everyman']
  SERIES = {
    'cryptic' => { source: 'guardian', first_puzzle: 21620, days: 1..5 },
    'quick-cryptic' => { source: 'guardian', first_puzzle: 1 },
    'quiptic' => { source: 'guardian', first_puzzle: 1 },
    #'quick' => { source: 'guardian', first_puzzle: 9093 },
    'nytimes' => { source: 'nytimes', first_puzzle: '080602', days: 1..7, display_name: 'New York Times' },
    'nonogram-5' => { source: 'nonograms', first_puzzle: 1, last_puzzle: 12_002_239,
                      size: 5, size_param: 0, display_name: '5x5 Nonograms' },
    'nonogram-10' => { source: 'nonograms', first_puzzle: 1, last_puzzle: 15_000_000,
                       size: 10, size_param: 1, display_name: '10x10 Nonograms' },
    'nonogram-15' => { source: 'nonograms', first_puzzle: 1, last_puzzle: 15_000_000,
                       size: 15, size_param: 2, display_name: '15x15 Nonograms' },
    'nonogram-20' => { source: 'nonograms', first_puzzle: 1, last_puzzle: 15_000_000,
                       size: 20, size_param: 3, display_name: '20x20 Nonograms' },
    'nonogram-25' => { source: 'nonograms', first_puzzle: 1, last_puzzle: 12_000_000,
                       size: 25, size_param: 4, display_name: '25x25 Nonograms' },
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
