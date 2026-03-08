

class RoomsController < ApplicationController
  def show
    raise ActionController::RoutingError.new('Source not Found') unless params[:source] == 'guardian'
    raise ActionController::RoutingError.new('Series not Found') unless params[:series].in?(Series::SERIES)
    @crossword = crossword
    @parsed_crossword = JSON.parse(crossword)
    @url = url
  end

  def crossword_identifier
    [params[:source], params[:series], params[:identifier]].join('/')
  end
  helper_method :crossword_identifier

  def crossword
    if redis.exists?(crossword_identifier)
      redis.get(crossword_identifier)
    else
      get_crossword_data.tap {|data| redis.set(crossword_identifier, data) }
    end
  end

  def get_crossword_data
      response = Faraday.get(url)
      html = Nokogiri::HTML(response.body)
      island = html.css('gu-island[name="CrosswordComponent"]')
      raise ActionController::RoutingError.new('Element not Found') unless island.any?
      props = island.first['props']
      raise ActionController::RoutingError.new('Props not Found') unless props
      # props is HTML-entity-encoded JSON — parse the outer wrapper and extract the crossword data
      outer = JSON.parse(CGI.unescapeHTML(props))
      outer['data'].to_json
  end

  def url
    "https://www.theguardian.com/crosswords/#{params[:series]}/#{params[:identifier]}"
  end

  def redis
    @redis ||= Redis.new
  end
end
