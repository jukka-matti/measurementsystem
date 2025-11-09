// CORS utilities for Edge Functions

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://localhost:3000',
  // Add production domains here
  // 'https://your-domain.vercel.app',
]

/**
 * Gets CORS headers for a request
 */
export function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  }

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return headers
}

/**
 * Handles OPTIONS preflight request
 */
export function handleCorsPreflight(origin: string | null): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  })
}

