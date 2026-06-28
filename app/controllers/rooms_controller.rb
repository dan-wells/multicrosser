class RoomsController < ApplicationController
  def show
    require_known_series!
    @crossword = fetch_crossword!
    @parsed_crossword = JSON.parse(@crossword)
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
end
