import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endpoints } from '../../../api/endpoints'
import type { Concentration, DashboardSummary, OutageRow } from '../../../types/api'

const SUMMARY_KEY = ['dashboard', 'summary'] as const

export function useDashboardSummary(refetchInterval = 30_000) {
  return useQuery<DashboardSummary>({
    queryKey: SUMMARY_KEY,
    queryFn: endpoints.dashboardSummary,
    refetchInterval,
  })
}

export function useOutages(search = '') {
  return useQuery<{ data: OutageRow[] }>({
    queryKey: ['dashboard', 'outages', search],
    queryFn: () => endpoints.outages(search),
    refetchInterval: 15_000,
  })
}

export function useConcentrations() {
  return useQuery<{ data: Concentration[] }>({
    queryKey: ['dashboard', 'concentrations'],
    queryFn: endpoints.concentrations,
    refetchInterval: 30_000,
  })
}

export function useManualSync() {
  const client = useQueryClient()
  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const prtg = useMutation({
    mutationFn: endpoints.syncPrtg,
    onSuccess: invalidate,
  })
  const cloudnet = useMutation({
    mutationFn: endpoints.syncCloudnet,
    onSuccess: invalidate,
  })

  return { prtg, cloudnet }
}
