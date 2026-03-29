Rails.application.routes.draw do
  root 'page#index'

  get ':series/random(/:room)', to: 'crosswords#random', as: 'random_crossword'
  get ':series/:identifier/:room', to: 'rooms#show', as: 'room'
  get ':series/:identifier',       to: 'crosswords#show', as: 'crossword'
end
