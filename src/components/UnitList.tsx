'use client'

import type { Unit } from '@/types/database'

interface UnitListProps {
  units: Unit[]
  currentUnitId?: string
  onSelectUnit: (unit: Unit) => void
  filters?: {
    all?: boolean
    inProgress?: boolean
    mine?: boolean
    waitingAtStage?: string
  }
}

export function UnitList({ units, currentUnitId, onSelectUnit, filters }: UnitListProps) {
  return (
    <div className="space-y-4">
      {/* Current Unit (pinned) */}
      {currentUnitId && (
        <div className="rounded-lg border-2 border-blue-500 bg-blue-50 p-4">
          <div className="text-sm font-semibold text-blue-700">Current Unit</div>
          {units
            .find((u) => u.id === currentUnitId)
            ?.unit_number && (
              <div className="mt-1">{units.find((u) => u.id === currentUnitId)?.unit_number}</div>
            )}
        </div>
      )}

      {/* Unit List */}
      <div className="space-y-2">
        {units.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
            No units found
          </div>
        ) : (
          units.map((unit) => (
            <button
              key={unit.id}
              onClick={() => onSelectUnit(unit)}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${
                currentUnitId === unit.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="font-semibold">{unit.unit_number}</div>
              <div className="mt-1 text-sm text-gray-600">
                Created: {new Date(unit.created_at).toLocaleDateString()}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

