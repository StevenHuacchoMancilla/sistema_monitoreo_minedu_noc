import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endpoints } from '../../../api/endpoints'
import type { CloudnetDashboard } from '../types/cloudnetDashboard'

const KEY = ['dashboard', 'cloudnet'] as const

export function useCloudnetDashboard(refetchInterval = 60_000) {
  return useQuery<CloudnetDashboard>({
    queryKey: KEY,
    queryFn: endpoints.dashboardCloudnet,
    refetchInterval,
  })
}

export function useForceCloudnetSync() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: endpoints.syncCloudnet,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
