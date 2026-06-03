class CrosswordFeed
  def self.load
    Source.all.each(&:feed_load)
  end
end
