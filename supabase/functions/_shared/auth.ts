// Shared authentication utilities for Edge Functions

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AppError, ErrorCodes } from './errors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error('Missing required Supabase environment variables')
}

export interface AuthResult {
  userId: string
  orgId: string
  supabaseAdmin: ReturnType<typeof createClient>
  supabaseUser: ReturnType<typeof createClient>
}

/**
 * Authenticates a request and extracts user/org information
 * Uses Supabase's built-in JWT verification via the client
 */
export async function authenticateRequest(
  authHeader: string | null
): Promise<AuthResult> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(
      'Missing or invalid Authorization header',
      ErrorCodes.UNAUTHORIZED,
      401
    )
  }

  // Create admin client for privileged operations
  const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

  // Create user client with auth token for RLS
  const supabaseUser = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: {
      headers: { Authorization: authHeader },
    },
  })

  // Verify token and get user
  const {
    data: { user },
    error: authError,
  } = await supabaseUser.auth.getUser()

  if (authError || !user) {
    throw new AppError(
      'Invalid or expired token',
      ErrorCodes.UNAUTHORIZED,
      401
    )
  }

  // Get user's org_id from org_members table (never trust client)
  const { data: orgMember, error: orgError } = await supabaseAdmin
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (orgError || !orgMember) {
    throw new AppError(
      'User not associated with an organization',
      ErrorCodes.FORBIDDEN,
      403
    )
  }

  return {
    userId: user.id,
    orgId: orgMember.org_id,
    supabaseAdmin,
    supabaseUser,
  }
}

/**
 * Validates that a unit belongs to the user's organization
 */
export async function validateUnitOwnership(
  supabaseAdmin: ReturnType<typeof createClient>,
  unitId: string,
  orgId: string
): Promise<{ order_id: string }> {
  const { data: unit, error } = await supabaseAdmin
    .from('units')
    .select('order_id, org_id')
    .eq('id', unitId)
    .eq('org_id', orgId)
    .single()

  if (error || !unit) {
    throw new AppError(
      'Unit not found or does not belong to your organization',
      ErrorCodes.FORBIDDEN,
      403
    )
  }

  return { order_id: unit.order_id }
}

/**
 * Validates that an order belongs to the user's organization
 */
export async function validateOrderOwnership(
  supabaseAdmin: ReturnType<typeof createClient>,
  orderId: string,
  orgId: string
): Promise<void> {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('org_id')
    .eq('id', orderId)
    .eq('org_id', orgId)
    .single()

  if (error || !order) {
    throw new AppError(
      'Order not found or does not belong to your organization',
      ErrorCodes.FORBIDDEN,
      403
    )
  }
}

