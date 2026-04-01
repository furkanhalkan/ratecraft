local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local count = redis.call("INCR", key)
if count == 1 then
  redis.call("PEXPIRE", key, window)
end

if count <= limit then
  local ttl = redis.call("PTTL", key)
  return {1, limit - count, ttl}
else
  local ttl = redis.call("PTTL", key)
  return {0, 0, ttl}
end
