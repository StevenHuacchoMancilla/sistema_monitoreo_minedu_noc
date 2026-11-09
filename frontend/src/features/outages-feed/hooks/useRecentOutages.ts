import { useQuery } from '@tanstack/react-query'
import { fetchRecentOutages } from '../api/outagesFeedApi'

export function useRecentOutages(minutes = 60, refetchInterval = 20_000, enabled = true) {
  return useQuery({
    queryKey: ['notifications', 'outages', minutes],
    queryFn: () => fetchRecentOutages(minutes, 40),
    refetchInterval,
    enabled,
    staleTime: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
}
