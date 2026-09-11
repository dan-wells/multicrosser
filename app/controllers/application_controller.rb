class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception

  rescue_from ActionController::RoutingError, with: :puzzle_not_found

  private

  def puzzle_not_found
    if params[:series].in?(Series::SERIES.keys) && params[:identifier].present?
      @puzzle_name = Source.for(params[:series]).puzzle_name(params[:series], params[:identifier])
    end
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
