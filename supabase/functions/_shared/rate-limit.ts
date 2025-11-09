// Rate limiting utilities for Edge Functions

import { AppError } from './errors.ts'

interface RateLimitStore {
  [key: string]: {
    count: number
    resetAt: number
  }
}

// In-memory store (for single-instance deployments)
// For production with multiple instances, use Redis or similar
const rateLimitStore: RateLimitStore = {}

const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100 // per minute per user

/**
 * Checks if a request should be rate limited
 * Returns true if allowed, throws error if rate limited
 */
export function checkRateLimit(userId: string): void {
  const now = Date.now()
  const key = userId
  const record = rateLimitStore[key]

  if (!record || now > record.resetAt) {
    // Reset or initialize
    rateLimitStore[key] = {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    }
    return
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    throw new AppError(
      `Rate limit exceeded: ${RATE_LIMIT_MAX_REQUESTS} requests per minute`,
      'RATE_LIMIT_EXCEEDED',
      429
    )
  }

  record.count++
}

/**
 * Cleans up expired rate limit records (call periodically)
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now()
  for (const key in rateLimitStore) {
    if (rateLimitStore[key].resetAt < now) {
      delete rateLimitStore[key]
    }
  }
}

