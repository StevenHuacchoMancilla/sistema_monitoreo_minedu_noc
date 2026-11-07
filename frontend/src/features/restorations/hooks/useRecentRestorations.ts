import { useQuery } from '@tanstack/react-query'
import { fetchRecentRestorations } from '../api/restorationsApi'

export function useRecentRestorations(minutes = 60, refetchInterval = 20_000, enabled = true) {
  return useQuery({
    queryKey: ['notifications', 'restorations', minutes],
    queryFn: () => fetchRecentRestorations(minutes, 40),
    refetchInterval,
    enabled,
    staleTime: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
}
