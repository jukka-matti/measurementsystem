'use client'

import { useRouter } from 'next/navigation'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { useWorkstations } from '@/hooks/useWorkstations'
import { useOperatorSession } from '@/hooks/useOperatorSession'
import { WorkstationPicker } from '@/components/WorkstationPicker'
import type { Workstation } from '@/types/database'

export default function ChooseWorkstationPage() {
  return (
    <ProtectedRoute>
      <ChooseWorkstationContent />
    </ProtectedRoute>
  )
}

function ChooseWorkstationContent() {
  const router = useRouter()
  const { workstations, loading, error } = useWorkstations()
  const { updateSession } = useOperatorSession()

  const handleSelect = async (workstation: Workstation) => {
    try {
      await updateSession({ workstation_id: workstation.id })
      router.push('/units')
    } catch (err) {
      console.error('Error saving workstation:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-600">Loading workstations...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-red-600">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col p-4">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-6 text-3xl font-bold">Choose Workstation</h1>
        <WorkstationPicker
          workstations={workstations}
          onSelect={handleSelect}
        />
      </div>
    </div>
  )
}

