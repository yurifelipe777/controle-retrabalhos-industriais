import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { calcAgingDays, formatDateTime, formatQuantity } from '../lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { Textarea } from '../components/ui/textarea'
import { useAuth } from '../hooks/useAuth'
import { toast } from '../components/ui/use-toast'
import {
  ArrowLeft, MoveRight, ShieldCheck, CheckCircle, Trash2, Lock, X, RefreshCw,
  RotateCcw, AlertTriangle, ChevronRight,
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

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  initial: 'Entrada inicial',
  transfer: 'Transferência',
  adjustment: 'Ajuste',
  reversal: 'Estorno',
}

// ──────────────────────────────────────────────
// Modal de estorno
// ──────────────────────────────────────────────
interface ReversalModalProps {
  movements: LotMovement[]
  lotStatus: string
  onClose: () => void
  onSuccess: () => void
}

function ReversalModal({ movements, lotStatus, onClose, onSuccess }: ReversalModalProps) {
  const [step, setStep] = useState<'select' | 'confirm'>('select')
  const [selected, setSelected] = useState<LotMovement | null>(null)
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const reversibleMovements = movements.filter(
    m => m.movement_type === 'transfer' && !m.is_reversed,
  )

  const handleSelectMovement = (m: LotMovement) => {
    setSelected(m)
    setStep('confirm')
  }

  const handleConfirm = async () => {
    if (!selected || !reason.trim()) return
    setIsSubmitting(true)
    try {
      const { error } = await supabase.rpc('reverse_lot_movement', {
        p_movement_id: selected.id,
        p_reason: reason.trim(),
      })
      if (error) throw error
      toast({ title: 'Estorno registrado com sucesso', description: `Movimentação estornada. Motivo: ${reason.trim()}` })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar estorno'
      toast({ variant: 'destructive', title: 'Erro no estorno', description: msg })
    } finally {
      setIsSubmitting(false)
    }
  }

  const lotClosed = ['closed', 'cancelled'].includes(lotStatus)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-400" />
            {step === 'select' ? 'Selecionar movimentação para estornar' : 'Confirmar estorno'}
          </DialogTitle>
        </DialogHeader>

        {lotClosed && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Lote encerrado ou cancelado — estorno não permitido.
          </div>
        )}

        {step === 'select' && !lotClosed && (
          <>
            <p className="text-sm text-muted-foreground">
              Selecione a movimentação que deseja estornar. O estorno cria um registro inverso,
              devolvendo a quantidade à etapa de origem. O histórico original é preservado.
            </p>

            {reversibleMovements.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <RotateCcw className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>Nenhuma movimentação disponível para estorno.</p>
                <p className="text-xs mt-1">Movimentos iniciais, ajustes e estornos anteriores não são estornáveis.</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {reversibleMovements.map(m => {
                  const from = m.from_stage as { name: string } | undefined
                  const to = m.to_stage as { name: string } | undefined
                  const mover = m.mover as { full_name: string } | undefined
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectMovement(m)}
                      className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-lg border border-border/50 hover:border-amber-400/40 hover:bg-amber-400/5 transition-all group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap text-sm font-medium">
                          <span className="text-muted-foreground">{from?.name ?? 'Entrada'}</span>
                          <MoveRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-primary">{to?.name}</span>
                          <Badge variant="outline" className="ml-1 text-xs">{formatQuantity(m.quantity)} pç</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {mover?.full_name ?? '—'} • {formatDateTime(m.moved_at)}
                        </p>
                        {m.notes && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{m.notes}</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-amber-400 shrink-0 transition-colors" />
                    </button>
                  )
                })}
              </div>
            )}

            <div className="mt-2 p-3 rounded-lg bg-amber-400/5 border border-amber-400/20 text-xs text-amber-300/80 space-y-1">
              <p><strong>Atenção:</strong> O estorno só é possível se houver saldo suficiente na etapa de destino da movimentação original.</p>
              <p>Movimentos posteriores que consumiram esse saldo impedem o estorno.</p>
            </div>
          </>
        )}

        {step === 'confirm' && selected && (
          <>
            <div className="space-y-3">
              <div className="p-3 rounded-lg border border-amber-400/30 bg-amber-400/5 space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Movimentação a estornar</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {(selected.from_stage as { name: string } | undefined)?.name ?? 'Entrada'}
                  </span>
                  <MoveRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-primary font-medium">
                    {(selected.to_stage as { name: string } | undefined)?.name}
                  </span>
                  <Badge variant="outline" className="ml-auto">{formatQuantity(selected.quantity)} pç</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {(selected.mover as { full_name: string } | undefined)?.full_name} • {formatDateTime(selected.moved_at)}
                </p>
                {selected.notes && (
                  <p className="text-xs text-muted-foreground/70 italic">"{selected.notes}"</p>
                )}
              </div>

              <div className="p-3 rounded-lg border border-border/50 bg-background/40 text-xs text-muted-foreground space-y-0.5">
                <p className="font-medium text-foreground/80">O que acontecerá:</p>
                <p>• Um novo registro de <strong>estorno</strong> será criado no histórico</p>
                <p>• {formatQuantity(selected.quantity)} pç voltarão para{' '}
                  <strong>{(selected.from_stage as { name: string } | undefined)?.name ?? 'Entrada'}</strong>
                </p>
                <p>• A movimentação original ficará marcada como estornada</p>
                <p>• O evento será registrado em Auditoria</p>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                  Motivo do estorno <span className="text-red-400">*</span>
                </label>
                <Textarea
                  placeholder="Descreva o motivo do estorno (ex: quantidade lançada incorretamente, etapa errada...)"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 flex-col sm:flex-row">
              <Button variant="outline" size="sm" onClick={() => { setStep('select'); setReason('') }}>
                Voltar
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={!reason.trim() || isSubmitting}
                className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {isSubmitting ? 'Processando...' : 'Confirmar Estorno'}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'select' && (
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────
// Página principal
// ──────────────────────────────────────────────
export default function LotDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAdmin, isQuality } = useAuth()
  const queryClient = useQueryClient()
  const [showReversalModal, setShowReversalModal] = useState(false)

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

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['lot-detail', id] })
    queryClient.invalidateQueries({ queryKey: ['lot-movements', id] })
    queryClient.invalidateQueries({ queryKey: ['lot-balances', id] })
  }

  const handleCloseLot = async () => {
    if (!confirm('Encerrar este lote? Esta ação é irreversível.')) return
    const { error } = await supabase.rpc('close_lot', { p_lot_id: id! })
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao encerrar lote', description: error.message })
    } else {
      toast({ title: 'Lote encerrado com sucesso!' })
      invalidateAll()
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
  const canReverse = !['closed', 'cancelled'].includes(lot.current_status)
    && movements.some(m => m.movement_type === 'transfer' && !m.is_reversed)

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
          onClick={() => invalidateAll()}
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
        {canReverse && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-amber-400 border-amber-400/30 hover:bg-amber-400/10"
            onClick={() => setShowReversalModal(true)}
          >
            <RotateCcw className="h-4 w-4" />
            Estorno
          </Button>
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Histórico de Movimentações ({movements.length})</CardTitle>
            {canReverse && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 h-7 text-xs"
                onClick={() => setShowReversalModal(true)}
              >
                <RotateCcw className="h-3 w-3" />
                Estornar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma movimentação registrada</p>
          ) : (
            <div className="space-y-0">
              {movements.map(m => {
                const from = m.from_stage as { name: string } | undefined
                const to = m.to_stage as { name: string } | undefined
                const mover = m.mover as { full_name: string } | undefined
                const isReversal = m.movement_type === 'reversal'
                const isReversed = m.is_reversed

                return (
                  <div
                    key={m.id}
                    className={`flex items-start gap-2 py-2.5 border-b border-border/50 last:border-0 text-sm ${isReversed ? 'opacity-50' : ''}`}
                  >
                    <div className={`mt-0.5 shrink-0 ${isReversal ? 'text-amber-400' : 'text-muted-foreground'}`}>
                      {isReversal
                        ? <RotateCcw className="h-4 w-4" />
                        : <MoveRight className="h-4 w-4" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-muted-foreground">{from?.name ?? 'Entrada'}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className={isReversal ? 'text-amber-400' : 'text-primary'}>{to?.name}</span>
                        <span className="font-medium ml-1">{formatQuantity(m.quantity)} pç</span>
                        <Badge
                          variant={isReversal ? 'warning' : m.movement_type === 'initial' ? 'muted' : 'outline'}
                          className="text-xs ml-1"
                        >
                          {MOVEMENT_TYPE_LABELS[m.movement_type] ?? m.movement_type}
                        </Badge>
                        {isReversed && (
                          <Badge variant="muted" className="text-xs">estornado</Badge>
                        )}
                      </div>
                      {m.notes && (
                        <p className={`text-xs mt-0.5 ${isReversal ? 'text-amber-400/70' : 'text-muted-foreground'}`}>
                          {m.notes}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {mover?.full_name ?? '—'} • {formatDateTime(m.moved_at)}
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
                const qCreator = e.creator as { full_name: string } | undefined
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
                      <p className="text-xs text-muted-foreground mt-0.5">{qCreator?.full_name} • {formatDateTime(e.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de estorno */}
      {showReversalModal && lot && (
        <ReversalModal
          movements={movements}
          lotStatus={lot.current_status}
          onClose={() => setShowReversalModal(false)}
          onSuccess={invalidateAll}
        />
      )}
    </div>
  )
}
