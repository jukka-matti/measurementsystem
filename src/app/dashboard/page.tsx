'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { useToast } from '@/lib/toast'
import { exportCSV } from '@/lib/api/client'
import { WipBoard } from '@/components/WipBoard'
import { MetricTile } from '@/components/MetricTile'
import { CardSkeleton } from '@/components/LoadingSkeleton'
import type { StageKey } from '@/types/database'

interface WipData {
  stage: StageKey
  count: number
  medianCycleTime?: string
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  )
}

function DashboardContent() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [wipData, setWipData] = useState<WipData[]>([])
  const [fpy, setFpy] = useState<number | null>(null)
  const [throughput, setThroughput] = useState<number | null>(null)
  const [onTime, setOnTime] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d'>('today')

  useEffect(() => {
    if (!user) return

    loadMetrics()
    subscribeToEvents()
  }, [user, dateRange])

  const getDateRange = () => {
    const now = new Date()
    const start = new Date()

    switch (dateRange) {
      case 'today':
        start.setHours(0, 0, 0, 0)
        break
      case '7d':
        start.setDate(start.getDate() - 7)
        break
      case '30d':
        start.setDate(start.getDate() - 30)
        break
    }

    return { start: start.toISOString(), end: now.toISOString() }
  }

  const handleExportCSV = async () => {
    if (!user) return

    setExporting(true)
    try {
      const { start, end } = getDateRange()
      const csvData = await exportCSV(start, end)

      // Create blob and download
      const blob = new Blob([csvData], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `events_${dateRange}_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      showToast('CSV exported successfully', 'success')
    } catch (err: any) {
      showToast(`Export failed: ${err.message}`, 'error')
    } finally {
      setExporting(false)
    }
  }

  const loadMetrics = async () => {
    if (!user) return

    setLoading(true)

    try {
      // Get user's org_id
      const { data: orgMember } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      if (!orgMember) return

      const { start, end } = getDateRange()

      // Load WIP data
      const { data: wipResult } = await supabase.rpc('get_wip_by_stage', {
        p_org_id: orgMember.org_id,
      })

      if (wipResult) {
        setWipData(
          wipResult.map((w: any) => ({
            stage: w.stage,
            count: Number(w.wip_count),
          }))
        )
      }

      // Load FPY
      const { data: fpyResult } = await supabase.rpc('get_fpy', {
        p_org_id: orgMember.org_id,
        p_start_date: start,
        p_end_date: end,
      })

      if (fpyResult && fpyResult.length > 0) {
        const avgFpy =
          fpyResult.reduce((sum: number, f: any) => sum + Number(f.fpy_percent), 0) /
          fpyResult.length
        setFpy(avgFpy)
      }

      // Load throughput
      const { data: throughputResult } = await supabase.rpc('get_throughput', {
        p_org_id: orgMember.org_id,
        p_start_date: start,
        p_end_date: end,
      })

      if (throughputResult && throughputResult.length > 0) {
        const totalUnits = throughputResult.reduce(
          (sum: number, t: any) => sum + Number(t.units_completed),
          0
        )
        setThroughput(totalUnits)
      }

      // Load on-time percentage
      const { data: onTimeResult } = await supabase.rpc('get_on_time_percentage', {
        p_org_id: orgMember.org_id,
        p_start_date: start,
        p_end_date: end,
      })

      if (onTimeResult !== null) {
        setOnTime(Number(onTimeResult))
      }
    } catch (err) {
      console.error('Error loading metrics:', err)
      showToast('Failed to load metrics', 'error')
    } finally {
      setLoading(false)
    }
  }

  const subscribeToEvents = () => {
    if (!user) return

    const channel = supabase
      .channel('events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'events',
        },
        () => {
          // Reload metrics when new events arrive
          loadMetrics()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col p-4">
        <div className="mx-auto w-full max-w-6xl">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-3xl font-bold">Dashboard</h1>
          </div>
          <div className="mb-6 grid gap-6 md:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col p-4">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setDateRange('today')}
                className={`rounded-lg px-4 py-2 text-sm ${
                  dateRange === 'today'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setDateRange('7d')}
                className={`rounded-lg px-4 py-2 text-sm ${
                  dateRange === '7d'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                7 Days
              </button>
              <button
                onClick={() => setDateRange('30d')}
                className={`rounded-lg px-4 py-2 text-sm ${
                  dateRange === '30d'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                30 Days
              </button>
            </div>
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-400"
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-6 md:grid-cols-3">
          <MetricTile
            title="First Pass Yield"
            value={fpy !== null ? `${fpy.toFixed(1)}%` : 'N/A'}
            subtitle={`${dateRange} average`}
          />
          <MetricTile
            title="Throughput"
            value={throughput !== null ? throughput.toString() : 'N/A'}
            subtitle={`Units completed (${dateRange})`}
          />
          <MetricTile
            title="On-Time %"
            value={onTime !== null ? `${onTime.toFixed(1)}%` : 'N/A'}
            subtitle={`Orders shipped on time (${dateRange})`}
          />
        </div>

        <WipBoard wipData={wipData} />
      </div>
    </div>
  )
}
