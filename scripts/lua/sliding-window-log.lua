local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local windowStart = now - window

redis.call("ZREMRANGEBYSCORE", key, 0, windowStart)
local count = redis.call("ZCARD", key)

if count < limit then
  redis.call("ZADD", key, now, now .. ":" .. math.random(1000000))
  redis.call("PEXPIRE", key, window)
  return {1, limit - count - 1, window}
else
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  local resetIn = 0
  if #oldest > 0 then
    resetIn = tonumber(oldest[2]) + window - now
  end
  return {0, 0, math.max(0, resetIn)}
end
