import { Menu, Bell, LogOut, User } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Button } from './ui/button'
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

const roleBadge: Record<string, string> = {
  admin: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  quality: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  user: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

const roleLabel: Record<string, string> = {
  admin: 'Admin',
  quality: 'Qualidade',
  user: 'Usuário',
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const { profile, signOut } = useAuth()

  return (
    <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4 shrink-0">
      <Button variant="ghost" size="icon" onClick={onMenuToggle} className="shrink-0">
        <Menu className="h-4 w-4" />
      </Button>

      <div className="flex-1" />

      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-4 w-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2 h-9 px-2">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="hidden sm:flex flex-col items-start">
              <span className="text-sm font-medium leading-none">{profile?.full_name ?? 'Usuário'}</span>
              <span className={`text-xs mt-0.5 px-1.5 py-0.5 rounded border ${roleBadge[profile?.role ?? 'user'] ?? roleBadge.user}`}>
                {roleLabel[profile?.role ?? 'user'] ?? 'Usuário'}
              </span>
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{profile?.full_name}</p>
              <p className="text-xs text-muted-foreground">{profile?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} className="text-red-400 focus:text-red-400">
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
