class RoomsController < ApplicationController
  rescue_from ActionController::RoutingError, with: :puzzle_not_found

  def show
    raise ActionController::RoutingError.new('Series not Found') unless params[:series].in?(Series::SERIES.keys)
    @crossword = crossword
    @parsed_crossword = JSON.parse(crossword)
    source = Source.for(params[:series])
    @publisher_url = source.publisher_url(params[:series], params[:identifier])
    @publisher_name = source.publisher_name
    @commentary_url = source.commentary_url(params[:series], params[:identifier])
    @commentary_label = source.commentary_label
    @commentary_is_search = source.commentary_is_search?(params[:series], params[:identifier])
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
