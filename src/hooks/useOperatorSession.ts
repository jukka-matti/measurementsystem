'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth'
import type { OpSession } from '@/types/database'

export function useOperatorSession() {
  const { user } = useAuth()
  const [session, setSession] = useState<OpSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }

    loadSession()
  }, [user])

  const loadSession = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('op_sessions')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found" error, which is OK
        console.error('Error loading session:', error)
      }

      setSession(data || null)
    } catch (err) {
      console.error('Error loading session:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateSession = async (updates: Partial<OpSession>) => {
    if (!user) return

    try {
      // Get org_id from org_members
      const { data: orgMember } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      if (!orgMember) {
        throw new Error('User not associated with an organization')
      }

      const { data, error } = await supabase
        .from('op_sessions')
        .upsert(
          {
            user_id: user.id,
            org_id: orgMember.org_id,
            ...updates,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id',
          }
        )
        .select()
        .single()

      if (error) throw error

      setSession(data)
      return data
    } catch (err) {
      console.error('Error updating session:', err)
      throw err
    }
  }

  return { session, loading, updateSession, refreshSession: loadSession }
}

