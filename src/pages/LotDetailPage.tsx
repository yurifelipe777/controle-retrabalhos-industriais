import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { calcAgingDays, formatDateTime, formatQuantity } from '../lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { useAuth } from '../hooks/useAuth'
import { toast } from '../components/ui/use-toast'
import {
  ArrowLeft, MoveRight, ShieldCheck, CheckCircle, XCircle, Trash2, Lock, Unlock, X, RefreshCw
} from 'lucide-react'
import type { ReworkLot, LotMovement, QualityEvent, ScrapEvent, LotStageBalance } from '../types'

const LOT_STATUS_LABELS: Record<string, string> = {
  open: 'Aberto', in_rework: 'Em Retrabalho', awaiting_quality: 'Aguard. Qualidade',
  partially_approved: 'Parc. Aprovado', approved: 'Aprovado',
  partially_scrapped: 'Parc. Sucateado', scrapped: 'Sucateado',
  closed: 'Encerrado', cancelled: 'Cancelado',
}

const QUALITY_STATUS_LABELS: Record<string, string> = {
  pending_block: 'Pend. Bloqueio', blocked: 'Bloqueado', in_inspection: 'Em Inspeção',
  approved: 'Aprovado', rejected: 'Reprovado', unblocked: 'Desbloqueado', scrap_approved: 'Sucata Aprov.',
}

const QUALITY_EVENT_LABELS: Record<string, string> = {
  block: 'Bloqueio', unblock: 'Desbloqueio', inspection: 'Inspeção',
  approve: 'Aprovação', reject: 'Reprovação', send_to_scrap: 'Sucata',
}

