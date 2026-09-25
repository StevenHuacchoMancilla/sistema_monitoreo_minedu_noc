import { useQuery } from '@tanstack/react-query'
import { fetchOperationalAlerts } from '../api/notificationsApi'

export function useOperationalAlerts(refetchInterval = 60_000) {
  return useQuery({
    queryKey: ['notifications', 'operational'],
    queryFn: () => fetchOperationalAlerts(25),
    refetchInterval,
  })
}
