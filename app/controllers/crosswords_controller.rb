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

    first_puzzle = Series::SERIES[series][:first_puzzle]
    latest_puzzle = Series.latest_puzzle(series)&.to_i
    unless latest_puzzle && latest_puzzle >= first_puzzle
      redirect_to root_path(error: 'random_failed')
      return
    end

    # Cryptic publishes Mon-Fri only; Saturday's slot (every 6th number)
    # belongs to the Prize series instead. We retry here in case we hit
    # a non-existent puzzle number
    number = nil
    10.times do
      candidate = rand(first_puzzle..latest_puzzle)
      # Check Redis cache first
      if REDIS.exists?("theguardian/#{series}/#{candidate}")
        number = candidate
        break
      end
      # Fall back to a HEAD request to the Guardian
      uri = URI("https://www.theguardian.com/crosswords/#{series}/#{candidate}")
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 5) do |http|
        http.head(uri.path)
      end
      if response.code == '200'
        number = candidate
        break
      end
    end

    unless number
      redirect_to root_path(error: 'random_failed')
      return
    end

    room = params[:room].presence || SecureRandom.hex(4)
    redirect_to room_path(series: series, identifier: number, room: room)
  end
end
