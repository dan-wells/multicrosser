class PresenceChannel < ApplicationCable::Channel
  PRESENCE_TTL = 86_400

  def subscribed
    stream_from(channel_name)

    @session_id = params[:session_id]

    others = ::REDIS.hgetall(presence_key).reject { |sid, _| sid == @session_id }
    if others.any?
      sessions = others.transform_values { |json| ActiveSupport::JSON.decode(json) }
      transmit({ 'type' => 'presence_snapshot', 'sessions' => sessions })
    end
  end

  def cursor(data)
    return unless @session_id

    payload = {
      'x' => data['x'],
      'y' => data['y'],
      'entry_id' => data['entry_id'],
      'entry_cells' => data['entry_cells'] || []
    }

    ::REDIS.hset(presence_key, @session_id, payload.to_json)
    ::REDIS.expire(presence_key, PRESENCE_TTL)

    ActionCable.server.broadcast(channel_name, payload.merge('type' => 'presence', 'session_id' => @session_id))
  end

  def unsubscribed
    return unless @session_id

    ::REDIS.hdel(presence_key, @session_id)
    ActionCable.server.broadcast(channel_name, { 'type' => 'presence', 'session_id' => @session_id, 'leave' => true })
  end

  private

  def channel_name
    "presence_channel-#{params[:crossword]}-#{params[:room]}"
  end

  def presence_key
    "presence-#{params[:crossword]}-#{params[:room]}"
  end
end
