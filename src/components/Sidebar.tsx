import { NavLink } from 'react-router-dom'
import { cn } from '../lib/utils'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard,
  Package,
  Plus,
  ShieldCheck,
  Trash2,
  BookOpen,
  Users,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  Factory,
} from 'lucide-react'

interface SidebarProps {
  open: boolean
  onToggle: () => void
}

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  adminOnly?: boolean
  qualityOnly?: boolean
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/lotes', label: 'Lotes', icon: Package },
  { to: '/lotes/novo', label: 'Novo Lote', icon: Plus },
  { to: '/qualidade', label: 'Qualidade', icon: ShieldCheck, qualityOnly: true },
  { to: '/sucata', label: 'Sucata', icon: Trash2, qualityOnly: true },
  { to: '/materiais', label: 'Materiais', icon: BookOpen },
  { to: '/admin/usuarios', label: 'Usuários', icon: Users, adminOnly: true },
  { to: '/auditoria', label: 'Auditoria', icon: History, adminOnly: true },
  { to: '/configuracoes', label: 'Configurações', icon: Settings, adminOnly: true },
]

export default function Sidebar({ open, onToggle }: SidebarProps) {
  const { isAdmin, isQuality } = useAuth()

  const visibleItems = navItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false
    if (item.qualityOnly && !isQuality) return false
    return true
  })

  return (
    <aside
      className={cn(
        'relative flex flex-col border-r border-border bg-card transition-all duration-300 shrink-0',
        open ? 'w-56' : 'w-14'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-3 p-4 h-14 border-b border-border', !open && 'justify-center')}>
        <Factory className="h-6 w-6 text-primary shrink-0" />
        {open && (
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight text-foreground truncate">Controle de</p>
            <p className="text-xs text-muted-foreground truncate">Retrabalhos</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {visibleItems.map(item => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  !open && 'justify-center'
                )
              }
              title={!open ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {open && <span className="truncate">{item.label}</span>}
            </NavLink>
          )
        })}
      </nav>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-16 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10"
      >
        {open ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
    </aside>
  )
}
