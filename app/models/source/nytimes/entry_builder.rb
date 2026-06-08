module Source::Nytimes::EntryBuilder
  # Walks a parsed grid of `{ type: :black }` / `{ type: :cell, letter:, style: }`
  # cells in row-major order, numbering entry starts the same way crosswords are
  # conventionally numbered, and zips the entries against pre-parsed clue arrays.
  # Returns [entries, cell_styles] in the CAPI hash shape.
  #
  # The grid shape is shared between Source::Nytimes::Parser (nytsyn plaintext)
  # and Source::Nytimes::XwordinfoParser (xwordinfo HTML); both call into this
  # helper so the numbering / clue-consumption logic only lives in one place.
  # `error_class` is the exception raised when the clue counts don't line up
  # with the entries the grid produced -- each caller passes their own
  # MalformedPuzzle / MalformedPage so the surrounding rescue blocks still work.
  def self.call(grid, across_clues, down_clues, error_class:)
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

    raise error_class, "across clues consumed #{across_idx} of #{across_clues.size}" unless across_idx == across_clues.size
    raise error_class, "down clues consumed #{down_idx} of #{down_clues.size}" unless down_idx == down_clues.size

    [entries, cell_styles]
  end

  def self.build_entry(id, number, direction, x, y, length, clue, solution)
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
  private_class_method :build_entry
end
