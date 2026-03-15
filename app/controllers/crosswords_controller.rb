class CrosswordsController < ApplicationController
  def show
    redirect_to room_path(
      series: params[:series],
      identifier: params[:identifier],
      room: SecureRandom.hex(4)
    )
  end
end
