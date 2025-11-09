'use client'

export function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded bg-gray-200"></div>
      <div className="space-y-2">
        <div className="h-16 w-full rounded bg-gray-200"></div>
        <div className="h-16 w-full rounded bg-gray-200"></div>
        <div className="h-16 w-full rounded bg-gray-200"></div>
      </div>
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-6">
      <div className="h-4 w-24 rounded bg-gray-200"></div>
      <div className="mt-2 h-8 w-32 rounded bg-gray-200"></div>
    </div>
  )
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg border border-gray-200 bg-white p-4"
        >
          <div className="h-5 w-32 rounded bg-gray-200"></div>
          <div className="mt-2 h-4 w-48 rounded bg-gray-200"></div>
        </div>
      ))}
    </div>
  )
}

