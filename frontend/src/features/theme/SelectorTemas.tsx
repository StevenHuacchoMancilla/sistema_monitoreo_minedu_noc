import { Check } from 'lucide-react'
import { THEMES } from './temas'
import { useTheme } from './ProveedorTema'

export function SelectorTemas() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="px-2 py-2">
      <p className="px-1 pb-1.5 text-[10px] font-medium tracking-[0.14em] text-noc-faint uppercase">Temas</p>
      <div className="grid gap-0.5">
        {THEMES.map((item) => {
          const active = item.id === theme
          return (
            <button
              key={item.id}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              onClick={() => setTheme(item.id)}
              className={`flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition ${
                active ? 'bg-noc-interactive text-noc-text' : 'text-noc-muted hover:bg-noc-raised hover:text-noc-text'
              }`}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-[4px] border border-white/20"
                style={{ background: `linear-gradient(135deg, ${item.paper} 50%, ${item.swatch} 50%)` }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-tight font-medium">{item.label}</span>
                <span className="block text-[10px] text-noc-faint">{item.hint}</span>
              </span>
              {active ? <Check className="h-3.5 w-3.5 shrink-0 text-noc-copper" aria-hidden /> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
