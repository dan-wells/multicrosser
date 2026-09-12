class MovesChannel < ApplicationCable::Channel
  SPACES = {
    'board' => 'moves_channel',
    'row_marks' => 'row_marks',
    'col_marks' => 'col_marks',
  }.freeze

  def subscribed
    stream_from(channel_name)

    grid = Array.new(cols) { Array.new(rows) }
    ::REDIS.hgetall(channel_name).each {|k, v|
      x, y = cell_of(k)
      next unless in_bounds?('board', x, y)
      grid[x][y] = v
    }

    payload = { 'initialState' => grid }
    requested = Array(params[:spaces]).select { |space| SPACES.key?(space) }
    if requested.any?
      payload['initialSpaces'] = requested.to_h { |space| [space, marks_in_bounds(space)] }
    end

    transmit(payload)
  end

  def move(data)
    key = key_for(data['space']) or return
    x, y = data['x'].to_i, data['y'].to_i
    return unless in_bounds?(data['space'], x, y)

    cell_key = "#{x}-#{y}"
    current = ::REDIS.hget(key, cell_key) || ""
    applied = with_space({ 'id' => data['id'], 'x' => x, 'y' => y, 'value' => data['value'] }, data['space'])

    if data['force']
      Rails.logger.info("[MovesChannel#move FORCED] #{key} #{cell_key}=#{data['value'].inspect} (was #{current.inspect}) id=#{data['id']}")
      ::REDIS.hset(key, cell_key, data['value'])
      ActionCable.server.broadcast(channel_name, applied)
    elsif current == (data['previousValue'] || "")
      ::REDIS.hset(key, cell_key, data['value'])
      ActionCable.server.broadcast(channel_name, applied)
    else
      transmit(with_space({ 'id' => data['id'], 'rejected' => true,
                            'x' => x, 'y' => y, 'value' => current }, data['space']))
    end
  end

  # A drag paints one value across many cells. Cells are applied individually
  # rather than all-or-nothing, so a co-solver touching one cell mid-stroke
  # costs the sender that cell and not the whole line.
  def move_batch(data)
    key = key_for(data['space']) or return
    cells = Array(data['cells'])
    return if cells.length > cols * rows

    applied = []
    rejected = []

    cells.each do |cell|
      x, y = cell['x'].to_i, cell['y'].to_i
      next unless in_bounds?(data['space'], x, y)

      cell_key = "#{x}-#{y}"
      current = ::REDIS.hget(key, cell_key) || ""
      if current == (cell['previousValue'] || "")
        ::REDIS.hset(key, cell_key, data['value'])
        applied << { 'x' => x, 'y' => y }
      else
        rejected << { 'x' => x, 'y' => y, 'value' => current }
      end
    end

    if applied.any?
      ActionCable.server.broadcast(channel_name, with_space(
        { 'id' => data['id'], 'batch' => true, 'value' => data['value'], 'cells' => applied }, data['space']
      ))
    end

    return if rejected.empty?
    transmit(with_space({ 'id' => data['id'], 'rejected' => true, 'batch' => true, 'cells' => rejected }, data['space']))
  end

  def unsubscribed
    # Any cleanup needed when channel is unsubscribed
  end

  private

  def cols
    params[:cols].to_i
  end

  def rows
    params[:rows].to_i
  end

  def channel_name
    key_for('board')
  end

  def cell_of(key)
    x, y = key.split('-')
    return [nil, nil] if x.nil? || y.nil?
    [x.to_i, y.to_i]
  end

  def in_bounds?(space, x, y)
    return false if x.nil? || y.nil?

    lines, clues = case space.presence || 'board'
                   when 'board' then [cols, rows]
                   when 'row_marks' then [rows, cols]
                   when 'col_marks' then [cols, rows]
                   else return false
                   end
    x.in?(0...lines) && y.in?(0...clues)
  end

  def marks_in_bounds(space)
    ::REDIS.hgetall(key_for(space)).select { |key, _| in_bounds?(space, *cell_of(key)) }
  end

  # Nil for an unrecognised space, so a bad payload cannot name arbitrary keys.
  def key_for(space)
    prefix = SPACES[space.presence || 'board'] or return nil
    "#{prefix}-#{params[:crossword]}-#{params[:room]}"
  end

  def with_space(payload, space)
    space.present? ? payload.merge('space' => space) : payload
  end
end
