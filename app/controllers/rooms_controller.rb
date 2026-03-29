class RoomsController < ApplicationController
  rescue_from ActionController::RoutingError, with: :puzzle_not_found

  def show
    raise ActionController::RoutingError.new('Series not Found') unless params[:series].in?(Series::SERIES.keys)
    @crossword = crossword
    @parsed_crossword = JSON.parse(crossword)
    @url = "https://www.theguardian.com/crosswords/#{params[:series]}/#{params[:identifier]}"
    @fifteensquared_url = REDIS.get("fifteensquared-#{crossword_identifier}") ||
      "https://www.fifteensquared.net/?s=#{CGI.escape("guardian #{params[:series]} #{params[:identifier]}")}"
  end

  def crossword_identifier
    [params[:series], params[:identifier]].join('/')
  end
  helper_method :crossword_identifier

  def crossword
    CrosswordFetcher.fetch(params[:series], params[:identifier]) ||
      raise(ActionController::RoutingError.new('Crossword not Found'))
  end

  def puzzle_not_found
    @series = params[:series]
    @identifier = params[:identifier]
    render 'puzzle_not_found', status: :not_found
  end
end
