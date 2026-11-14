import { useQuery } from '@tanstack/react-query'
import { fetchOperationalAlerts } from '../api/apiNotificaciones'

export function useAlertasOperativas(refetchInterval = 90_000, enabled = true) {
  return useQuery({
    queryKey: ['notifications', 'operational'],
    queryFn: () => fetchOperationalAlerts(25),
    refetchInterval,
    enabled,
    staleTime: 45_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  })
}
