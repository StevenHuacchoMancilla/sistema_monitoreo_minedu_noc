import { Moon, Sun } from 'lucide-react'
import { BotonIcono } from '../../components/ui/BotonIcono'
import { useTheme } from './ProveedorTema'

export function AlternarTema() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <BotonIcono
      label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      onClick={toggleTheme}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </BotonIcono>
  )
}
