class Series
  #SERIES = ['quiptic', 'quick', 'weekend', 'cryptic', 'speedy', 'prize', 'everyman']
  SERIES = {
    'quiptic' => { first_puzzle: 1 },
    'cryptic' => { first_puzzle: 21620 },
  }

  def self.get_all
    keys = SERIES.keys.map{|name| "crossword-series-#{name}"}
    series = redis.mget(*keys).map{|a_series| JSON.parse(a_series || '[]') }
    SERIES.keys.zip(series).map do |name, crossword_datas|
      [name, crossword_datas.map {|crossword_data| Crossword.new(crossword_data)}]
    end.select{|name, series| series.any? }
  end


  def self.redis
    @redis ||= Redis.new
  end
end
