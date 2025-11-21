// Supabase Edge Function: bulk_ingest
// Handles multiple event ingestion (optional)

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

const bulkSchema = z.object({
  events: z.array(eventSchema).max(100), // Limit to 100 events per batch
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
    const data = bulkSchema.parse(body)

    if (data.events.length === 0) {
      throw new AppError('Events array cannot be empty', ErrorCodes.VALIDATION_ERROR, 400)
    }

    // Authenticate request
    const authHeader = req.headers.get('Authorization')
    const { userId, orgId, supabaseAdmin } = await authenticateRequest(authHeader)

    // Rate limiting (stricter for bulk operations)
    checkRateLimit(userId)

    const inserted: string[] = []
    const duplicates: string[] = []
    const errors: Array<{ index: number; error: string }> = []

    // Process each event
    for (let i = 0; i < data.events.length; i++) {
      const event = data.events[i]
      try {
        // Validate unit and order ownership
        const unit = await validateUnitOwnership(supabaseAdmin, event.unit_id, orgId)
        
        if (unit.order_id !== event.order_id) {
          errors.push({
            index: i,
            error: 'Order ID does not match the unit\'s order',
          })
          continue
        }

        await validateOrderOwnership(supabaseAdmin, event.order_id, orgId)

        // Generate idempotency key
        const tsSeconds = Math.floor(new Date(event.ts_device).getTime() / 1000)
        const idempotencyKey = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(`${event.unit_id}-${event.stage}-${event.type}-${tsSeconds}`)
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
          duplicates.push(existing.id)
          continue
        }

        // Insert event
        const { data: insertedEvent, error } = await supabaseAdmin
          .from('events')
          .insert({
            org_id: orgId,
            unit_id: event.unit_id,
            order_id: event.order_id,
            stage: event.stage,
            type: event.type,
            workstation_id: event.workstation_id,
            user_id: userId,
            ts_device: event.ts_device,
            idempotency_key: idempotencyKey,
            qty_good: event.qty_good ?? 0,
            qty_defect: event.qty_defect ?? 0,
            defect_code: event.defect_code,
            rework: event.rework ?? false,
          })
          .select('id')
          .single()

        if (error) {
          errors.push({ index: i, error: error.message })
          continue
        }

        inserted.push(insertedEvent.id)
      } catch (err: any) {
        errors.push({
          index: i,
          error: err.message || 'Unknown error',
        })
      }
    }

    // Audit logging
    await logAuditEvent(
      {
        user_id: userId,
        org_id: orgId,
        action: 'bulk_events_created',
        resource_type: 'bulk_ingest',
        metadata: {
          total_events: data.events.length,
          inserted: inserted.length,
          duplicates: duplicates.length,
          errors: errors.length,
        },
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
        user_agent: req.headers.get('user-agent') || undefined,
      },
      supabaseAdmin
    )

    const response = createSuccessResponse({
      success: true,
      inserted: inserted.length,
      duplicates: duplicates.length,
      errors: errors.length > 0 ? errors : undefined,
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
