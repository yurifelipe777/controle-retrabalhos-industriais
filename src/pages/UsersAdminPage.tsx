import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/use-toast'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { useAuth } from '../hooks/useAuth'
import { CheckCircle, XCircle, UserX, Edit2 } from 'lucide-react'
import { formatDate } from '../lib/utils'
import type { Profile, UserRole, UserStatus } from '../types'

const ROLE_LABELS: Record<UserRole, string> = { user: 'Usuário', quality: 'Qualidade', admin: 'Admin' }
const STATUS_LABELS: Record<UserStatus, string> = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado', inactive: 'Inativo' }
const STATUS_VARIANTS: Record<UserStatus, string> = {
  pending: 'warning', approved: 'success', rejected: 'danger', inactive: 'muted'
}

export default function UsersAdminPage() {
  const { profile: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [editingRole, setEditingRole] = useState<string | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      return (data ?? []) as Profile[]
    },
  })

  const pendingUsers = users.filter(u => u.status === 'pending')
  const approvedUsers = users.filter(u => u.status === 'approved')
  const otherUsers = users.filter(u => !['pending', 'approved'].includes(u.status))

  const approve = async (userId: string) => {
    const { error } = await supabase.from('profiles').update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: currentUser?.id,
    }).eq('id', userId)
    if (error) toast({ variant: 'destructive', title: 'Erro', description: error.message })
    else { toast({ title: 'Usuário aprovado!' }); queryClient.invalidateQueries({ queryKey: ['admin-users'] }) }
  }

  const reject = async (userId: string) => {
    if (!confirm('Rejeitar este usuário?')) return
    const { error } = await supabase.from('profiles').update({ status: 'rejected' }).eq('id', userId)
    if (error) toast({ variant: 'destructive', title: 'Erro', description: error.message })
    else { toast({ title: 'Usuário rejeitado' }); queryClient.invalidateQueries({ queryKey: ['admin-users'] }) }
  }

  const deactivate = async (userId: string) => {
    if (!confirm('Desativar este usuário?')) return
    const { error } = await supabase.from('profiles').update({ status: 'inactive' }).eq('id', userId)
    if (error) toast({ variant: 'destructive', title: 'Erro', description: error.message })
    else { toast({ title: 'Usuário desativado' }); queryClient.invalidateQueries({ queryKey: ['admin-users'] }) }
  }

  const reactivate = async (userId: string) => {
    const { error } = await supabase.from('profiles').update({ status: 'approved' }).eq('id', userId)
    if (error) toast({ variant: 'destructive', title: 'Erro', description: error.message })
    else { toast({ title: 'Usuário reativado' }); queryClient.invalidateQueries({ queryKey: ['admin-users'] }) }
  }

  const changeRole = async (userId: string, role: UserRole) => {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (error) toast({ variant: 'destructive', title: 'Erro', description: error.message })
    else { toast({ title: 'Perfil atualizado' }); setEditingRole(null); queryClient.invalidateQueries({ queryKey: ['admin-users'] }) }
  }

  const UserRow = ({ user }: { user: Profile }) => (
    <tr key={user.id} className="border-b border-border/50 hover:bg-accent/30">
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium">{user.full_name}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
          {user.area && <p className="text-xs text-muted-foreground">{user.area}{user.job_title ? ` · ${user.job_title}` : ''}</p>}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        {editingRole === user.id ? (
          <Select
            defaultValue={user.role}
            onValueChange={v => changeRole(user.id, v as UserRole)}
          >
            <SelectTrigger className="h-7 text-xs w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Usuário</SelectItem>
              <SelectItem value="quality">Qualidade</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center justify-center gap-1">
            <Badge variant={user.role === 'admin' ? 'default' : user.role === 'quality' ? 'secondary' : 'muted'}>
              {ROLE_LABELS[user.role]}
            </Badge>
            {user.id !== currentUser?.id && (
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingRole(user.id)}>
                <Edit2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <Badge variant={STATUS_VARIANTS[user.status] as 'default'}>
          {STATUS_LABELS[user.status]}
        </Badge>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(user.created_at)}</td>
      <td className="px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-1">
          {user.status === 'pending' && (
            <>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-emerald-400 border-emerald-400/30" onClick={() => approve(user.id)}>
                <CheckCircle className="h-3 w-3" />
                Aprovar
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-red-400 border-red-400/30" onClick={() => reject(user.id)}>
                <XCircle className="h-3 w-3" />
                Rejeitar
              </Button>
            </>
          )}
          {user.status === 'approved' && user.id !== currentUser?.id && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-muted-foreground" onClick={() => deactivate(user.id)}>
              <UserX className="h-3 w-3" />
              Desativar
            </Button>
          )}
          {user.status === 'inactive' && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-primary" onClick={() => reactivate(user.id)}>
              Reativar
            </Button>
          )}
        </div>
      </td>
    </tr>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Administração de Usuários</h1>
        <p className="text-muted-foreground text-sm">{users.length} usuários cadastrados</p>
      </div>

      {pendingUsers.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-yellow-400 mb-2 flex items-center gap-1">
            Aguardando Aprovação ({pendingUsers.length})
          </h2>
          <Card className="border-yellow-500/20">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left px-4 py-2">Usuário</th>
                  <th className="text-center px-4 py-2">Perfil</th>
                  <th className="text-center px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Cadastro</th>
                  <th className="text-center px-4 py-2">Ações</th>
                </tr></thead>
                <tbody>{pendingUsers.map(u => <UserRow key={u.id} user={u} />)}</tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">Usuários Ativos ({approvedUsers.length})</h2>
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2">Usuário</th>
                    <th className="text-center px-4 py-2">Perfil</th>
                    <th className="text-center px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Cadastro</th>
                    <th className="text-center px-4 py-2">Ações</th>
                  </tr></thead>
                  <tbody>{approvedUsers.map(u => <UserRow key={u.id} user={u} />)}</tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {otherUsers.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Outros ({otherUsers.length})</h2>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2">Usuário</th>
                    <th className="text-center px-4 py-2">Perfil</th>
                    <th className="text-center px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Cadastro</th>
                    <th className="text-center px-4 py-2">Ações</th>
                  </tr></thead>
                  <tbody>{otherUsers.map(u => <UserRow key={u.id} user={u} />)}</tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
