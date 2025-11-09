'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth'
import type { Workstation } from '@/types/database'

export function useWorkstations() {
  const { user } = useAuth()
  const [workstations, setWorkstations] = useState<Workstation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    loadWorkstations()
  }, [user])

  const loadWorkstations = async () => {
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

      const { data, error: queryError } = await supabase
        .from('workstations')
        .select('*')
        .eq('org_id', orgMember.org_id)
        .order('name')

      if (queryError) throw queryError

      setWorkstations(data || [])
    } catch (err: any) {
      setError(err.message)
      console.error('Error loading workstations:', err)
    } finally {
      setLoading(false)
    }
  }

  return { workstations, loading, error, refresh: loadWorkstations }
}

