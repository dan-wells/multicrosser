require 'net/http'

class CrosswordsController < ApplicationController
  def show
    redirect_to room_path(
      series: params[:series],
      identifier: params[:identifier],
      room: SecureRandom.hex(4)
    )
  end

  def random
    series = params[:series]
    unless Series::SERIES.key?(series)
      redirect_to root_path(error: 'random_failed')
      return
    end

    day, status = parse_day_param(series)
    if status == :invalid
      @series = series
      @identifier = nil
      render template: 'rooms/puzzle_not_found', status: :not_found
      return
    end

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
