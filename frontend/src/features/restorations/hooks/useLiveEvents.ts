import { useQuery } from '@tanstack/react-query'
import { fetchLiveEvents } from '../api/restorationsApi'

export function useLiveEvents(minutes = 60, refetchInterval = 20_000, enabled = true) {
  return useQuery({
    queryKey: ['notifications', 'live', minutes],
    queryFn: () => fetchLiveEvents(minutes, 40),
    refetchInterval,
    enabled,
    staleTime: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
}
