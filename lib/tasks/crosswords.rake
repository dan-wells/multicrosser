namespace :crosswords do
  desc 'Fetch and cache crosswords and Fifteensquared posts from RSS'
  task load_from_feed: :environment do
    CrosswordFeed.load
    FifteensquaredFeed.load
  end
end
