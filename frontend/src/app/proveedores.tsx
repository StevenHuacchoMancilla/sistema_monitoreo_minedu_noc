import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AuthProvider } from '../features/auth/context/ContextoAuth'
import { ProveedorTema } from '../features/theme/ProveedorTema'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 45_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchIntervalInBackground: false,
      retry: 1,
    },
  },
})

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ProveedorTema>
        <AuthProvider>{children}</AuthProvider>
      </ProveedorTema>
    </QueryClientProvider>
  )
}
