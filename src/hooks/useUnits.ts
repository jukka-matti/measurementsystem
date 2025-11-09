'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth'
import type { Unit } from '@/types/database'

interface UseUnitsOptions {
  filter?: 'all' | 'in_progress' | 'mine' | 'waiting'
  stage?: string
  searchQuery?: string
}

export function useUnits(options: UseUnitsOptions = {}) {
  const { user } = useAuth()
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    loadUnits()
  }, [user, options.filter, options.stage, options.searchQuery])

  const loadUnits = async () => {
    if (!user) return

    setLoading(true)
    setError(null)

    try {
      // Get user's org_id
      const { data: orgMember } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      if (!orgMember) {
        throw new Error('User not associated with an organization')
      }

      let query = supabase
        .from('units')
        .select('*, orders(*)')
        .eq('org_id', orgMember.org_id)
        .order('created_at', { ascending: false })
        .limit(100)

      // Apply filters
      if (options.filter === 'in_progress') {
        // Get units that have stage_start but not stage_complete
        const { data: startedUnits } = await supabase
          .from('events')
          .select('unit_id')
          .eq('org_id', orgMember.org_id)
          .eq('type', 'stage_start')

        const { data: completedUnits } = await supabase
          .from('events')
          .select('unit_id, stage')
          .eq('org_id', orgMember.org_id)
          .eq('type', 'stage_complete')

        const completedSet = new Set(
          completedUnits?.map((e) => `${e.unit_id}-${e.stage}`) || []
        )
        const inProgressIds = startedUnits
          ?.filter((e) => !completedSet.has(`${e.unit_id}-${e.stage}`))
          .map((e) => e.unit_id) || []

        if (inProgressIds.length > 0) {
          query = query.in('id', inProgressIds)
        } else {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000') // No results
        }
      }

      if (options.searchQuery) {
        query = query.ilike('unit_number', `%${options.searchQuery}%`)
      }

      const { data, error: queryError } = await query

      if (queryError) throw queryError

      setUnits(data || [])
    } catch (err: any) {
      setError(err.message)
      console.error('Error loading units:', err)
    } finally {
      setLoading(false)
    }
  }

  return { units, loading, error, refresh: loadUnits }
}

