const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const maxRequests = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 60);

const createInMemoryRateLimiter = () => {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.user?._id || req.ip}:${req.baseUrl}${req.path}`;
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set("Retry-After", String(retryAfterSec));
      return res.status(429).json({ message: "Too many requests. Please try again shortly." });
    }

    return next();
  };
};

module.exports = { createInMemoryRateLimiter };
