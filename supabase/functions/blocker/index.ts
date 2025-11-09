// Supabase Edge Function: blocker
// Records a blocker event

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { authenticateRequest, validateUnitOwnership } from '../_shared/auth.ts'
import { createErrorResponse, createSuccessResponse, AppError, ErrorCodes } from '../_shared/errors.ts'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { readRequestBody } from '../_shared/validation.ts'
import { logAuditEvent } from '../_shared/audit.ts'

const blockerSchema = z.object({
  unit_id: z.string().uuid(),
  stage: z.enum(['order_info', 'bead_prep', 'insert_beads', 'pack', 'ship']),
  blocker_code: z.enum([
    'MATERIAL_SHORTAGE',
    'EQUIPMENT_FAILURE',
    'QUALITY_ISSUE',
    'WAITING_FOR_PREVIOUS_STAGE',
    'OTHER',
  ]),
  blocker_minutes: z.number().int().min(0),
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
    const data = blockerSchema.parse(body)

    // Authenticate request
    const authHeader = req.headers.get('Authorization')
    const { userId, orgId, supabaseAdmin } = await authenticateRequest(authHeader)

    // Rate limiting
    checkRateLimit(userId)

    // Validate unit ownership (already validates org_id)
    const unit = await validateUnitOwnership(supabaseAdmin, data.unit_id, orgId)

    // Insert blocker event
    const { data: event, error } = await supabaseAdmin
      .from('events')
      .insert({
        org_id: orgId,
        unit_id: data.unit_id,
        order_id: unit.order_id,
        stage: data.stage,
        type: 'blocker',
        user_id: userId,
        blocker_code: data.blocker_code,
        blocker_minutes: data.blocker_minutes,
        ts_device: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) throw error

    // Audit logging
    await logAuditEvent(
      {
        user_id: userId,
        org_id: orgId,
        action: 'blocker_recorded',
        resource_type: 'event',
        resource_id: event.id,
        metadata: {
          unit_id: data.unit_id,
          stage: data.stage,
          blocker_code: data.blocker_code,
          blocker_minutes: data.blocker_minutes,
        },
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
        user_agent: req.headers.get('user-agent') || undefined,
      },
      supabaseAdmin
    )

    const response = createSuccessResponse({
      success: true,
      event_id: event.id,
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
