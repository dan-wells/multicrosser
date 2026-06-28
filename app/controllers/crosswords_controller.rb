require 'net/http'

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
    @source_type = Series::SERIES[params[:series]][:source]
    render layout: 'print'
  end

  def random
    series = params[:series]
    unless Series::SERIES.key?(series)
      redirect_to root_path(error: 'random_failed')
      return
    end

    day, status = parse_day_param(series)
    raise ActionController::RoutingError.new('Invalid day') if status == :invalid

    identifier = Source.for(series).random_identifier(series, day: day)
    unless identifier
      redirect_to root_path(error: 'random_failed')
      return
    end

    room = params[:room].presence || SecureRandom.hex(4)
    redirect_to room_path(series: series, identifier: identifier, room: room)
  end

  private

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
