// Supabase Edge Function: ingest_event
// Handles single event ingestion with validation and idempotency

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { authenticateRequest, validateUnitOwnership, validateOrderOwnership } from '../_shared/auth.ts'
import { createErrorResponse, createSuccessResponse, AppError, ErrorCodes } from '../_shared/errors.ts'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { readRequestBody } from '../_shared/validation.ts'
import { logAuditEvent } from '../_shared/audit.ts'

const eventSchema = z.object({
  unit_id: z.string().uuid(),
  order_id: z.string().uuid(),
  stage: z.enum(['order_info', 'bead_prep', 'insert_beads', 'pack', 'ship']),
  type: z.enum([
    'stage_start',
    'stage_complete',
    'rework_order_info',
    'rework_bead_prep',
    'rework_insert_beads',
    'rework_pack',
    'blocker',
    'shipment_dispatch',
    'annotation',
  ]),
  workstation_id: z.string().uuid().optional(),
  ts_device: z.string().datetime(),
  qty_good: z.number().int().min(0).optional(),
  qty_defect: z.number().int().min(0).optional(),
  defect_code: z.string().optional(),
  rework: z.boolean().optional(),
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
    const data = eventSchema.parse(body)

    // Authenticate request
    const authHeader = req.headers.get('Authorization')
    const { userId, orgId, supabaseAdmin } = await authenticateRequest(authHeader)

    // Rate limiting
    checkRateLimit(userId)

    // CRITICAL SECURITY FIX: Validate unit and order ownership
    const unit = await validateUnitOwnership(supabaseAdmin, data.unit_id, orgId)
    
    // Verify order_id matches the unit's order_id and belongs to org
    if (unit.order_id !== data.order_id) {
      throw new AppError(
        'Order ID does not match the unit\'s order',
        ErrorCodes.VALIDATION_ERROR,
        400
      )
    }
    await validateOrderOwnership(supabaseAdmin, data.order_id, orgId)

    // Generate idempotency key
    const tsSeconds = Math.floor(new Date(data.ts_device).getTime() / 1000)
    const idempotencyKey = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${data.unit_id}-${data.stage}-${data.type}-${tsSeconds}`)
    ).then((hash) =>
      Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    )

    // Check for duplicate
    const { data: existing } = await supabaseAdmin
      .from('events')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .single()

    if (existing) {
      return createSuccessResponse({
        success: true,
        event_id: existing.id,
        duplicate: true,
      })
    }

    // Insert event
    const { data: event, error } = await supabaseAdmin
      .from('events')
      .insert({
        org_id: orgId,
        unit_id: data.unit_id,
        order_id: data.order_id,
        stage: data.stage,
        type: data.type,
        workstation_id: data.workstation_id,
        user_id: userId,
        ts_device: data.ts_device,
        idempotency_key: idempotencyKey,
        qty_good: data.qty_good ?? 0,
        qty_defect: data.qty_defect ?? 0,
        defect_code: data.defect_code,
        rework: data.rework ?? false,
      })
      .select('id')
      .single()

    if (error) throw error

    // Audit logging
    await logAuditEvent(
      {
        user_id: userId,
        org_id: orgId,
        action: 'event_created',
        resource_type: 'event',
        resource_id: event.id,
        metadata: {
          unit_id: data.unit_id,
          stage: data.stage,
          type: data.type,
        },
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
        user_agent: req.headers.get('user-agent') || undefined,
      },
      supabaseAdmin
    )

    const response = createSuccessResponse({
      success: true,
      event_id: event.id,
      duplicate: false,
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
