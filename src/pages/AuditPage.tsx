import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Card, CardContent } from '../components/ui/card'
import { formatDateTime } from '../lib/utils'
import type { AuditLog } from '../types'

const ACTION_LABELS: Record<string, string> = {
  create_lot: 'Criação de Lote',
  move_quantity: 'Movimentação',
  block_lot: 'Bloqueio de Qualidade',
  approve_quantity: 'Aprovação',
  send_to_scrap: 'Sucata',
  close_lot: 'Encerramento',
}

export default function AuditPage() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-log'],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_log')
        .select(`*, actor:profiles!user_id(full_name, email)`)
        .order('created_at', { ascending: false })
        .limit(200)
      return (data ?? []) as unknown as AuditLog[]
    },
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Auditoria</h1>
        <p className="text-muted-foreground text-sm">Histórico completo de ações do sistema</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum registro de auditoria</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-4 py-3">Data/Hora</th>
                    <th className="text-left px-4 py-3">Ação</th>
                    <th className="text-left px-4 py-3">Tabela</th>
                    <th className="text-left px-4 py-3">Usuário</th>
                    <th className="text-left px-4 py-3">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const actor = log.actor as { full_name: string; email: string } | undefined
                    return (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-accent/30">
                        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                        <td className="px-4 py-2 text-xs font-medium">{ACTION_LABELS[log.action] ?? log.action}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground font-mono">{log.table_name}</td>
                        <td className="px-4 py-2 text-xs">{actor?.full_name ?? actor?.email ?? '—'}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground max-w-xs truncate">
                          {log.new_data ? JSON.stringify(log.new_data).slice(0, 80) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
