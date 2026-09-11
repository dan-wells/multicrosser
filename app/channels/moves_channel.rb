class MovesChannel < ApplicationCable::Channel
  SPACES = {
    'board' => 'moves_channel',
    'row_marks' => 'row_marks',
    'col_marks' => 'col_marks',
  }.freeze

  def subscribed
    stream_from(channel_name)

    cols = params[:cols].to_i
    rows = params[:rows].to_i
    data = ::REDIS.hgetall(channel_name)
    grid = Array.new(cols) { Array.new(rows) }

    data.each {|k, v|
      x, y = k.split('-')
      next if x.nil? or y.nil?
      next unless x.to_i.in?(0...cols) && y.to_i.in?(0...rows)
      grid[x.to_i][y.to_i] = v
    }

    payload = { 'initialState' => grid }
    requested = Array(params[:spaces]).select { |space| SPACES.key?(space) }
    if requested.any?
      payload['initialSpaces'] = requested.to_h { |space| [space, ::REDIS.hgetall(key_for(space))] }
    end

    transmit(payload)
  end

  def move(data)
    key = key_for(data['space']) or return
    cell_key = "#{data['x']}-#{data['y']}"
    current = ::REDIS.hget(key, cell_key) || ""

    if data['force']
      Rails.logger.info("[MovesChannel#move FORCED] #{key} #{cell_key}=#{data['value'].inspect} (was #{current.inspect}) id=#{data['id']}")
      ::REDIS.hset(key, cell_key, data['value'])
      ActionCable.server.broadcast(channel_name, data)
    elsif current == (data['previousValue'] || "")
      ::REDIS.hset(key, cell_key, data['value'])
      ActionCable.server.broadcast(channel_name, data)
    else
      transmit(with_space({ 'id' => data['id'], 'rejected' => true,
                            'x' => data['x'], 'y' => data['y'], 'value' => current }, data['space']))
    end
  end

  # A drag paints one value across many cells. Cells are applied individually
  # rather than all-or-nothing, so a co-solver touching one cell mid-stroke
  # costs the sender that cell and not the whole line.
  def move_batch(data)
    key = key_for(data['space']) or return
    applied = []
    rejected = []

    Array(data['cells']).each do |cell|
      cell_key = "#{cell['x']}-#{cell['y']}"
      current = ::REDIS.hget(key, cell_key) || ""
      if current == (cell['previousValue'] || "")
        ::REDIS.hset(key, cell_key, data['value'])
        applied << { 'x' => cell['x'], 'y' => cell['y'] }
      else
        rejected << { 'x' => cell['x'], 'y' => cell['y'], 'value' => current }
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

  def channel_name
    key_for('board')
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
