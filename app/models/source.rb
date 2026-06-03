class Source
  def self.for(series)
    instance_for(Series::SERIES.fetch(series)[:source])
  end

  def self.all
    Series::SERIES.values.map { |meta| meta[:source] }.uniq.map { |name| instance_for(name) }
  end

  def self.instance_for(source_name)
    # Eager-build the instance hash so a future per-source state addition
    # (Faraday connection pool, setter-id memo, etc.) can't silently produce
    # orphaned instances if two threads race on first access.
    @instances ||= Series::SERIES.values.map { |meta| meta[:source] }.uniq.to_h do |name|
      [name, "Source::#{name.camelize}".constantize.new]
    end
    @instances.fetch(source_name)
  end

  def fetch(series, identifier)
    raise NotImplementedError
  end

  def publisher_url(series, identifier)
    raise NotImplementedError
  end

  def publisher_name
    raise NotImplementedError
  end

  def commentary_url(series, identifier)
    nil
  end

  def commentary_label
    nil
  end

  def commentary_is_search?(series, identifier)
    false
  end

  def feed_load
  end

  def random_identifier(series, day: nil)
    raise NotImplementedError
  end
end
