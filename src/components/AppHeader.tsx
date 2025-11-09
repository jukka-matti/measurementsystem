'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export function AppHeader() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, signOut } = useAuth()

  // Don't show header on login page
  if (pathname === '/login') {
    return null
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <button
          onClick={() => router.push('/units')}
          className="text-xl font-bold text-blue-600"
        >
          Measurement System
        </button>

        <nav className="flex items-center gap-4">
          <button
            onClick={() => router.push('/units')}
            className={`text-sm ${
              pathname === '/units' || pathname.startsWith('/unit/')
                ? 'font-semibold text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Units
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className={`text-sm ${
              pathname === '/dashboard'
                ? 'font-semibold text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => router.push('/admin')}
            className={`text-sm ${
              pathname === '/admin'
                ? 'font-semibold text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Admin
          </button>
          {user && (
            <button
              onClick={signOut}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
            >
              Sign Out
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}

