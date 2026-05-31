class MovesChannel < ApplicationCable::Channel
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

    transmit({'initialState': grid})
  end

  def move(data)
    cell_key = "#{data['x']}-#{data['y']}"
    current = ::REDIS.hget(channel_name, cell_key) || ""

    if data['force']
      Rails.logger.info("[MovesChannel#move FORCED] #{channel_name} #{cell_key}=#{data['value'].inspect} (was #{current.inspect}) id=#{data['id']}")
      ::REDIS.hset(channel_name, cell_key, data['value'])
      ActionCable.server.broadcast(channel_name, data)
    elsif current == (data['previousValue'] || "")
      ::REDIS.hset(channel_name, cell_key, data['value'])
      ActionCable.server.broadcast(channel_name, data)
    else
      transmit({ 'id' => data['id'], 'rejected' => true,
                 'x' => data['x'], 'y' => data['y'], 'value' => current })
    end
  end


  def unsubscribed
    # Any cleanup needed when channel is unsubscribed
  end

  private

  def channel_name
    "moves_channel-#{params[:crossword]}-#{params[:room]}"
  end
end
