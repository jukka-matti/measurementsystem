// CORS utilities for Edge Functions

/**
 * Gets allowed origins from environment variable or defaults
 * Format: comma-separated list of origins
 * Example: ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.vercel.app
 */
function getAllowedOrigins(): string[] {
  const envOrigins = Deno.env.get('ALLOWED_ORIGINS')
  if (envOrigins) {
    return envOrigins.split(',').map(origin => origin.trim())
  }
  
  // Default origins for development
  return [
    'http://localhost:3000',
    'https://localhost:3000',
  ]
}

/**
 * Gets CORS headers for a request
 */
export function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  }

  const allowedOrigins = getAllowedOrigins()
  
  if (origin && allowedOrigins.includes(origin)) {
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

