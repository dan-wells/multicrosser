Rails.application.routes.draw do
  root 'page#index'

  get 'print/:series/:identifier', to: 'crosswords#print',  as: 'print_crossword'
  get ':series/random(/:room)',    to: 'crosswords#random', as: 'random_crossword'
  get ':series/:identifier/:room', to: 'rooms#show',        as: 'room'
  get ':series/:identifier',       to: 'crosswords#show',   as: 'crossword'
end
