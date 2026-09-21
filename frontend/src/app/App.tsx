import { AppProviders } from './providers'
import { AppRouter } from './router'
import { LiveSyncBootstrap } from '../features/dashboard/components/LiveSyncBootstrap'

export default function App() {
  return (
    <AppProviders>
      <LiveSyncBootstrap />
      <AppRouter />
    </AppProviders>
  )
}
