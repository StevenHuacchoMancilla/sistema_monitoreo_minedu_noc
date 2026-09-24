import { Moon, Sun } from 'lucide-react'
import { IconButton } from '../../components/ui/IconButton'
import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <IconButton
      label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      onClick={toggleTheme}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </IconButton>
  )
}
