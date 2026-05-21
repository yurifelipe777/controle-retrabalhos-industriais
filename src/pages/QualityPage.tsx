import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { ShieldCheck, Lock, CheckCircle, XCircle, AlertTriangle, Loader2, FlaskConical } from 'lucide-react'
import { calcAgingDays, formatDate, formatQuantity } from '../lib/utils'
import type { ReworkLot, LotStageBalance } from '../types'

type ActionType = 'block' | 'approve' | 'reject' | 'scrap' | 'decapagem'

export default function QualityPage() {
  const [searchParams] = useSearchParams()
  const preselectedLot = searchParams.get('lot')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState<{ open: boolean; action: ActionType; lot: ReworkLot | null }>({
    open: false, action: 'block', lot: null
  })
  const [formData, setFormData] = useState({ quantity: '', quality_document: '', notes: '', reason: '' })
  const [fromStageId, setFromStageId] = useState('')

  const { data: pendingLots = [] } = useQuery({
    queryKey: ['quality-pending'],
    queryFn: async () => {
      const { data } = await supabase
        .from('rework_lots')
        .select(`*, product_master(part_number, description, family)`)
        .eq('quality_status', 'pending_block')
        .not('current_status', 'in', '("closed","cancelled")')
        .order('opened_at', { ascending: true })
      return (data ?? []) as unknown as ReworkLot[]
    },
  })

  const { data: blockedLots = [] } = useQuery({
    queryKey: ['quality-blocked'],
    queryFn: async () => {
      const { data } = await supabase
        .from('rework_lots')
        .select(`*, product_master(part_number, description, family)`)
        .in('quality_status', ['blocked', 'in_inspection'])
        .not('current_status', 'in', '("closed","cancelled")')
        .order('opened_at', { ascending: true })
      return (data ?? []) as unknown as ReworkLot[]
    },
  })

  const { data: balances = [], isFetching: balancesFetching } = useQuery({
    queryKey: ['quality-balances', dialog.lot?.id],
    enabled: !!dialog.lot?.id && dialog.action !== 'block',
    staleTime: 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('lot_stage_balances')
        .select(`*, stage:process_stages(id, name, sequence)`)
        .eq('lot_id', dialog.lot!.id)
        .gt('balance_quantity', 0)
      return (data ?? []) as unknown as LotStageBalance[]
    },
  })

  // Fallback: todas as etapas ativas, usadas quando lot_stage_balances está vazio
  const { data: allStages = [] } = useQuery({
    queryKey: ['process-stages-active'],
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('process_stages')
        .select('id, name, sequence')
        .eq('active', true)
        .order('sequence')
      return (data ?? []) as { id: string; name: string; sequence: number }[]
    },
  })

  // Filtra client-side para decapagem — exclui a própria etapa Decapagem Externa como origem
  const decapagemBalances = balances.filter(
    b => (b.stage as { name: string } | undefined)?.name !== 'Decapagem Externa'
  )
  const fallbackStages = allStages.filter(s => s.name !== 'Decapagem Externa')

  // Caso especial: saldo já está inteiramente em Decapagem Externa (lote já foi enviado)
  const saldoJaNaDecapagem = dialog.action === 'decapagem' && !balancesFetching && balances.length > 0 && decapagemBalances.length === 0
  // Caso de dados inconsistentes: sem nenhum saldo por etapa registrado
  const semSaldoPorEtapa = !balancesFetching && balances.length === 0

  const openDialog = (action: ActionType, lot: ReworkLot) => {
    setDialog({ open: true, action, lot })
    setFormData({ quantity: String(lot.quantity_open), quality_document: lot.quality_block_number ?? '', notes: '', reason: '' })
    setFromStageId('')
  }

  const formalizeDecapagem = async () => {
    if (!dialog.lot) return
    setLoading(true)
    try {
      const { error } = await supabase.rpc('formalize_decapagem_from_balance', {
        p_lot_id: dialog.lot.id,
        p_quantity: Number(formData.quantity),
        p_notes: formData.notes || undefined,
      })
      if (error) {
        toast({ variant: 'destructive', title: 'Erro', description: error.message })
      } else {
        toast({ title: 'Envio formalizado com sucesso!', description: 'O lote aparecerá na página de Decapagem.' })
        setDialog(d => ({ ...d, open: false }))
        queryClient.invalidateQueries({ queryKey: ['quality-blocked'] })
        navigate('/decapagem')
      }
    } finally {
      setLoading(false)
    }
  }

  const executeAction = async () => {
    if (!dialog.lot) return
    setLoading(true)
    try {
      let error = null

      if (dialog.action === 'block') {
        const result = await supabase.rpc('block_lot', {
          p_lot_id: dialog.lot.id,
          p_quality_document: formData.quality_document || undefined,
          p_notes: formData.notes || undefined,
        })
        error = result.error
      } else if (dialog.action === 'approve') {
        if (!fromStageId) { toast({ variant: 'destructive', title: 'Selecione a etapa de origem' }); setLoading(false); return }
        const result = await supabase.rpc('approve_quantity', {
          p_lot_id: dialog.lot.id,
          p_from_stage_id: fromStageId,
          p_quantity: Number(formData.quantity),
          p_quality_document: formData.quality_document || undefined,
          p_notes: formData.notes || undefined,
        })
        error = result.error
      } else if (dialog.action === 'scrap') {
        if (!fromStageId) { toast({ variant: 'destructive', title: 'Selecione a etapa de origem' }); setLoading(false); return }
        if (!formData.reason.trim()) { toast({ variant: 'destructive', title: 'Motivo de sucata é obrigatório' }); setLoading(false); return }
        const result = await supabase.rpc('send_to_scrap', {
          p_lot_id: dialog.lot.id,
          p_from_stage_id: fromStageId,
          p_quantity: Number(formData.quantity),
          p_reason: formData.reason,
        })
        error = result.error
      } else if (dialog.action === 'decapagem') {
        if (!fromStageId) { toast({ variant: 'destructive', title: 'Selecione a etapa de origem' }); setLoading(false); return }
        const result = await supabase.rpc('send_to_decapagem', {
          p_lot_id: dialog.lot.id,
          p_from_stage_id: fromStageId,
          p_quantity: Number(formData.quantity),
          p_notes: formData.notes || undefined,
        })
        error = result.error
      }

      if (error) {
        toast({ variant: 'destructive', title: 'Erro', description: error.message })
      } else {
        toast({ title: 'Ação registrada com sucesso!' })
        setDialog({ open: false, action: 'block', lot: null })
        queryClient.invalidateQueries({ queryKey: ['quality-pending'] })
        queryClient.invalidateQueries({ queryKey: ['quality-blocked'] })
        if (dialog.action === 'decapagem') {
          navigate('/decapagem')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const actionTitles: Record<ActionType, string> = {
    block: 'Registrar Bloqueio de Qualidade',
    approve: 'Aprovar Quantidade',
    reject: 'Reprovar Quantidade',
    scrap: 'Enviar para Sucata',
    decapagem: 'Enviar para Decapagem Externa',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Qualidade</h1>
        <p className="text-muted-foreground text-sm">Gestão de bloqueios, inspeções e aprovações</p>
      </div>

      {/* Pendentes de Bloqueio */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <h2 className="font-semibold text-red-400">Pendentes de Bloqueio ({pendingLots.length})</h2>
        </div>
        {pendingLots.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhum lote pendente de bloqueio</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {pendingLots.map(lot => {
              const pm = lot.product_master as { part_number: string; description: string } | undefined
              return (
                <Card key={lot.id} className="border-red-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="font-mono text-primary text-sm">{lot.lot_code}</span>
                        <span className="mx-2 text-muted-foreground">·</span>
                        <span className="text-sm">{pm?.part_number}</span>
                        <p className="text-xs text-muted-foreground">{pm?.description}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Saldo</p>
                          <p className="font-bold">{formatQuantity(lot.quantity_open)}</p>
                        </div>
                        <Badge variant={calcAgingDays(lot.opened_at) > 5 ? 'danger' : 'warning'}>
                          {calcAgingDays(lot.opened_at)}d
                        </Badge>
                        <Button size="sm" onClick={() => openDialog('block', lot)} className="gap-1">
                          <Lock className="h-3 w-3" />
                          Bloquear
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Bloqueados / Em Inspeção */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-400" />
          <h2 className="font-semibold">Bloqueados / Em Inspeção ({blockedLots.length})</h2>
        </div>
        {blockedLots.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhum lote bloqueado</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {blockedLots.map(lot => {
              const pm = lot.product_master as { part_number: string; description: string } | undefined
              return (
                <Card key={lot.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="font-mono text-primary text-sm">{lot.lot_code}</span>
                        <span className="mx-2 text-muted-foreground">·</span>
                        <span className="text-sm">{pm?.part_number}</span>
                        {lot.quality_block_number && (
                          <span className="ml-2 text-xs text-muted-foreground font-mono">NC: {lot.quality_block_number}</span>
                        )}
                        <p className="text-xs text-muted-foreground">{pm?.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Saldo</p>
                          <p className="font-bold">{formatQuantity(lot.quantity_open)}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openDialog('approve', lot)} className="gap-1 text-emerald-400 border-emerald-400/30">
                          <CheckCircle className="h-3 w-3" />
                          Aprovar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openDialog('scrap', lot)} className="gap-1 text-red-400 border-red-400/30">
                          <XCircle className="h-3 w-3" />
                          Sucata
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openDialog('decapagem', lot)} className="gap-1 text-amber-400 border-amber-400/30">
                          <FlaskConical className="h-3 w-3" />
                          Decapagem
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Dialog de ação */}
      <Dialog open={dialog.open} onOpenChange={open => !open && setDialog(d => ({ ...d, open: false }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionTitles[dialog.action]}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {dialog.lot && (
              <div className="p-3 rounded-md bg-muted/30 text-sm">
                <p className="font-mono text-primary">{dialog.lot.lot_code}</p>
                <p className="text-xs text-muted-foreground">Saldo: {formatQuantity(dialog.lot.quantity_open)} pç</p>
              </div>
            )}

            {dialog.action === 'block' && (
              <>
                <div className="space-y-2">
                  <Label>Número do Documento (NC/RNC)</Label>
                  <Input placeholder="Ex: NC-2026-001" value={formData.quality_document} onChange={e => setFormData(d => ({ ...d, quality_document: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea rows={2} value={formData.notes} onChange={e => setFormData(d => ({ ...d, notes: e.target.value }))} />
                </div>
              </>
            )}

            {dialog.action === 'decapagem' && (
              <>
                <div className="p-3 rounded-md text-sm" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                  <p className="text-amber-400 font-medium text-xs mb-1">Processo Externo</p>
                  <p className="text-muted-foreground text-xs">O quadro será enviado para tratamento químico e retornará com um Part Number de quadro bruto diferente.</p>
                </div>

                {saldoJaNaDecapagem ? (
                  /* Caso: saldo já em Decapagem Externa sem evento registrado — formalizar */
                  <div className="p-3 rounded-md space-y-3" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)' }}>
                    <div>
                      <p className="text-cyan-400 font-semibold text-xs flex items-center gap-1.5 mb-1">
                        <FlaskConical className="h-3.5 w-3.5" />
                        Saldo já está em Decapagem Externa
                      </p>
                      <p className="text-muted-foreground text-xs">
                        O saldo ({formatQuantity(dialog.lot?.quantity_open ?? 0)} pç) já consta em Decapagem Externa mas não há registro formal de envio. Formalize abaixo — o lote ficará visível na página de Decapagem aguardando retorno.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Quantidade *</Label>
                      <Input type="number" min="1" value={formData.quantity} onChange={e => setFormData(d => ({ ...d, quantity: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Observações</Label>
                      <Textarea rows={2} placeholder="Ex: Lote criado direto na etapa Decapagem Externa" value={formData.notes} onChange={e => setFormData(d => ({ ...d, notes: e.target.value }))} />
                    </div>
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs w-full bg-amber-600 hover:bg-amber-700 text-white"
                      disabled={loading}
                      onClick={formalizeDecapagem}
                    >
                      {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                      <FlaskConical className="h-3 w-3" />
                      Formalizar Envio para Decapagem
                    </Button>
                  </div>
                ) : (
                  /* Caso normal: formulário de envio */
                  <>
                    <div className="space-y-2">
                      <Label>Etapa de Origem *</Label>
                      <Select onValueChange={setFromStageId} disabled={balancesFetching}>
                        <SelectTrigger>
                          <SelectValue placeholder={balancesFetching ? 'Carregando etapas…' : 'Selecione a etapa...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {decapagemBalances.length > 0
                            ? decapagemBalances.map(b => {
                                const stage = b.stage as { id: string; name: string } | undefined
                                return <SelectItem key={b.id} value={stage?.id ?? ''}>{stage?.name} — {formatQuantity(b.balance_quantity)} pç</SelectItem>
                              })
                            : fallbackStages.map(s => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))
                          }
                        </SelectContent>
                      </Select>
                      {semSaldoPorEtapa && fallbackStages.length > 0 && (
                        <p className="text-xs text-amber-400/70">Saldo por etapa indisponível — indique em qual etapa o lote se encontra.</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Quantidade *</Label>
                      <Input type="number" min="1" value={formData.quantity} onChange={e => setFormData(d => ({ ...d, quantity: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Observações</Label>
                      <Textarea rows={2} placeholder="Ex: Quadro com cor errada — referência NC-2026-005" value={formData.notes} onChange={e => setFormData(d => ({ ...d, notes: e.target.value }))} />
                    </div>
                  </>
                )}
              </>
            )}

            {(dialog.action === 'approve' || dialog.action === 'scrap') && (
              <>
                <div className="space-y-2">
                  <Label>Etapa de Origem *</Label>
                  <Select onValueChange={setFromStageId} disabled={balancesFetching}>
                    <SelectTrigger>
                      <SelectValue placeholder={balancesFetching ? 'Carregando etapas…' : 'Selecione...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {balances.length > 0
                        ? balances.map(b => {
                            const stage = b.stage as { id: string; name: string } | undefined
                            return <SelectItem key={b.id} value={stage?.id ?? ''}>{stage?.name} — {formatQuantity(b.balance_quantity)} pç</SelectItem>
                          })
                        : fallbackStages.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))
                      }
                    </SelectContent>
                  </Select>
                  {!balancesFetching && balances.length === 0 && fallbackStages.length > 0 && (
                    <p className="text-xs text-amber-400/70">Saldo por etapa indisponível — indique em qual etapa o lote se encontra.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Quantidade *</Label>
                  <Input type="number" min="1" value={formData.quantity} onChange={e => setFormData(d => ({ ...d, quantity: e.target.value }))} />
                </div>
                {dialog.action === 'approve' && (
                  <div className="space-y-2">
                    <Label>Documento de Aprovação</Label>
                    <Input placeholder="NC/RNC de referência" value={formData.quality_document} onChange={e => setFormData(d => ({ ...d, quality_document: e.target.value }))} />
                  </div>
                )}
                {dialog.action === 'scrap' && (
                  <div className="space-y-2">
                    <Label>Motivo da Sucata *</Label>
                    <Textarea rows={2} placeholder="Descreva o motivo..." value={formData.reason} onChange={e => setFormData(d => ({ ...d, reason: e.target.value }))} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea rows={2} value={formData.notes} onChange={e => setFormData(d => ({ ...d, notes: e.target.value }))} />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(d => ({ ...d, open: false }))}>Cancelar</Button>
            {!saldoJaNaDecapagem && (
              <Button
                onClick={executeAction}
                disabled={loading}
                variant={dialog.action === 'scrap' ? 'destructive' : 'default'}
                className={dialog.action === 'decapagem' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {dialog.action === 'decapagem' ? 'Enviar para Decapagem' : 'Confirmar'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
