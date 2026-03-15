Rails.application.routes.draw do
  root 'page#index'

  get ':series/:identifier/:room', to: 'rooms#show', as: 'room'
  get ':series/:identifier',       to: 'crosswords#show', as: 'crossword'
end
