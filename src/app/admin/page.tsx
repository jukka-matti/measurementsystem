'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import type { Order, Unit, UnitBatch, Workstation } from '@/types/database'

export default function AdminPage() {
  return (
    <ProtectedRoute>
      <AdminContent />
    </ProtectedRoute>
  )
}

function AdminContent() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<'orders' | 'units' | 'batches' | 'workstations'>(
    'orders'
  )
  const [orders, setOrders] = useState<Order[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [batches, setBatches] = useState<UnitBatch[]>([])
  const [workstations, setWorkstations] = useState<Workstation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    loadData()
  }, [user, activeTab])

  const loadData = async () => {
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

      switch (activeTab) {
        case 'orders':
          const { data: ordersData } = await supabase
            .from('orders')
            .select('*')
            .eq('org_id', orgMember.org_id)
            .order('created_at', { ascending: false })
          setOrders(ordersData || [])
          break

        case 'units':
          const { data: unitsData } = await supabase
            .from('units')
            .select('*, orders(*)')
            .eq('org_id', orgMember.org_id)
            .order('created_at', { ascending: false })
            .limit(100)
          setUnits(unitsData || [])
          break

        case 'batches':
          const { data: batchesData } = await supabase
            .from('unit_batches')
            .select('*, orders(*)')
            .eq('org_id', orgMember.org_id)
            .order('created_at', { ascending: false })
          setBatches(batchesData || [])
          break

        case 'workstations':
          const { data: workstationsData } = await supabase
            .from('workstations')
            .select('*')
            .eq('org_id', orgMember.org_id)
            .order('name')
          setWorkstations(workstationsData || [])
          break
      }
    } catch (err: any) {
      showToast(`Failed to load ${activeTab}: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateOrder = async () => {
    const orderNumber = prompt('Enter order number:')
    if (!orderNumber) return

    try {
      const { data: orgMember } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user!.id)
        .limit(1)
        .single()

      if (!orgMember) return

      const { error } = await supabase.from('orders').insert({
        org_id: orgMember.org_id,
        order_number: orderNumber,
      })

      if (error) throw error

      showToast('Order created successfully', 'success')
      loadData()
    } catch (err: any) {
      showToast(`Failed to create order: ${err.message}`, 'error')
    }
  }

  const handleCreateWorkstation = async () => {
    const name = prompt('Enter workstation name:')
    if (!name) return

    const description = prompt('Enter description (optional):') || undefined

    try {
      const { data: orgMember } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user!.id)
        .limit(1)
        .single()

      if (!orgMember) return

      const { error } = await supabase.from('workstations').insert({
        org_id: orgMember.org_id,
        name,
        description,
      })

      if (error) throw error

      showToast('Workstation created successfully', 'success')
      loadData()
    } catch (err: any) {
      showToast(`Failed to create workstation: ${err.message}`, 'error')
    }
  }

  const handleCreateBatch = async () => {
    const label = prompt('Enter batch label (e.g., "Bracelets 2025-W45"):')
    if (!label) return

    const qtyStr = prompt('Enter quantity:')
    const qty = qtyStr ? parseInt(qtyStr) : 0
    if (!qty || qty <= 0) {
      showToast('Invalid quantity', 'error')
      return
    }

    const orderId = prompt('Enter order ID (optional):') || undefined

    try {
      const { data: orgMember } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user!.id)
        .limit(1)
        .single()

      if (!orgMember) return

      const { error } = await supabase.from('unit_batches').insert({
        org_id: orgMember.org_id,
        order_id: orderId || null,
        label,
        qty,
      })

      if (error) throw error

      showToast('Batch created successfully', 'success')
      loadData()
    } catch (err: any) {
      showToast(`Failed to create batch: ${err.message}`, 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col p-4">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="mb-6 text-3xl font-bold">Admin</h1>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-gray-200">
          {(['orders', 'units', 'batches', 'workstations'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="space-y-6">
          {activeTab === 'orders' && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Orders</h2>
                <button
                  onClick={handleCreateOrder}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Create Order
                </button>
              </div>
              <div className="space-y-2">
                {orders.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
                    No orders found
                  </div>
                ) : (
                  orders.map((order) => (
                    <div
                      key={order.id}
                      className="rounded-lg border border-gray-200 bg-white p-4"
                    >
                      <div className="font-semibold">{order.order_number}</div>
                      <div className="mt-1 text-sm text-gray-600">
                        Created: {new Date(order.created_at).toLocaleDateString()}
                      </div>
                      {order.promised_ship_date && (
                        <div className="mt-1 text-sm text-gray-600">
                          Promised: {new Date(order.promised_ship_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'units' && (
            <div>
              <h2 className="mb-4 text-xl font-semibold">Units</h2>
              <div className="space-y-2">
                {units.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
                    No units found
                  </div>
                ) : (
                  units.map((unit) => (
                    <div
                      key={unit.id}
                      className="rounded-lg border border-gray-200 bg-white p-4"
                    >
                      <div className="font-semibold">{unit.unit_number}</div>
                      <div className="mt-1 text-sm text-gray-600">
                        Created: {new Date(unit.created_at).toLocaleDateString()}
                      </div>
                      {(unit as any).orders && (
                        <div className="mt-1 text-sm text-gray-600">
                          Order: {(unit as any).orders.order_number}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'batches' && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Batches</h2>
                <button
                  onClick={handleCreateBatch}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Create Batch
                </button>
              </div>
              <div className="space-y-2">
                {batches.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
                    No batches found
                  </div>
                ) : (
                  batches.map((batch) => (
                    <div
                      key={batch.id}
                      className="rounded-lg border border-gray-200 bg-white p-4"
                    >
                      <div className="font-semibold">{batch.label}</div>
                      <div className="mt-1 text-sm text-gray-600">
                        Quantity: {batch.qty}
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        Created: {new Date(batch.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'workstations' && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold">Workstations</h2>
                <button
                  onClick={handleCreateWorkstation}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Create Workstation
                </button>
              </div>
              <div className="space-y-2">
                {workstations.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
                    No workstations found
                  </div>
                ) : (
                  workstations.map((ws) => (
                    <div
                      key={ws.id}
                      className="rounded-lg border border-gray-200 bg-white p-4"
                    >
                      <div className="font-semibold">{ws.name}</div>
                      {ws.description && (
                        <div className="mt-1 text-sm text-gray-600">{ws.description}</div>
                      )}
                      <div className="mt-1 text-sm text-gray-600">
                        Created: {new Date(ws.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
