local currentKey = KEYS[1]
local previousKey = KEYS[2]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local currentWindowStart = tonumber(ARGV[4])

local prevCount = tonumber(redis.call("GET", previousKey) or "0")
local currCount = tonumber(redis.call("GET", currentKey) or "0")

local elapsed = now - currentWindowStart
local weight = (window - elapsed) / window
local estimated = (prevCount * weight) + currCount

if estimated < limit then
  local newCount = redis.call("INCR", currentKey)
  if newCount == 1 then
    redis.call("PEXPIRE", currentKey, window * 2)
  end
  local remaining = math.max(0, math.floor(limit - (prevCount * weight) - newCount))
  return {1, remaining, window - elapsed}
else
  return {0, 0, window - elapsed}
end
