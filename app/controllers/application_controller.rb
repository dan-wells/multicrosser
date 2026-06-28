class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception

  rescue_from ActionController::RoutingError, with: :puzzle_not_found

  private

  def puzzle_not_found
    @series = params[:series]
    @identifier = params[:identifier]
    render 'rooms/puzzle_not_found', status: :not_found
  end

  def require_known_series!
    return if params[:series].in?(Series::SERIES.keys)
    raise ActionController::RoutingError.new('Series not Found')
  end

  def fetch_crossword!
    CrosswordFetcher.fetch(params[:series], params[:identifier]) ||
      raise(ActionController::RoutingError.new('Crossword not Found'))
  end
end
