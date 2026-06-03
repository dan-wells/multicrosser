module CrosswordFetcher
  def self.fetch(series, identifier)
    Source.for(series).fetch(series, identifier)
  end
end
