class Source::Nonograms < Source
  BASE_URL = 'https://www.puzzle-nonograms.com/'.freeze
  HEADERS = { 'User-Agent' => 'Mozilla/5.0' }.freeze

  # The puzzle page carries the clues in a `task` string and the solution only
  # as md5(task + solution), so there is nothing to parse but these four values.
  TASK_RE = /var task = '([^']*)'/.freeze
  HASHED_SOLUTION_RE = /hashedSolution:\s*'([0-9a-f]+)'/.freeze
  WIDTH_RE = /puzzleWidth:\s*(\d+)/.freeze
  HEIGHT_RE = /puzzleHeight:\s*(\d+)/.freeze

  def fetch(series, identifier)
    key = "#{series}/#{identifier}"
    cached = ::REDIS.get(key)
    return cached if cached.present?

    response = Faraday.get(BASE_URL, query_params(series, identifier), HEADERS)
    data = parse(response.body, series, identifier) or return nil
    json = data.to_json
    ::REDIS.set(key, json)
    json
  rescue Faraday::Error
    nil
  end

  def publisher_url(series, identifier)
    "#{BASE_URL}?#{query_params(series, identifier).to_query}"
  end

  def publisher_name
    'Puzzle Nonograms'
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

  def query_params(series, identifier)
    { specific: 1, size: Series::SERIES[series][:size_param], specid: identifier }
  end

  # Returns nil for the "No puzzle with such ID." page, which carries no task.
  def parse(body, series, identifier)
    task = body[TASK_RE, 1] or return nil
    hashed_solution = body[HASHED_SOLUTION_RE, 1] or return nil
    width = body[WIDTH_RE, 1]&.to_i or return nil
    height = body[HEIGHT_RE, 1]&.to_i or return nil

    groups = task.split('/').map { |group| group.split('.').map(&:to_i) }
    return nil unless groups.length == width + height

    col_clues = groups.first(width)
    row_clues = groups.last(height)
    return nil unless clues_consistent?(col_clues, row_clues, width, height)

    {
      'type' => 'nonogram',
      'id' => identifier.to_s,
      'size' => Series::SERIES[series][:size],
      'dimensions' => { 'cols' => width, 'rows' => height },
      'task' => task,
      'colClues' => col_clues,
      'rowClues' => row_clues,
      'hashedSolution' => hashed_solution,
      'name' => name_for(series, identifier),
    }
  end

  # Necessary conditions for any nonogram, used to reject a mangled or
  # deliberately corrupted `task` string before it reaches the Redis cache,
  # where a bad puzzle would otherwise stick around indefinitely. These are
  # cheap invariants, not a solvability check.
  def clues_consistent?(col_clues, row_clues, width, height)
    return false unless col_clues.sum(&:sum) == row_clues.sum(&:sum)
    return false unless (col_clues + row_clues).all? { |clue| clue.all?(&:positive?) }
    return false unless col_clues.all? { |clue| fits?(clue, height) }
    row_clues.all? { |clue| fits?(clue, width) }
  end

  # Runs plus the single gap each one needs after it must span no more than
  # the line. An empty clue (a blank line) trivially fits.
  def fits?(clue, line_length)
    clue.empty? || clue.sum + clue.length - 1 <= line_length
  end

  def name_for(series, identifier)
    size = Series::SERIES[series][:size]
    number = ActiveSupport::NumberHelper.number_to_delimited(identifier.to_i)
    "#{size}x#{size} Nonogram No #{number}"
  end
end
