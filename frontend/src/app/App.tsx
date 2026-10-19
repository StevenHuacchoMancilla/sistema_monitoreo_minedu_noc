import { AppProviders } from './providers'
import { AppRouter } from './router'

/**
 * Sync PRTG solo manual (botón PRTG). El live-sync automático congelaba
 * el navegador al volver de otra app (Chrome: «La página no responde»).
 */
export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}
