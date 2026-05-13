import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { calcAgingDays, formatDate, formatQuantity } from '../lib/utils'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Plus, Search, Eye, AlertTriangle } from 'lucide-react'
import type { LotStatus, QualityStatus, ReworkLot } from '../types'

const LOT_STATUS_LABELS: Record<LotStatus, string> = {
  open: 'Aberto',
  in_rework: 'Em Retrabalho',
  awaiting_quality: 'Aguard. Qualidade',
  partially_approved: 'Parc. Aprovado',
  approved: 'Aprovado',
  partially_scrapped: 'Parc. Sucateado',
  scrapped: 'Sucateado',
  closed: 'Encerrado',
  cancelled: 'Cancelado',
}

const LOT_STATUS_VARIANTS: Record<LotStatus, 'success' | 'warning' | 'danger' | 'muted' | 'default'> = {
  open: 'default',
  in_rework: 'warning',
  awaiting_quality: 'orange' as 'warning',
  partially_approved: 'success',
  approved: 'success',
  partially_scrapped: 'warning',
  scrapped: 'danger',
  closed: 'muted',
  cancelled: 'muted',
}

const QUALITY_STATUS_LABELS: Record<QualityStatus, string> = {
  pending_block: 'Pend. Bloqueio',
  blocked: 'Bloqueado',
  in_inspection: 'Em Inspeção',
  approved: 'Aprovado',
  rejected: 'Reprovado',
  unblocked: 'Desbloqueado',
  scrap_approved: 'Sucata Aprov.',
}

export default function LotsListPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('active')

  const { data: lots = [], isLoading } = useQuery({
    queryKey: ['lots-list', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('rework_lots')
        .select(`*, product_master(part_number, description, family), defect_type:defect_types(name), creator:profiles!created_by(full_name)`)
        .order('opened_at', { ascending: false })

      if (statusFilter === 'active') {
        query = query.not('current_status', 'in', '("closed","cancelled")')
      } else if (statusFilter === 'closed') {
        query = query.in('current_status', ['closed', 'cancelled'])
      } else if (statusFilter === 'no_block') {
        query = query.eq('quality_status', 'pending_block').not('current_status', 'in', '("closed","cancelled")')
      }

      const { data, error } = await query.limit(200)
      if (error) throw error
      return data as unknown as ReworkLot[]
    },
  })

  const filtered = lots.filter(l => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      l.lot_code.toLowerCase().includes(s) ||
      (l.product_master as { part_number: string } | undefined)?.part_number?.toLowerCase().includes(s) ||
      (l.product_master as { description: string } | undefined)?.description?.toLowerCase().includes(s)
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lotes de Retrabalho</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} lote{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/lotes/novo">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Lote
          </Button>
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por lote, part number ou descrição..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {[
            { value: 'active', label: 'Ativos' },
            { value: 'no_block', label: 'Sem Bloqueio' },
            { value: 'all', label: 'Todos' },
            { value: 'closed', label: 'Encerrados' },
          ].map(opt => (
            <Button
              key={opt.value}
              variant={statusFilter === opt.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.value === 'no_block' && <AlertTriangle className="h-3 w-3 mr-1 text-red-400" />}
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum lote encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-4 py-3">Lote</th>
                    <th className="text-left px-4 py-3">Data</th>
                    <th className="text-left px-4 py-3">Part Number</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">Descrição</th>
                    <th className="text-right px-4 py-3">Inicial</th>
                    <th className="text-right px-4 py-3">Aberto</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-center px-4 py-3">Qualidade</th>
                    <th className="text-right px-4 py-3">Aging</th>
                    <th className="text-center px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(lot => {
                    const aging = calcAgingDays(lot.opened_at)
                    const pm = lot.product_master as { part_number: string; description: string } | undefined
                    const noBloqueio = lot.quality_status === 'pending_block' && !['closed', 'cancelled'].includes(lot.current_status)

                    return (
                      <tr
                        key={lot.id}
                        className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${noBloqueio ? 'bg-red-500/5' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {noBloqueio && <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />}
                            <span className="font-mono text-xs text-primary">{lot.lot_code}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(lot.opened_at)}</td>
                        <td className="px-4 py-3 font-mono text-xs">{pm?.part_number ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-[180px] truncate">{pm?.description ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-xs">{formatQuantity(lot.quantity_initial)}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatQuantity(lot.quantity_open)}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={LOT_STATUS_VARIANTS[lot.current_status] as 'default'}>
                            {LOT_STATUS_LABELS[lot.current_status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={lot.quality_status === 'pending_block' ? 'danger' : 'muted'}>
                            {QUALITY_STATUS_LABELS[lot.quality_status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge variant={aging > 10 ? 'danger' : aging > 5 ? 'warning' : aging > 2 ? 'orange' as 'warning' : 'success'}>
                            {aging}d
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link to={`/lotes/${lot.id}`}>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Eye className="h-3 w-3" />
                            </Button>
                          </Link>
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

function Package(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
    </svg>
  )
}
