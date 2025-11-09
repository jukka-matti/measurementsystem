'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { supabase } from '@/lib/supabase/client'
import { useOperatorSession } from '@/hooks/useOperatorSession'
import { useToast } from '@/lib/toast'
import { ingestEvent, recordBlocker } from '@/lib/api/client'
import { StageCard } from '@/components/StageCard'
import { CompleteSheet } from '@/components/CompleteSheet'
import { BlockerButton } from '@/components/BlockerButton'
import { TopBarContext } from '@/components/TopBarContext'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import type { Unit, Order, Event, StageKey, Workstation } from '@/types/database'

const STAGES: StageKey[] = ['order_info', 'bead_prep', 'insert_beads', 'pack', 'ship']
const STAGE_LABELS: Record<StageKey, string> = {
  order_info: 'Order Info',
  bead_prep: 'Bead Prep',
  insert_beads: 'Insert Beads',
  pack: 'Pack',
  ship: 'Ship',
}

export default function UnitDetailPage({ params }: { params: { id: string } }) {
  return (
    <ProtectedRoute>
      <UnitDetailContent unitId={params.id} />
    </ProtectedRoute>
  )
}

function UnitDetailContent({ unitId }: { unitId: string }) {
  const router = useRouter()
  const { session, updateSession } = useOperatorSession()
  const { showToast } = useToast()
  const [unit, setUnit] = useState<Unit | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [workstation, setWorkstation] = useState<Workstation | null>(null)
  const [loading, setLoading] = useState(true)
  const [completeSheetOpen, setCompleteSheetOpen] = useState(false)
  const [completeStage, setCompleteStage] = useState<StageKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadUnitData()
  }, [unitId])

  const loadUnitData = async () => {
    try {
      setError(null)
      
      // Load unit with order
      const { data: unitData, error: unitError } = await supabase
        .from('units')
        .select('*, orders(*)')
        .eq('id', unitId)
        .single()

      if (unitError) {
        // Handle specific error cases
        if (unitError.code === 'PGRST116') {
          // Not found - could be unauthorized or doesn't exist
          setError('Unit not found or you do not have access to it')
          setLoading(false)
          return
        } else if (unitError.code === '42501' || unitError.message?.includes('permission')) {
          // Permission denied - RLS blocked access
          setError('You do not have permission to access this unit')
          setLoading(false)
          return
        }
        throw unitError
      }

      if (!unitData) {
        setError('Unit not found')
        setLoading(false)
        return
      }

      setUnit(unitData as Unit)
      setOrder((unitData as any).orders as Order)

      // Load events for this unit
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('unit_id', unitId)
        .order('ts_server', { ascending: true })

      if (eventsError) {
        // Log but don't fail - events might be empty
        console.warn('Error loading events:', eventsError)
        setEvents([])
      } else {
        setEvents(eventsData || [])
      }

      // Load workstation if session has one
      if (session?.workstation_id) {
        const { data: wsData } = await supabase
          .from('workstations')
          .select('*')
          .eq('id', session.workstation_id)
          .single()

        setWorkstation(wsData)
      }

      // Update session with current unit
      await updateSession({ unit_id: unitId })
    } catch (err: any) {
      // Handle unexpected errors
      const errorMessage = err.message || 'An unexpected error occurred'
      setError(errorMessage)
      console.error('Error loading unit:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStageStatus = (stage: StageKey) => {
    const stageEvents = events.filter((e) => e.stage === stage)
    const hasStart = stageEvents.some((e) => e.type === 'stage_start')
    const hasComplete = stageEvents.some((e) => e.type === 'stage_complete')
    return { isStarted: hasStart, isCompleted: hasComplete }
  }

  const handleStart = async (stage: StageKey) => {
    if (!unit || !order || !session?.workstation_id) return

    try {
      await ingestEvent({
        unit_id: unit.id,
        order_id: order.id,
        stage,
        type: 'stage_start',
        workstation_id: session.workstation_id,
        ts_device: new Date().toISOString(),
      })

      await updateSession({ stage })
      await loadUnitData() // Refresh events
      showToast('Stage started', 'success')
      
      // Haptic feedback (if available)
      if ('vibrate' in navigator) {
        navigator.vibrate(50)
      }
    } catch (err: any) {
      setError(err.message)
      showToast(`Failed to start stage: ${err.message}`, 'error')
      console.error('Error starting stage:', err)
    }
  }

  const handleComplete = (stage: StageKey) => {
    setCompleteStage(stage)
    setCompleteSheetOpen(true)
  }

  const handleCompleteSubmit = async (data: {
    qty_good: number
    qty_defect: number
    defect_code?: string
    rework: boolean
  }) => {
    if (!unit || !order || !completeStage || !session?.workstation_id) return

    try {
      await ingestEvent({
        unit_id: unit.id,
        order_id: order.id,
        stage: completeStage,
        type: 'stage_complete',
        workstation_id: session.workstation_id,
        ts_device: new Date().toISOString(),
        qty_good: data.qty_good,
        qty_defect: data.qty_defect,
        defect_code: data.defect_code,
        rework: data.rework,
      })

      await loadUnitData() // Refresh events
      setCompleteSheetOpen(false)
      setCompleteStage(null)
      showToast('Stage completed', 'success')
      
      // Haptic feedback (if available)
      if ('vibrate' in navigator) {
        navigator.vibrate([50, 30, 50])
      }
    } catch (err: any) {
      setError(err.message)
      showToast(`Failed to complete stage: ${err.message}`, 'error')
      console.error('Error completing stage:', err)
    }
  }

  const handleBlocker = async (data: { blocker_code: string; blocker_minutes: number }) => {
    if (!unit || !session?.stage) return

    try {
      await recordBlocker({
        unit_id: unit.id,
        stage: session.stage,
        blocker_code: data.blocker_code as any,
        blocker_minutes: data.blocker_minutes,
      })

      await loadUnitData() // Refresh events
      showToast('Blocker recorded', 'success')
      
      // Haptic feedback (if available)
      if ('vibrate' in navigator) {
        navigator.vibrate(100)
      }
    } catch (err: any) {
      setError(err.message)
      showToast(`Failed to record blocker: ${err.message}`, 'error')
      console.error('Error recording blocker:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <TopBarContext />
        <div className="flex-1 p-4">
          <div className="mx-auto max-w-4xl">
            <LoadingSkeleton />
          </div>
        </div>
      </div>
    )
  }

  if (error || !unit) {
    return (
      <div className="flex min-h-screen flex-col">
        <TopBarContext />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center">
            <div className="mb-4 text-2xl font-semibold text-red-600">
              {error || 'Unit not found'}
            </div>
            <button
              onClick={() => router.push('/units')}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Back to Units
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBarContext
        workstation={workstation || undefined}
        stage={session?.stage}
        unit={unit}
      />

      <div className="flex-1 p-4">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">{unit.unit_number}</h1>
            {order && (
              <p className="mt-2 text-gray-600">Order: {order.order_number}</p>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}

          <div className="space-y-4">
            {STAGES.map((stage) => {
              const { isStarted, isCompleted } = getStageStatus(stage)
              return (
                <StageCard
                  key={stage}
                  stage={stage}
                  stageLabel={STAGE_LABELS[stage]}
                  isStarted={isStarted}
                  isCompleted={isCompleted}
                  onStart={() => handleStart(stage)}
                  onComplete={() => handleComplete(stage)}
                />
              )
            })}
          </div>

          <div className="mt-6">
            <BlockerButton
              unitId={unit.id}
              stage={session?.stage || 'order_info'}
              onRecord={handleBlocker}
            />
          </div>
        </div>
      </div>

      <CompleteSheet
        isOpen={completeSheetOpen}
        onClose={() => {
          setCompleteSheetOpen(false)
          setCompleteStage(null)
        }}
        onSubmit={handleCompleteSubmit}
      />
    </div>
  )
}
