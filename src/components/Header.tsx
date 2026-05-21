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
  admin:   { bg: 'rgba(255,255,255,0.20)', text: '#FFFFFF', label: 'Admin' },
  quality: { bg: 'rgba(255,255,255,0.15)', text: '#FFFFFF', label: 'Qualidade' },
  user:    { bg: 'rgba(255,255,255,0.12)', text: 'rgba(255,255,255,0.80)', label: 'Usuário' },
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const { profile, signOut } = useAuth()
  const role = roleBadge[profile?.role ?? 'user'] ?? roleBadge.user
  const initials = profile?.full_name
    ? profile.full_name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : 'U'

  return (
    <header
      className="h-14 flex items-center px-4 gap-3 shrink-0 caloi-header"
    >
      <button
        onClick={onMenuToggle}
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-white/70 hover:text-white hover:bg-white/10"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Brand */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-black text-white tracking-[3px] leading-none">CALOI</span>
        <span className="text-white/30 text-xs">|</span>
        <span className="text-white/60 text-xs font-medium tracking-wide">Retrabalho Fábrica</span>
      </div>

      <div className="flex-1" />

      {/* Notification bell */}
      <button className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-white/60 hover:text-white hover:bg-white/10 relative">
        <Bell className="h-4 w-4" />
      </button>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 h-9 px-2.5 rounded-lg transition-colors text-white/80 hover:bg-white/10">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ background: 'rgba(255,255,255,0.25)', border: '1.5px solid rgba(255,255,255,0.40)' }}
            >
              {initials}
            </div>
            <div className="hidden sm:flex flex-col items-start">
              <span className="text-xs font-semibold text-white leading-none">{profile?.full_name ?? 'Usuário'}</span>
              <span
                className="text-[10px] mt-0.5 px-1.5 py-0.5 rounded font-medium"
                style={{ background: role.bg, color: role.text }}
              >
                {role.label}
              </span>
            </div>
            <ChevronDown className="h-3 w-3 text-white/40 hidden sm:block" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="font-normal px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ background: 'linear-gradient(135deg, #C41414 0%, #8B0E0E 100%)' }}
              >
                {initials}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground truncate max-w-[140px]">{profile?.email}</p>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={signOut}
            className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer mx-1 rounded-md"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
