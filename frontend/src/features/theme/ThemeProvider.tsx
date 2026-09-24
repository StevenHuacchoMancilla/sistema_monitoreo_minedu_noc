import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ThemePreference = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'noc.theme'

type ThemeContextValue = {
  theme: ThemePreference
  resolved: ThemePreference
  setTheme: (theme: ThemePreference) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function readStoredTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === 'light' || raw === 'dark') return raw
    // Migrar preferencia antigua `system` → valor concreto
    if (raw === 'system') {
      const resolved = systemPrefersDark() ? 'dark' : 'light'
      try {
        localStorage.setItem(THEME_STORAGE_KEY, resolved)
      } catch {
        /* ignore */
      }
      return resolved
    }
  } catch {
    /* ignore */
  }
  return systemPrefersDark() ? 'dark' : 'light'
}

export function applyResolvedTheme(resolved: ThemePreference): void {
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredTheme())

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemePreference = prev === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  useEffect(() => {
    applyResolvedTheme(theme)
  }, [theme])

  const value = useMemo(
    () => ({ theme, resolved: theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
