// API client functions for calling Edge Functions

import { supabase } from '@/lib/supabase/client'

async function invokeFunction(functionName: string, body: any) {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  })

  if (error) {
    throw new Error(error.message || `Failed to call ${functionName}`)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}

export async function ingestEvent(data: {
  unit_id: string
  order_id: string
  stage: string
  type: string
  workstation_id?: string
  ts_device: string
  qty_good?: number
  qty_defect?: number
  defect_code?: string
  rework?: boolean
}) {
  return invokeFunction('ingest_event', data)
}

export async function recordBlocker(data: {
  unit_id: string
  stage: string
  blocker_code: string
  blocker_minutes: number
}) {
  return invokeFunction('blocker', data)
}

export async function createNextUnit(batch_id: string) {
  return invokeFunction('create_next_unit', { batch_id })
}

export async function exportCSV(startDate: string, endDate: string, stage?: string) {
  const body: any = {
    start_date: startDate,
    end_date: endDate,
  }
  if (stage) body.stage = stage

  return invokeFunction('export_csv', body)
}

