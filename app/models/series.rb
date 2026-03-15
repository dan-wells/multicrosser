# first_puzzle: lowest valid puzzle number for the series.
# skip_period: some series don't publish every day, leaving gaps in the puzzle
#   number sequence. skip_period is the cycle length; within each cycle the
#   last number is skipped.
# skip_ref: a known valid puzzle number that anchors the cycle. A number
#   n is skipped when (n - skip_ref) % skip_period == skip_period - 1.
# e.g. Cryptic publishes Mon–Fri only; Saturday's slot (every 6th number)
# belongs to the Prize series instead. Cryptic 29943 is Monday 2 March 2026

class Series
  #SERIES = ['quiptic', 'quick', 'weekend', 'cryptic', 'speedy', 'prize', 'everyman']
  SERIES = {
    'quiptic' => { first_puzzle: 1 },
    'cryptic' => { first_puzzle: 21620, skip_period: 6, skip_ref: 29943 },
  }

  def self.get_all
    keys = SERIES.keys.map{|name| "crossword-series-#{name}"}
    series = redis.mget(*keys).map{|a_series| JSON.parse(a_series || '[]') }
    SERIES.keys.zip(series).map do |name, crossword_datas|
      [name, crossword_datas.map {|crossword_data| Crossword.new(crossword_data)}]
    end.select{|name, series| series.any? }
  end

  def self.redis
    ::REDIS
  end
end
