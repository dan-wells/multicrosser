class CrosswordsController < ApplicationController
  def show
    redirect_to room_path(
      series: params[:series],
      identifier: params[:identifier],
      room: SecureRandom.hex(4)
    )
  end

  def print
    require_known_series!
    @crossword = fetch_crossword!
    @parsed_crossword = JSON.parse(@crossword)
    @source_type = Source.for(params[:series]).name
    render layout: 'print'
  end

  def random
    identifier = resolve_random_identifier or return
    room = params[:room].presence || SecureRandom.hex(4)
    redirect_to room_path(series: params[:series], identifier: identifier, room: room)
  end

  def latest
    identifier = resolve_latest_identifier do
      redirect_to random_crossword_path(series: params[:series], room: params[:room])
    end or return

    redirect_to room_path(
      series: params[:series],
      identifier: identifier,
      room: params[:room].presence || SecureRandom.hex(4)
    )
  end

  def print_random
    identifier = resolve_random_identifier or return
    redirect_to print_crossword_path(series: params[:series], identifier: identifier)
  end

  def print_latest
    identifier = resolve_latest_identifier do
      redirect_to print_random_path(series: params[:series])
    end or return

    redirect_to print_crossword_path(series: params[:series], identifier: identifier)
  end

  private

  # Returns the identifier of the most recent puzzle in the requested series, or
  # nil after having already issued a redirect (caller should bail with `or
  # return`). A series with a known ID range needs no feed to offer a puzzle and
  # has no most recent one to offer either, so the block is given the chance to
  # send the player to a random puzzle instead.
  def resolve_latest_identifier
    series = params[:series]
    unless Series::SERIES.key?(series)
      redirect_to root_path(error: 'latest_failed')
      return nil
    end

    identifier = Series.latest_puzzle(series)
    return identifier if identifier

    if Source.for(series).has_feed?
      redirect_to root_path(error: 'latest_failed')
    else
      yield
    end
    nil
  end

  # Returns the identifier of a random puzzle in the requested series, or nil
  # after having already issued a redirect (caller should bail with `or return`).
  def resolve_random_identifier
    series = params[:series]
    unless Series::SERIES.key?(series)
      redirect_to root_path(error: 'random_failed')
      return nil
    end
    day, status = parse_day_param(series)
    raise ActionController::RoutingError.new('Invalid day') if status == :invalid
    identifier = Source.for(series).random_identifier(series, day: day)
    unless identifier
      redirect_to root_path(error: 'random_failed')
      return nil
    end
    identifier
  end

  def parse_day_param(series)
    raw = params[:day]
    return [nil, :ok] if raw.blank?
    days = Series::SERIES[series][:days]
    # Series with no day schedule: silently ignore the day param rather than 404
    return [nil, :ok] unless days
    return [nil, :invalid] unless raw.to_s =~ /\A\d\z/
    day = raw.to_i
    return [nil, :invalid] unless days.include?(day)
    [day, :ok]
  end
end
