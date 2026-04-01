local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local window = tonumber(ARGV[4])

local data = redis.call("GET", key)
local tokens, lastRefill

if data then
  local parts = cjson.decode(data)
  tokens = tonumber(parts[1])
  lastRefill = tonumber(parts[2])
else
  tokens = capacity
  lastRefill = now
end

local elapsed = math.max(0, now - lastRefill)
tokens = math.min(capacity, tokens + (elapsed * refillRate / 1000))

if tokens >= 1 then
  tokens = tokens - 1
  redis.call("SET", key, cjson.encode({tokens, now}), "PX", window)
  return {1, math.floor(tokens), window}
else
  local retryMs = math.ceil((1 - tokens) * 1000 / refillRate)
  return {0, 0, retryMs}
end
