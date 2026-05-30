class MovesChannel < ApplicationCable::Channel
  def subscribed
    stream_from(channel_name)

    data = redis.hgetall(channel_name)
    grid = Array.new(20) { Array.new(20) }

    data.each {|k, v|
      x, y = k.split('-')
      next if x.nil? or y.nil?
      next unless x.to_i.in?(0..20) && y.to_i.in?(0..20)
      grid[x.to_i][y.to_i] = v
    }

    transmit({'initialState': grid})
  end

  def move(data)
    cell_key = "#{data['x']}-#{data['y']}"
    current = redis.hget(channel_name, cell_key) || ""

    if data['force']
      Rails.logger.info("[MovesChannel#move FORCED] #{channel_name} #{cell_key}=#{data['value'].inspect} (was #{current.inspect}) id=#{data['id']}")
      redis.hset(channel_name, cell_key, data['value'])
      ActionCable.server.broadcast(channel_name, data)
    elsif current == (data['previousValue'] || "")
      redis.hset(channel_name, cell_key, data['value'])
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

  def redis
    ::REDIS
  end
end
