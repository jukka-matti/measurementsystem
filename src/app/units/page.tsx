'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { useUnits } from '@/hooks/useUnits'
import { useOperatorSession } from '@/hooks/useOperatorSession'
import { UnitList } from '@/components/UnitList'
import { ListSkeleton } from '@/components/LoadingSkeleton'
import type { Unit } from '@/types/database'

export default function UnitsPage() {
  return (
    <ProtectedRoute>
      <UnitsContent />
    </ProtectedRoute>
  )
}

function UnitsContent() {
  const router = useRouter()
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'mine'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const { units, loading } = useUnits({ filter, searchQuery })
  const { session } = useOperatorSession()

  const handleSelectUnit = (unit: Unit) => {
    router.push(`/unit/${unit.id}`)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col p-4">
        <div className="mx-auto w-full max-w-4xl">
          <h1 className="mb-6 text-3xl font-bold">Units</h1>
          <ListSkeleton count={5} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col p-4">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="mb-6 text-3xl font-bold">Units</h1>
        
        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search units..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2"
          />
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-full px-4 py-1 text-sm ${
              filter === 'all'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('in_progress')}
            className={`rounded-full px-4 py-1 text-sm ${
              filter === 'in_progress'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            In Progress
          </button>
          <button
            onClick={() => setFilter('mine')}
            className={`rounded-full px-4 py-1 text-sm ${
              filter === 'mine'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            Mine
          </button>
        </div>

        <UnitList
          units={units}
          currentUnitId={session?.unit_id}
          onSelectUnit={handleSelectUnit}
          filters={{ all: filter === 'all', inProgress: filter === 'in_progress', mine: filter === 'mine' }}
        />
      </div>
    </div>
  )
}

