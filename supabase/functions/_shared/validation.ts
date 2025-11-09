// Request validation utilities

const MAX_REQUEST_SIZE = 1024 * 1024 // 1MB

/**
 * Validates request size
 */
export async function validateRequestSize(
  request: Request
): Promise<void> {
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const size = parseInt(contentLength, 10)
    if (size > MAX_REQUEST_SIZE) {
      throw new Error(`Request too large: ${size} bytes (max: ${MAX_REQUEST_SIZE})`)
    }
  }
}

/**
 * Safely reads request body with size validation
 */
export async function readRequestBody<T>(
  request: Request
): Promise<T> {
  await validateRequestSize(request)
  
  const text = await request.text()
  if (text.length > MAX_REQUEST_SIZE) {
    throw new Error(`Request body too large: ${text.length} bytes (max: ${MAX_REQUEST_SIZE})`)
  }

  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new Error('Invalid JSON in request body')
  }
}

