import { NavLink } from 'react-router-dom'
import { cn } from '../lib/utils'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard,
  Package,
  ShieldCheck,
  Trash2,
  FlaskConical,
  BookOpen,
  GraduationCap,
  Users,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
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
  { to: '/qualidade', label: 'Qualidade', icon: ShieldCheck, qualityOnly: true },
  { to: '/sucata', label: 'Sucata', icon: Trash2, qualityOnly: true },
  { to: '/decapagem', label: 'Decapagem', icon: FlaskConical, qualityOnly: true },
  { to: '/materiais', label: 'Materiais', icon: BookOpen },
  { to: '/manual', label: 'Manual', icon: GraduationCap },
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
        'relative flex flex-col shrink-0 transition-all duration-300 bg-white border-r border-border',
        open ? 'w-56' : 'w-[60px]'
      )}
    >
      {/* Logo */}
      <div
        className={cn('flex items-center h-14 px-3 gap-3 caloi-header', !open && 'justify-center')}
      >
        <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.20)' }}>
          <span className="font-black text-white text-xs">C</span>
        </div>
        {open && (
          <div className="min-w-0 overflow-hidden">
            <p className="text-xs font-black text-white tracking-[3px] leading-none">CALOI</p>
            <p className="text-[10px] text-white/50 leading-none mt-1 truncate">Retrabalho Fábrica</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item, idx) => {
          const Icon = item.icon
          const isNewSection = (idx === 3 && isQuality) || (idx > 4 && idx === visibleItems.findIndex(i => i.to === '/materiais'))

          return (
            <div key={item.to}>
              {isNewSection && (
                <div className="my-2 mx-1 h-px bg-border" />
              )}
              <NavLink
                to={item.to}
                title={!open ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group relative',
                    isActive
                      ? 'text-[#C41414] font-semibold bg-red-50'
                      : 'text-foreground/60 hover:text-foreground hover:bg-accent',
                    !open && 'justify-center px-2'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <div
                        className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                        style={{ background: '#C41414' }}
                      />
                    )}
                    <Icon className={cn('h-4 w-4 shrink-0 relative z-10', isActive ? 'text-[#C41414]' : 'text-foreground/40 group-hover:text-foreground/70')} />
                    {open && <span className="truncate relative z-10">{item.label}</span>}
                  </>
                )}
              </NavLink>
            </div>
          )
        })}
      </nav>

      {/* Toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-[52px] w-6 h-6 rounded-full flex items-center justify-center transition-colors z-20 bg-white border border-border text-muted-foreground hover:text-foreground hover:border-gray-300"
      >
        {open ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      {/* Bottom label */}
      {open && (
        <div className="px-4 py-3 border-t border-border">
          <p className="text-[10px] text-muted-foreground/50 font-mono">v1.0 — Caloi Industrial</p>
        </div>
      )}
    </aside>
  )
}
