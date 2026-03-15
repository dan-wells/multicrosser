REDIS = Redis.new(
  url: ENV.fetch("REDIS_URL", "redis://localhost:6379"),
  db:  Rails.env.test? ? 1 : 0
)
