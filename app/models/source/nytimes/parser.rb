class Source::Nytimes::Parser
  class Error < StandardError; end
  class UnsupportedPuzzle < Error; end
  # Carries the metadata we already extracted from the nytsyn response so the
  # xwordinfo fallback can build a full CAPI hash without re-parsing.
  class UnsupportedShaded < UnsupportedPuzzle
    attr_accessor :orig_date, :syn_date, :subtitle
  end
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

    # Stash for UnsupportedShaded -- parse_row raises it before grid construction
    # completes, and the xwordinfo fallback wants the dates + subtitle back.
    @orig_date = orig_date
    @syn_date = syn_date
    @subtitle = extra_title

    grid = parse_grid(blocks[8], rows, cols)
    grid, rows, cols = trim_padding(grid)
    across_clues = blocks[9].lines.map(&:strip).reject(&:empty?)
    down_clues = blocks[10].lines.map(&:strip).reject(&:empty?)
    raise MalformedPuzzle, "across count mismatch (#{across_clues.size} vs #{across_count})" unless across_clues.size == across_count
    raise MalformedPuzzle, "down count mismatch (#{down_clues.size} vs #{down_count})" unless down_clues.size == down_count

    entries, cell_styles = Source::Nytimes::EntryBuilder.call(grid, across_clues, down_clues, error_class: MalformedPuzzle)

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
    if line.include?('^')
      err = UnsupportedShaded.new('shaded marker (^) in layout')
      err.orig_date = @orig_date
      err.syn_date = @syn_date
      err.subtitle = @subtitle
      raise err
    end
    raise UnsupportedRebus, 'rebus marker (,) in layout' if line.include?(',')

    cells = []
    i = 0
    while i < line.length
      c = line[i]
      case c
      when '#'
        cells << { type: :black }
        i += 1
      when '.'
        # Syndication pads non-square grids out to a square shape with `.`.
        # Tag these so trim_padding can crop entire padding rows/cols and
        # convert any remaining interior ones to black cells.
        cells << { type: :padding }
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

  # Crops rows/cols whose every cell is `:padding`, then rewrites any
  # remaining interior `:padding` cells as `:black` so EntryBuilder only
  # has to know about the two original cell types. Returns the trimmed
  # grid plus its new (rows, cols).
  def trim_padding(grid)
    row_has_content = grid.map { |row| row.any? { |c| c[:type] != :padding } }
    col_has_content = (0...grid.first.size).map { |x| grid.any? { |row| row[x][:type] != :padding } }

    top    = row_has_content.index(true)
    bottom = row_has_content.rindex(true)
    left   = col_has_content.index(true)
    right  = col_has_content.rindex(true)
    raise MalformedPuzzle, 'grid is entirely padding' if top.nil? || left.nil?

    trimmed = grid[top..bottom].map do |row|
      row[left..right].map { |c| c[:type] == :padding ? { type: :black } : c }
    end
    [trimmed, trimmed.size, trimmed.first.size]
  end

end
