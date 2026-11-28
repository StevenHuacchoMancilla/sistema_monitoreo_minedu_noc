export const THEME_STORAGE_KEY = 'noc.theme'

export const THEMES = [
  {
    id: 'medianoche',
    label: 'Medianoche',
    hint: 'El tema del sistema',
    dark: true,
    swatch: '#2997FF',
    paper: '#0E1729',
  },
  {
    id: 'claro',
    label: 'Claro',
    hint: 'Superficie de día',
    dark: false,
    swatch: '#1576E0',
    paper: '#F7F9FC',
  },
  {
    id: 'oceano',
    label: 'Océano',
    hint: 'Azul más profundo',
    dark: true,
    swatch: '#38BDF8',
    paper: '#071018',
  },
  {
    id: 'grafito',
    label: 'Grafito',
    hint: 'Carbón neutro',
    dark: true,
    swatch: '#9BB6D6',
    paper: '#16181C',
  },
  {
    id: 'pino',
    label: 'Pino',
    hint: 'Noche verde',
    dark: true,
    swatch: '#3DDC97',
    paper: '#101612',
  },
  {
    id: 'contraste',
    label: 'Contraste',
    hint: 'Máxima lectura',
    dark: true,
    swatch: '#4DA3FF',
    paper: '#000000',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export function themeById(id: string | null | undefined) {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]
}

export function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === 'dark' || raw === 'system') return 'medianoche'
    if (raw === 'light') return 'claro'
    if (THEMES.some((theme) => theme.id === raw)) return raw as ThemeId
  } catch {
    /* ignore */
  }
  return 'medianoche'
}

export function applyTheme(id: ThemeId): void {
  const theme = themeById(id)
  const root = document.documentElement
  root.dataset.theme = theme.id
  root.classList.toggle('dark', theme.dark)
  root.style.colorScheme = theme.dark ? 'dark' : 'light'
}
