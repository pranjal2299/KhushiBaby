const { RateLimiterRedis } = require("rate-limiter-flexible");
const Redis = require("ioredis");
const express = require("express");
const { createRateLimiter } = require("./rateLimiter");

const app = express();
const port = 3000;


const redisClient = new Redis({
  host: "127.0.0.1",
  port: 6379,
  enableOfflineQueue: false,
});

const createRateLimiter = (points, duration) => {
  return new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: `rl:${points}:${duration}`,
    points, // number of requests
    duration, // per duration in seconds
    blockDuration: 40, // optional: block client for X seconds after limit is reached
  });
};




const rateLimitMiddleware = (limiter) => {
  return async (req, res, next) => {
    // Emergency bypass
    if (req.headers["x-bypass-rate-limit"] === "true") {
      return next();
    }

    try {
      const ip = req.ip;
      const rateRes = await limiter.consume(ip);

      // Optional: Rate limit headers
      res.set({
        "X-RateLimit-Limit": limiter.points,
        "X-RateLimit-Remaining": rateRes.remainingPoints,
        "X-RateLimit-Reset": new Date(Date.now() + rateRes.msBeforeNext).toISOString(),
      });

      next();
    } catch (rejRes) {
      res.set({
        "Retry-After": Math.ceil(rejRes.msBeforeNext / 1000),
        "X-RateLimit-Limit": limiter.points,
        "X-RateLimit-Remaining": 0,
        "X-RateLimit-Reset": new Date(Date.now() + rejRes.msBeforeNext).toISOString(),
      });

      res.status(429).json({ error: "Too many requests" });
    }
  };
};

app.get("/api/fast", rateLimitMiddleware(createRateLimiter(2000,1)), (req, res) => {
  res.send("Fast endpoint — up to 2000 req/sec");
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
