require 'open3'

class Source::Nonograms < Source
  # Puzzles are generated on demand rather than fetched. The identifier is the
  # generator's seed, so a link keeps meaning the same puzzle without anything
  # being stored; the Redis cache is for latency, and to pin what a room is
  # solving against a future change to the generator.
  GENERATOR = Rails.root.join('ext/nonogen/nonogen').to_s.freeze
  DENSITY = '0.5'.freeze
  DIAGNOSTICS = %w[passes solves].freeze

  def fetch(series, identifier)
    key = "#{series}/#{identifier}"
    cached = ::REDIS.get(key)
    return cached if cached.present?

    data = generate(series, identifier) or return nil
    json = data.to_json
    ::REDIS.set(key, json)
    json
  end

  def publisher_url(_series, _identifier)
    nil
  end

  def publisher_name
    nil
  end

  def puzzle_name(series, identifier)
    "#{size_label(series)} Nonogram No #{puzzle_number(identifier)}"
  end

  def picker_group
    'nonograms'
  end

  def picker_label(series)
    size_label(series)
  end

  def room_partial
    'nonogram'
  end

  def print_partial
    'print_nonogram'
  end

  def random_identifier(series, day: nil)
    last = Series::SERIES[series][:last_puzzle] or return nil
    rand(1..last).to_s
  end

  def feed_load
    # Nonograms have no feed; puzzles are reached by ID or at random.
  end

  private

  # Returns nil for an identifier outside the series' seed range, so that a
  # made-up URL 404s rather than generating a puzzle nothing else can reach.
  def generate(series, identifier)
    meta = Series::SERIES[series]
    return nil unless identifier.to_s.match?(/\A\d+\z/)
    return nil unless (meta[:first_puzzle]..meta[:last_puzzle]).cover?(identifier.to_i)

    stdout, status = begin
      Open3.capture2(
        GENERATOR,
        '--seed', identifier.to_s,
        '--size', meta[:size].to_s,
        '--density', DENSITY,
      )
    rescue Errno::ENOENT, Errno::EACCES => e
      Rails.logger.error("[Source::Nonograms] cannot run #{GENERATOR}: #{e.message}")
      return nil
    end
    return nil unless status.success?

    data = JSON.parse(stdout)
    return nil unless generated?(data, meta[:size])

    { 'type' => 'nonogram', 'id' => identifier.to_s, 'size' => meta[:size] }
      .merge(data.except(*DIAGNOSTICS))
      .merge('name' => puzzle_name(series, identifier))
  end

  # Catches a generator whose output no longer matches what the client reads,
  # which otherwise reaches the cache and stays there indefinitely.
  def generated?(data, size)
    data['task'].present? && data['solution']&.length == size * size &&
      data.dig('dimensions', 'cols') == size && data.dig('dimensions', 'rows') == size &&
      data['colClues']&.length == size && data['rowClues']&.length == size
  end

  def size_label(series)
    size = Series::SERIES[series][:size]
    "#{size}x#{size}"
  end

  # Thousands separators for a real ID. Anything else reaches this only from
  # the 404 page, where the identifier is whatever was asked for.
  def puzzle_number(identifier)
    return identifier unless identifier.to_s.match?(/\A\d+\z/)
    ActiveSupport::NumberHelper.number_to_delimited(identifier.to_i)
  end
end