export default function LotDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin, isQuality } = useAuth()
  const queryClient = useQueryClient()

  const { data: lot, isLoading } = useQuery({
    queryKey: ['lot-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rework_lots')
        .select(`*, product_master(*), defect_type:defect_types(*), creator:profiles!created_by(full_name, email)`)
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as unknown as ReworkLot
    },
  })

  const { data: movements = [] } = useQuery({
    queryKey: ['lot-movements', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('lot_movements')
        .select(`*, from_stage:process_stages!from_stage_id(name), to_stage:process_stages!to_stage_id(name), mover:profiles!moved_by(full_name)`)
        .eq('lot_id', id!)
        .order('moved_at', { ascending: false })
      return (data ?? []) as unknown as LotMovement[]
    },
  })

  const { data: balances = [] } = useQuery({
    queryKey: ['lot-balances', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('lot_stage_balances')
        .select(`*, stage:process_stages(name, sequence)`)
        .eq('lot_id', id!)
        .gt('balance_quantity', 0)
        .order('stage(sequence)')
      return (data ?? []) as unknown as LotStageBalance[]
    },
  })

  const { data: qualityEvents = [] } = useQuery({
    queryKey: ['lot-quality', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('quality_events')
        .select(`*, creator:profiles!created_by(full_name)`)
        .eq('lot_id', id!)
        .order('created_at', { ascending: false })
      return (data ?? []) as unknown as QualityEvent[]
    },
  })

  const { data: scrapEvents = [] } = useQuery({
    queryKey: ['lot-scrap', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('scrap_events')
        .select(`*, approver:profiles!approved_by(full_name)`)
        .eq('lot_id', id!)
        .order('created_at', { ascending: false })
      return (data ?? []) as unknown as ScrapEvent[]
    },
  })

  const handleCloseLot = async () => {
    if (!confirm('Encerrar este lote? Esta ação é irreversível.')) return
    const { error } = await supabase.rpc('close_lot', { p_lot_id: id! })
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao encerrar lote', description: error.message })
    } else {
      toast({ title: 'Lote encerrado com sucesso!' })
      queryClient.invalidateQueries({ queryKey: ['lot-detail', id] })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!lot) {
    return <div className="text-center text-muted-foreground py-12">Lote não encontrado</div>
  }

  const pm = lot.product_master as { part_number: string; description: string; family: string } | undefined
  const creator = lot.creator as { full_name: string } | undefined
  const defect = lot.defect_type as { name: string } | undefined
  const aging = calcAgingDays(lot.opened_at)
  const noBloqueio = lot.quality_status === 'pending_block' && !['closed', 'cancelled'].includes(lot.current_status)
  const canClose = lot.quantity_open === 0 && !['closed', 'cancelled'].includes(lot.current_status)

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/lotes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold font-mono">{lot.lot_code}</h1>
            <Badge variant={lot.current_status === 'closed' ? 'muted' : 'default'}>
              {LOT_STATUS_LABELS[lot.current_status] ?? lot.current_status}
            </Badge>
            <Badge variant={lot.quality_status === 'pending_block' ? 'danger' : 'muted'}>
              {QUALITY_STATUS_LABELS[lot.quality_status] ?? lot.quality_status}
            </Badge>
            {aging > 0 && (
              <Badge variant={aging > 10 ? 'danger' : aging > 5 ? 'warning' : 'outline'}>
                {aging}d
              </Badge>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['lot-detail', id] })}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {noBloqueio && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          <Lock className="h-4 w-4 shrink-0" />
          Este lote não possui bloqueio formal de Qualidade. Registre a NC/RNC na aba de Qualidade.
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap gap-2">
        {!['closed', 'cancelled', 'approved', 'scrapped'].includes(lot.current_status) && (
          <Link to={`/lotes/${id}/movimentar`}>
            <Button variant="outline" size="sm" className="gap-1">
              <MoveRight className="h-4 w-4" />
              Movimentar
            </Button>
          </Link>
        )}
        {isQuality && !['closed', 'cancelled'].includes(lot.current_status) && (
          <>
            {lot.quality_status === 'pending_block' && (
              <Link to={`/qualidade?lot=${id}`}>
                <Button variant="outline" size="sm" className="gap-1 text-yellow-400 border-yellow-400/30">
                  <Lock className="h-4 w-4" />
                  Bloquear
                </Button>
              </Link>
            )}
            <Link to={`/qualidade?lot=${id}`}>
              <Button variant="outline" size="sm" className="gap-1 text-emerald-400 border-emerald-400/30">
                <CheckCircle className="h-4 w-4" />
                Aprovar
              </Button>
            </Link>
            <Link to={`/sucata?lot=${id}`}>
              <Button variant="outline" size="sm" className="gap-1 text-red-400 border-red-400/30">
                <Trash2 className="h-4 w-4" />
                Sucata
              </Button>
            </Link>
          </>
        )}
        {canClose && (
          <Button variant="outline" size="sm" className="gap-1 text-muted-foreground" onClick={handleCloseLot}>
            <X className="h-4 w-4" />
            Encerrar Lote
          </Button>
        )}
      </div>

      {/* Info cards */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Material</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div><span className="text-xs text-muted-foreground">Part Number</span><p className="font-mono text-primary">{pm?.part_number ?? '—'}</p></div>
            <div><span className="text-xs text-muted-foreground">Descrição</span><p className="text-sm">{pm?.description ?? '—'}</p></div>
            <div><span className="text-xs text-muted-foreground">Família</span><p className="text-sm">{pm?.family ?? '—'}</p></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Quantidades</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between"><span className="text-xs text-muted-foreground">Quantidade Inicial</span><span className="font-medium">{formatQuantity(lot.quantity_initial)}</span></div>
            <div className="flex justify-between"><span className="text-xs text-muted-foreground">Saldo Aberto</span><span className="font-bold text-primary">{formatQuantity(lot.quantity_open)}</span></div>
            <div className="flex justify-between"><span className="text-xs text-muted-foreground">Aprovado</span><span className="text-emerald-400">{formatQuantity(lot.quantity_initial - lot.quantity_open - (scrapEvents.reduce((s, e) => s + e.quantity, 0)))}</span></div>
            <div className="flex justify-between"><span className="text-xs text-muted-foreground">Sucateado</span><span className="text-red-400">{formatQuantity(scrapEvents.reduce((s, e) => s + e.quantity, 0))}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Defeito</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div><span className="text-xs text-muted-foreground">Tipo</span><p className="text-sm">{defect?.name ?? '—'}</p></div>
            <div><span className="text-xs text-muted-foreground">Descrição</span><p className="text-sm">{lot.defect_description}</p></div>
            <div><span className="text-xs text-muted-foreground">Setor de Origem</span><p className="text-sm">{lot.origin_area}</p></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Qualidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Requer Bloqueio</span>
              <Badge variant={lot.quality_block_required ? 'warning' : 'muted'}>{lot.quality_block_required ? 'Sim' : 'Não'}</Badge>
            </div>
            {lot.quality_block_number && (
              <div><span className="text-xs text-muted-foreground">Nº do Bloqueio</span><p className="font-mono text-sm">{lot.quality_block_number}</p></div>
            )}
            <div><span className="text-xs text-muted-foreground">Criado por</span><p className="text-sm">{creator?.full_name ?? '—'}</p></div>
            <div><span className="text-xs text-muted-foreground">Aberto em</span><p className="text-sm">{formatDateTime(lot.opened_at)}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Saldo por etapa */}
      {balances.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Saldo por Etapa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {balances.map(b => {
                const stage = b.stage as { name: string } | undefined
                return (
                  <div key={b.id} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                    <span className="text-sm">{stage?.name ?? '—'}</span>
                    <span className="font-medium text-primary">{formatQuantity(b.balance_quantity)}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Movimentações */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Histórico de Movimentações ({movements.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma movimentação registrada</p>
          ) : (
            <div className="space-y-2">
              {movements.map(m => {
                const from = m.from_stage as { name: string } | undefined
                const to = m.to_stage as { name: string } | undefined
                const mover = m.mover as { full_name: string } | undefined
                return (
                  <div key={m.id} className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0 text-sm">
                    <MoveRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-muted-foreground">{from?.name ?? 'Entrada'}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-primary">{to?.name}</span>
                        <span className="font-medium ml-1">{formatQuantity(m.quantity)} pç</span>
                      </div>
                      {m.notes && <p className="text-xs text-muted-foreground mt-0.5">{m.notes}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {mover?.full_name} • {formatDateTime(m.moved_at)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Eventos de qualidade */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Histórico de Qualidade ({qualityEvents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {qualityEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum evento de qualidade registrado</p>
          ) : (
            <div className="space-y-2">
              {qualityEvents.map(e => {
                const creator = e.creator as { full_name: string } | undefined
                return (
                  <div key={e.id} className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0 text-sm">
                    <ShieldCheck className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={e.event_type === 'approve' ? 'success' : e.event_type === 'send_to_scrap' ? 'danger' : 'muted'}>
                          {QUALITY_EVENT_LABELS[e.event_type] ?? e.event_type}
                        </Badge>
                        {e.quantity && <span className="font-medium">{formatQuantity(e.quantity)} pç</span>}
                        {e.quality_document && <span className="text-xs text-muted-foreground font-mono">{e.quality_document}</span>}
                      </div>
                      {e.notes && <p className="text-xs text-muted-foreground mt-0.5">{e.notes}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">{creator?.full_name} • {formatDateTime(e.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
