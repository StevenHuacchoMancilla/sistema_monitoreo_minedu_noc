import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endpoints } from '../../../api/endpoints'
import type { Concentration, ConcentrationZone, DashboardSummary, OutageRow } from '../../../types/api'

const SUMMARY_KEY = ['dashboard', 'summary'] as const

/** Polling solo con pestaña visible; evita tormenta al volver de Cursor. */
const pollOpts = {
  refetchIntervalInBackground: false as const,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: false as const,
}

export function useDashboardSummary(refetchInterval = 90_000) {
  return useQuery<DashboardSummary>({
    queryKey: SUMMARY_KEY,
    queryFn: endpoints.dashboardSummary,
    refetchInterval,
    staleTime: 45_000,
    ...pollOpts,
  })
}

export function useOutages(search = '') {
  return useQuery<{ data: OutageRow[] }>({
    queryKey: ['dashboard', 'outages', search],
    queryFn: () => endpoints.outages(search),
    refetchInterval: 60_000,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    ...pollOpts,
  })
}

export function useConcentrations() {
  return useQuery<{ data: Concentration[] }>({
    queryKey: ['dashboard', 'concentrations'],
    queryFn: endpoints.concentrations,
    refetchInterval: 90_000,
    staleTime: 45_000,
    ...pollOpts,
  })
}

export function useMassOutages() {
  return useQuery<{ data: Concentration[] }>({
    queryKey: ['dashboard', 'mass-outages'],
    queryFn: endpoints.massOutages,
    refetchInterval: 90_000,
    staleTime: 45_000,
    ...pollOpts,
  })
}

export function useConcentrationZone(provincia: string, distrito: string) {
  return useQuery<ConcentrationZone>({
    queryKey: ['dashboard', 'concentrations', 'zone', provincia, distrito],
    queryFn: () => endpoints.concentrationZone(provincia, distrito),
    enabled: provincia !== '' && distrito !== '',
    refetchInterval: 90_000,
    staleTime: 45_000,
    ...pollOpts,
  })
}

export function useMassOutageNodo(nodo: string) {
  return useQuery<ConcentrationZone>({
    queryKey: ['dashboard', 'mass-outages', 'nodo', nodo],
    queryFn: () => endpoints.massOutageNodo(nodo),
    enabled: nodo.trim() !== '',
    refetchInterval: 90_000,
    staleTime: 45_000,
    ...pollOpts,
  })
}

export function useManualSync() {
  const client = useQueryClient()
  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'active' })
  }

  const prtg = useMutation({
    mutationFn: endpoints.syncPrtg,
    onSuccess: invalidate,
  })

  return { prtg }
}
