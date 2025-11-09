// Supabase Edge Function: export_csv
// Exports events as CSV for a date range

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const body = await req.json()
    const startDate = body.start_date
    const endDate = body.end_date
    const stage = body.stage

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: 'start_date and end_date are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    // Create Supabase client with service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Extract user_id from JWT token
    const token = authHeader.replace('Bearer ', '')
    const payload = JSON.parse(
      atob(token.split('.')[1])
    )
    const userId = payload.sub

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 })
    }

    // Get user's org_id from org_members table (never trust client)
    const { data: orgMember, error: orgError } = await supabaseAdmin
      .from('org_members')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .single()

    if (orgError || !orgMember) {
      return new Response(
        JSON.stringify({ error: 'User not associated with an organization' }),
        { status: 403 }
      )
    }

    const orgId = orgMember.org_id

    // Build query
    let query = supabaseAdmin
      .from('events')
      .select('*')
      .eq('org_id', orgId)
      .gte('ts_server', startDate)
      .lte('ts_server', endDate)

    if (stage) {
      query = query.eq('stage', stage)
    }

    const { data: events, error } = await query.order('ts_server', { ascending: true })

    if (error) throw error

    // Convert to CSV
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
          return `"${String(value).replace(/"/g, '""')}"`
        }).join(',')
      ),
    ]

    const csv = csvRows.join('\n')

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="events_${startDate}_${endDate}.csv"`,
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

