import { Menu, Bell, LogOut, User, ChevronDown } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

interface HeaderProps {
  onMenuToggle: () => void
}

const roleBadge: Record<string, { bg: string; text: string; label: string }> = {
  admin:   { bg: 'rgba(168,85,247,0.15)', text: '#A855F7', label: 'Admin' },
  quality: { bg: 'rgba(59,130,246,0.15)', text: '#60A5FA', label: 'Qualidade' },
  user:    { bg: 'rgba(148,163,184,0.10)', text: '#94A3B8', label: 'Usuário' },
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const { profile, signOut } = useAuth()
  const role = roleBadge[profile?.role ?? 'user'] ?? roleBadge.user
  const initials = profile?.full_name
    ? profile.full_name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : 'U'

  return (
    <header
      className="h-14 flex items-center px-4 gap-3 shrink-0"
      style={{
        background: 'hsl(225, 42%, 6%)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <button
        onClick={onMenuToggle}
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
        style={{ color: 'rgba(255,255,255,0.4)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)' }}
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="flex-1" />

      {/* Notification bell */}
      <button
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors relative"
        style={{ color: 'rgba(255,255,255,0.35)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.35)' }}
      >
        <Bell className="h-4 w-4" />
      </button>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2.5 h-9 px-2.5 rounded-lg transition-colors"
            style={{ color: 'rgba(255,255,255,0.7)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #E8291C 0%, #C41E13 100%)' }}
            >
              {initials}
            </div>
            <div className="hidden sm:flex flex-col items-start">
              <span className="text-xs font-semibold text-white/80 leading-none">{profile?.full_name ?? 'Usuário'}</span>
              <span
                className="text-[10px] mt-0.5 px-1.5 py-0.5 rounded font-medium"
                style={{ background: role.bg, color: role.text }}
              >
                {role.label}
              </span>
            </div>
            <ChevronDown className="h-3 w-3 text-white/30 hidden sm:block" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-52" style={{ background: 'hsl(225, 40%, 9%)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <DropdownMenuLabel className="font-normal px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ background: 'linear-gradient(135deg, #E8291C 0%, #C41E13 100%)' }}
              >
                {initials}
              </div>
              <div>
                <p className="text-sm font-semibold text-white/90">{profile?.full_name}</p>
                <p className="text-xs text-white/40 truncate max-w-[140px]">{profile?.email}</p>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator style={{ background: 'rgba(255,255,255,0.05)' }} />
          <DropdownMenuItem
            onClick={signOut}
            className="text-red-400 focus:text-red-300 focus:bg-red-500/10 cursor-pointer mx-1 rounded-md"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
