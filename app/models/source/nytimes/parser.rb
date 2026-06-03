class Source::Nytimes::Parser
  class Error < StandardError; end
  class UnsupportedPuzzle < Error; end
  class UnsupportedShaded < UnsupportedPuzzle; end
  class UnsupportedRebus < UnsupportedPuzzle; end
  class MalformedPuzzle < Error; end

  TITLE = 'The New York Times crossword'.freeze

  def self.parse(raw)
    new(raw).parse
  end

  def initialize(raw)
    # NYT syndication occasionally serves Latin-1 (e.g. curly apostrophes in
    # clue text); coerce to UTF-8, replacing anything we can't decode so split
    # / strip / regex match all work without ArgumentError.
    @raw = raw.to_s.dup.force_encoding('ISO-8859-1').encode('UTF-8')
  end

  def parse
    blocks = @raw.split(/\n\s*\n/).map(&:strip).reject(&:empty?)
    raise MalformedPuzzle, 'too few blocks' if blocks.size < 11
    raise MalformedPuzzle, 'missing ARCHIVE header' unless blocks[0] == 'ARCHIVE'

    orig_date = parse_orig_date(blocks[1])
    syn_date, extra_title = parse_syndication(blocks[2])
    setter, editor = parse_credits(blocks[3])
    rows = parse_int(blocks[4])
    cols = parse_int(blocks[5])
    across_count = parse_int(blocks[6])
    down_count = parse_int(blocks[7])
    raise MalformedPuzzle, 'zero dimensions' if rows.zero? || cols.zero? || across_count.zero? || down_count.zero?

    grid = parse_grid(blocks[8], rows, cols)
    across_clues = blocks[9].lines.map(&:strip).reject(&:empty?)
    down_clues = blocks[10].lines.map(&:strip).reject(&:empty?)
    raise MalformedPuzzle, "across count mismatch (#{across_clues.size} vs #{across_count})" unless across_clues.size == across_count
    raise MalformedPuzzle, "down count mismatch (#{down_clues.size} vs #{down_count})" unless down_clues.size == down_count

    entries, cell_styles = build_entries_and_styles(grid, across_clues, down_clues)

    {
      'id' => "crossword/nytimes/#{syn_date.strftime('%y%m%d')}",
      'name' => TITLE,
      'subtitle' => extra_title,
      'date' => syn_date.to_time(:utc).to_i * 1000,
      'creator' => {
        'name' => "#{setter} / #{editor}",
      },
      'dimensions' => { 'rows' => rows, 'cols' => cols },
      'entries' => entries,
      'cellStyles' => cell_styles,
      'originalDate' => orig_date.iso8601,
      'syndicationDate' => syn_date.to_time(:utc).iso8601,
      'solutionAvailable' => true,
    }
  end

  private

  def parse_orig_date(text)
    Date.strptime(text.strip, '%y%m%d')
  rescue ArgumentError
    raise MalformedPuzzle, 'bad orig date'
  end

  def parse_syndication(text)
    m = text.strip.match(/^NY Times,\s*([A-Za-z]{3},\s*[A-Za-z]{3}\s+\d{1,2},\s*\d{4})\s*(.*)$/)
    raise MalformedPuzzle, 'bad syndication line' unless m
    date = Date.strptime(m[1], '%a, %b %d, %Y')
    extra = m[2].strip
    extra = nil if extra.empty?
    [date, extra]
  rescue ArgumentError
    raise MalformedPuzzle, 'bad syndication date'
  end

  def parse_credits(text)
    parts = text.strip.split('/').map(&:strip)
    raise MalformedPuzzle, 'bad credits' unless parts.size == 2 && parts.all? { |p| !p.empty? }
    parts
  end

  def parse_int(text)
    Integer(text.strip)
  rescue ArgumentError, TypeError
    raise MalformedPuzzle, 'bad integer'
  end

  def parse_grid(block, expected_rows, expected_cols)
    lines = block.lines.map(&:chomp).reject(&:empty?)
    raise MalformedPuzzle, "expected #{expected_rows} rows, got #{lines.size}" unless lines.size == expected_rows
    lines.map { |line| parse_row(line, expected_cols) }
  end

  def parse_row(line, expected_cols)
    raise UnsupportedShaded, 'shaded marker (^) in layout' if line.include?('^')
    raise UnsupportedRebus, 'rebus marker (,) in layout' if line.include?(',')

    cells = []
    i = 0
    while i < line.length
      c = line[i]
      case c
      when '#'
        cells << { type: :black }
        i += 1
      when '%'
        letter = line[i + 1]
        raise MalformedPuzzle, 'circle marker without letter' if letter.nil? || letter == '#' || letter == '%'
        cells << { type: :cell, letter: letter, style: :circled }
        i += 2
      else
        cells << { type: :cell, letter: c }
        i += 1
      end
    end

    raise MalformedPuzzle, "row width mismatch: expected #{expected_cols}, got #{cells.size}" unless cells.size == expected_cols
    cells
  end

  def build_entries_and_styles(grid, across_clues, down_clues)
    rows = grid.size
    cols = grid[0].size

    number = 0
    entries = []
    cell_styles = []
    across_idx = 0
    down_idx = 0

    rows.times do |y|
      cols.times do |x|
        cell = grid[y][x]
        next if cell[:type] == :black

        if cell[:style]
          cell_styles << { 'x' => x, 'y' => y, 'style' => cell[:style].to_s }
        end

        left_black = x.zero? || grid[y][x - 1][:type] == :black
        right_open = x + 1 < cols && grid[y][x + 1][:type] != :black
        above_black = y.zero? || grid[y - 1][x][:type] == :black
        below_open = y + 1 < rows && grid[y + 1][x][:type] != :black

        starts_across = left_black && right_open
        starts_down = above_black && below_open
        next unless starts_across || starts_down

        number += 1

        if starts_across
          word = +''
          length = 0
          (x...cols).each do |xx|
            break if grid[y][xx][:type] == :black
            length += 1
            word << grid[y][xx][:letter]
          end
          id = "#{number}-across"
          entries << build_entry(id, number, 'across', x, y, length, across_clues[across_idx].to_s, word)
          across_idx += 1
        end

        if starts_down
          word = +''
          length = 0
          (y...rows).each do |yy|
            break if grid[yy][x][:type] == :black
            length += 1
            word << grid[yy][x][:letter]
          end
          id = "#{number}-down"
          entries << build_entry(id, number, 'down', x, y, length, down_clues[down_idx].to_s, word)
          down_idx += 1
        end
      end
    end

    raise MalformedPuzzle, "across clues consumed #{across_idx} of #{across_clues.size}" unless across_idx == across_clues.size
    raise MalformedPuzzle, "down clues consumed #{down_idx} of #{down_clues.size}" unless down_idx == down_clues.size

    [entries, cell_styles]
  end

  def build_entry(id, number, direction, x, y, length, clue, solution)
    {
      'id' => id,
      'number' => number,
      'humanNumber' => number.to_s,
      'direction' => direction,
      'position' => { 'x' => x, 'y' => y },
      'length' => length,
      'clue' => clue,
      'solution' => solution,
      'group' => [id],
      'separatorLocations' => {},
    }
  end
end
