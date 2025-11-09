// Supabase Edge Function: ingest_event
// Handles single event ingestion with validation and idempotency

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

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
  try {
    const body = await req.json()
    const data = eventSchema.parse(body)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    // Create Supabase client with service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Create client with user's auth token for RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
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
      return new Response(
        JSON.stringify({ success: true, event_id: existing.id, duplicate: true }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Insert event (use admin client to bypass RLS, but org_id is validated)
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

    return new Response(
      JSON.stringify({ success: true, event_id: event.id, duplicate: false }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

