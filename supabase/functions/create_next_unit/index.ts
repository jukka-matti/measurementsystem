// Supabase Edge Function: create_next_unit
// Creates the next unit from a batch (optional feature)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { authenticateRequest } from '../_shared/auth.ts'
import { createErrorResponse, createSuccessResponse, AppError, ErrorCodes } from '../_shared/errors.ts'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { readRequestBody } from '../_shared/validation.ts'
import { logAuditEvent } from '../_shared/audit.ts'

const createUnitSchema = z.object({
  batch_id: z.string().uuid(),
})

serve(async (req) => {
  const origin = req.headers.get('origin')

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight(origin)
  }

  try {
    // Read and validate request body
    const body = await readRequestBody(req)
    const data = createUnitSchema.parse(body)

    // Authenticate request
    const authHeader = req.headers.get('Authorization')
    const { userId, orgId, supabaseAdmin } = await authenticateRequest(authHeader)

    // Rate limiting
    checkRateLimit(userId)

    // Verify batch belongs to user's org
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('unit_batches')
      .select('org_id')
      .eq('id', data.batch_id)
      .eq('org_id', orgId)
      .single()

    if (batchError || !batch) {
      throw new AppError('Batch not found or does not belong to your organization', ErrorCodes.NOT_FOUND, 404)
    }

    // Call the database function
    const { data: unitId, error } = await supabaseAdmin.rpc('create_next_unit', {
      p_batch_id: data.batch_id,
    })

    if (error) throw error

    // Get the created unit
    const { data: unit } = await supabaseAdmin
      .from('units')
      .select('id, unit_number')
      .eq('id', unitId)
      .single()

    if (!unit) {
      throw new AppError('Unit not found after creation', ErrorCodes.INTERNAL_ERROR, 500)
    }

    // Audit logging
    await logAuditEvent(
      {
        user_id: userId,
        org_id: orgId,
        action: 'unit_created',
        resource_type: 'unit',
        resource_id: unit.id,
        metadata: {
          batch_id: data.batch_id,
          unit_number: unit.unit_number,
        },
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
        user_agent: req.headers.get('user-agent') || undefined,
      },
      supabaseAdmin
    )

    const response = createSuccessResponse({
      success: true,
      unit_id: unit.id,
      unit_number: unit.unit_number,
    })

    // Add CORS headers
    Object.entries(getCorsHeaders(origin)).forEach(([key, value]) => {
      response.headers.set(key, value)
    })

    return response
  } catch (error) {
    const response = createErrorResponse(error)
    
    // Add CORS headers even for errors
    Object.entries(getCorsHeaders(origin)).forEach(([key, value]) => {
      response.headers.set(key, value)
    })

    return response
  }
})
