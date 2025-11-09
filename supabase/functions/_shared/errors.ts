// Shared error handling utilities for Edge Functions

export interface ErrorResponse {
  error: string
  code?: string
  status: number
}

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 400
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
  error: unknown,
  defaultMessage = 'An error occurred'
): Response {
  let errorResponse: ErrorResponse

  if (error instanceof AppError) {
    errorResponse = {
      error: error.message,
      code: error.code,
      status: error.status,
    }
  } else if (error instanceof Error) {
    // Don't expose internal error details in production
    const message =
      Deno.env.get('ENVIRONMENT') === 'development'
        ? error.message
        : defaultMessage

    errorResponse = {
      error: message,
      code: ErrorCodes.INTERNAL_ERROR,
      status: 500,
    }
  } else {
    errorResponse = {
      error: defaultMessage,
      code: ErrorCodes.INTERNAL_ERROR,
      status: 500,
    }
  }

  return new Response(JSON.stringify(errorResponse), {
    status: errorResponse.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Creates a success response
 */
export function createSuccessResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

