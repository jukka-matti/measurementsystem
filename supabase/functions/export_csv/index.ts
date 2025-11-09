// Supabase Edge Function: export_csv
// Exports events as CSV for a date range

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { authenticateRequest } from '../_shared/auth.ts'
import { createErrorResponse, createSuccessResponse, AppError, ErrorCodes } from '../_shared/errors.ts'
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { readRequestBody } from '../_shared/validation.ts'
import { logAuditEvent } from '../_shared/audit.ts'

const exportSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Invalid date format. Use YYYY-MM-DD'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Invalid date format. Use YYYY-MM-DD'),
  stage: z.enum(['order_info', 'bead_prep', 'insert_beads', 'pack', 'ship']).optional(),
})

const MAX_DATE_RANGE_DAYS = 365 // Limit to 1 year

serve(async (req) => {
  const origin = req.headers.get('origin')

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight(origin)
  }

  try {
    // Read and validate request body
    const body = await readRequestBody(req)
    const data = exportSchema.parse(body)

    // Validate date range
    const startDate = new Date(data.start_date)
    const endDate = new Date(data.end_date)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new AppError('Invalid date format', ErrorCodes.VALIDATION_ERROR, 400)
    }

    if (startDate > endDate) {
      throw new AppError('start_date must be before end_date', ErrorCodes.VALIDATION_ERROR, 400)
    }

    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    if (daysDiff > MAX_DATE_RANGE_DAYS) {
      throw new AppError(
        `Date range exceeds maximum of ${MAX_DATE_RANGE_DAYS} days`,
        ErrorCodes.VALIDATION_ERROR,
        400
      )
    }

    // Authenticate request
    const authHeader = req.headers.get('Authorization')
    const { userId, orgId, supabaseAdmin } = await authenticateRequest(authHeader)

    // Rate limiting (stricter for exports)
    checkRateLimit(userId)

    // Build query
    let query = supabaseAdmin
      .from('events')
      .select('*')
      .eq('org_id', orgId)
      .gte('ts_server', startDate.toISOString())
      .lte('ts_server', endDate.toISOString())

    if (data.stage) {
      query = query.eq('stage', data.stage)
    }

    const { data: events, error } = await query.order('ts_server', { ascending: true })

    if (error) throw error

    // Convert to CSV with proper escaping
    const headers = [
      'event_id',
      'unit_id',
      'order_id',
      'stage',
      'type',
      'ts_server',
      'workstation_id',
      'qty_good',
      'qty_defect',
      'defect_code',
      'rework',
    ]

    const csvRows = [
      headers.join(','),
      ...(events || []).map((event) =>
        headers.map((header) => {
          const value = event[header] ?? ''
          // Proper CSV escaping: escape quotes and wrap in quotes
          const stringValue = String(value).replace(/"/g, '""')
          return `"${stringValue}"`
        }).join(',')
      ),
    ]

    const csv = csvRows.join('\n')

    // Audit logging
    await logAuditEvent(
      {
        user_id: userId,
        org_id: orgId,
        action: 'csv_exported',
        resource_type: 'export',
        metadata: {
          start_date: data.start_date,
          end_date: data.end_date,
          stage: data.stage,
          event_count: events?.length || 0,
        },
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
        user_agent: req.headers.get('user-agent') || undefined,
      },
      supabaseAdmin
    )

    const response = new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="events_${data.start_date}_${data.end_date}.csv"`,
        ...getCorsHeaders(origin),
      },
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
