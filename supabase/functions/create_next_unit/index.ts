// Supabase Edge Function: create_next_unit
// Creates the next unit from a batch (optional feature)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

const createUnitSchema = z.object({
  batch_id: z.string().uuid(),
})

serve(async (req) => {
  try {
    const body = await req.json()
    const data = createUnitSchema.parse(body)

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

    // Verify batch belongs to user's org
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('unit_batches')
      .select('org_id')
      .eq('id', data.batch_id)
      .eq('org_id', orgId)
      .single()

    if (batchError || !batch) {
      return new Response(JSON.stringify({ error: 'Batch not found' }), { status: 404 })
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
      return new Response(JSON.stringify({ error: 'Unit not found after creation' }), {
        status: 500,
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        unit_id: unit.id,
        unit_number: unit.unit_number,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

