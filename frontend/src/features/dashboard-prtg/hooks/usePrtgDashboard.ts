import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endpoints } from '../../../api/endpoints'
import type { PrtgDashboard } from '../types/prtgDashboard'

const KEY = ['dashboard', 'prtg'] as const

export function usePrtgDashboard(refetchInterval = 90_000) {
  return useQuery<PrtgDashboard>({
    queryKey: KEY,
    queryFn: endpoints.dashboardPrtg,
    refetchInterval,
    staleTime: 45_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  })
}

export function useForcePrtgSync() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: endpoints.syncPrtg,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['dashboard'], refetchType: 'active' })
    },
  })
}
