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

function CaloiMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 shrink-0">
      <rect width="32" height="32" rx="6" fill="#E8291C" />
      <text x="16" y="22" textAnchor="middle" fill="white" fontWeight="900" fontSize="11" fontFamily="Inter, Arial, sans-serif" letterSpacing="1">C</text>
    </svg>
  )
}

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
        'relative flex flex-col shrink-0 transition-all duration-300',
        open ? 'w-56' : 'w-[60px]'
      )}
      style={{
        background: 'hsl(225, 42%, 6%)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Logo */}
      <div className={cn(
        'flex items-center h-14 px-3 gap-3',
        !open && 'justify-center'
      )} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <CaloiMark />
        {open && (
          <div className="min-w-0 overflow-hidden">
            <p className="text-xs font-black text-white tracking-[3px] leading-none">CALOI</p>
            <p className="text-[10px] text-white/30 leading-none mt-1 truncate">Retrabalho Fábrica</p>
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
                <div className="my-2 mx-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
              )}
              <NavLink
                to={item.to}
                title={!open ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group relative',
                    isActive
                      ? 'text-[#E8291C] font-semibold'
                      : 'text-white/40 hover:text-white/80',
                    !open && 'justify-center px-2'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <div className="absolute inset-0 rounded-lg" style={{
                        background: 'linear-gradient(90deg, rgba(232,41,28,0.15) 0%, rgba(232,41,28,0.04) 100%)',
                        borderLeft: '2px solid #E8291C',
                      }} />
                    )}
                    <Icon className={cn('h-4 w-4 shrink-0 relative z-10', isActive ? 'text-[#E8291C]' : 'text-white/35 group-hover:text-white/70')} />
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
        className="absolute -right-3 top-[52px] w-6 h-6 rounded-full flex items-center justify-center transition-colors z-20"
        style={{
          background: 'hsl(225, 40%, 10%)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.3)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)' }}
      >
        {open ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      {/* Bottom label */}
      {open && (
        <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-[10px] text-white/15 font-mono">v1.0 — Caloi Industrial</p>
        </div>
      )}
    </aside>
  )
}
