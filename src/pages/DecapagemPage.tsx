import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/use-toast'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { FlaskConical, PackageCheck, ArrowRight, Loader2, Search, Clock, History } from 'lucide-react'
import { calcAgingDays, formatDate, normalizePartNumber } from '../lib/utils'
import type { DecapagemEvent, ProcessStage, ProductMaster } from '../types'

type Tab = 'aguardando' | 'historico'

interface ReturnDialog {
  open: boolean
  event: DecapagemEvent | null
}

export default function DecapagemPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('aguardando')
  const [loading, setLoading] = useState(false)
  const [returnDialog, setReturnDialog] = useState<ReturnDialog>({ open: false, event: null })

  const [pnSearch, setPnSearch] = useState('')
  const [selectedPn, setSelectedPn] = useState<ProductMaster | null>(null)
  const [initialStageId, setInitialStageId] = useState('')
  const [defectDescription, setDefectDescription] = useState('')
  const [returnNotes, setReturnNotes] = useState('')

  const { data: dispatched = [], isLoading: loadingDispatched } = useQuery({
    queryKey: ['decapagem-dispatched'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('decapagem_events')
        .select(`
          *,
          lot:rework_lots!lot_id ( lot_code, origin_area, quality_block_number ),
          original_pn:product_master!original_part_number_id ( part_number, description ),
          dispatcher:profiles!dispatched_by ( full_name )
        `)
        .eq('status', 'dispatched')
        .order('dispatched_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as DecapagemEvent[]
    },
  })

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['decapagem-history'],
    enabled: tab === 'historico',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('decapagem_events')
        .select(`
          *,
          lot:rework_lots!lot_id ( lot_code, origin_area ),
          original_pn:product_master!original_part_number_id ( part_number, description ),
          returned_pn:product_master!returned_part_number_id ( part_number, description ),
          returned_lot:rework_lots!returned_lot_id ( lot_code ),
          dispatcher:profiles!dispatched_by ( full_name ),
          returner:profiles!returned_by ( full_name )
        `)
        .in('status', ['returned', 'cancelled'])
        .order('dispatched_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as DecapagemEvent[]
    },
  })

  const { data: stages = [] } = useQuery({
    queryKey: ['process-stages'],
    queryFn: async () => {
      const { data } = await supabase
        .from('process_stages')
        .select('*')
        .eq('active', true)
        .not('name', 'eq', 'Decapagem Externa')
        .not('name', 'eq', 'Aprovado')
        .not('name', 'eq', 'Sucata')
        .order('sequence')
      return (data ?? []) as ProcessStage[]
    },
  })

  const { data: pnResults = [] } = useQuery({
    queryKey: ['pn-search-decapagem', pnSearch],
    enabled: pnSearch.length >= 2,
    queryFn: async () => {
      const normalized = normalizePartNumber(pnSearch)
      const { data } = await supabase
        .from('product_master')
        .select('*')
        .or(`normalized_part_number.ilike.%${normalized}%,description.ilike.%${pnSearch}%`)
        .eq('active', true)
        .limit(10)
      return (data ?? []) as ProductMaster[]
    },
  })

  const openReturnDialog = (event: DecapagemEvent) => {
    setReturnDialog({ open: true, event })
    setSelectedPn(null)
    setPnSearch('')
    setInitialStageId('')
    setDefectDescription('')
    setReturnNotes('')
  }

  const closeReturnDialog = () => {
    setReturnDialog({ open: false, event: null })
  }

  const handleRegisterReturn = async () => {
    if (!returnDialog.event) return
    if (!selectedPn) {
      toast({ variant: 'destructive', title: 'Selecione o Part Number do quadro bruto retornado' })
      return
    }
    if (!initialStageId) {
      toast({ variant: 'destructive', title: 'Selecione a etapa de entrada do material' })
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('register_decapagem_return', {
        p_decapagem_event_id: returnDialog.event.id,
        p_returned_pn_id: selectedPn.id,
        p_initial_stage_id: initialStageId,
        p_defect_description: defectDescription || undefined,
        p_return_notes: returnNotes || undefined,
      })

      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao registrar retorno', description: error.message })
        return
      }

      const result = data as Array<{ lot_id: string; lot_code: string }>
      const newLot = result?.[0]

      toast({
        title: 'Retorno registrado!',
        description: newLot
          ? `Novo lote criado: ${newLot.lot_code}`
          : 'Retorno de decapagem processado com sucesso.',
      })

      closeReturnDialog()
      queryClient.invalidateQueries({ queryKey: ['decapagem-dispatched'] })
      queryClient.invalidateQueries({ queryKey: ['decapagem-history'] })
    } finally {
      setLoading(false)
    }
  }

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      tab === t
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:text-foreground'
    }`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-amber-400" />
          Decapagem Externa
        </h1>
        <p className="text-muted-foreground text-sm">
          Processo de remoção química de tinta — rastreamento De/Para de Part Number
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-0">
        <button className={tabClass('aguardando')} onClick={() => setTab('aguardando')}>
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Aguardando Retorno
            {dispatched.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-500 text-white text-xs px-1.5 py-0.5 leading-none">
                {dispatched.length}
              </span>
            )}
          </span>
        </button>
        <button className={tabClass('historico')} onClick={() => setTab('historico')}>
          <span className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico De/Para
          </span>
        </button>
      </div>

      {/* Tab: Aguardando Retorno */}
      {tab === 'aguardando' && (
        <div className="space-y-3">
          {loadingDispatched && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loadingDispatched && dispatched.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                Nenhum lote aguardando retorno da Decapagem.
              </CardContent>
            </Card>
          )}
          {dispatched.map(ev => {
            const lot = ev.lot as { lot_code: string; origin_area: string; quality_block_number?: string } | undefined
            const origPn = ev.original_pn as { part_number: string; description: string } | undefined
            const dispatcher = ev.dispatcher as { full_name: string } | undefined
            const dias = calcAgingDays(ev.dispatched_at)

            return (
              <Card key={ev.id} className="border-amber-500/20">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/lotes/${ev.lot_id}`}
                          className="font-mono text-primary text-sm hover:underline"
                        >
                          {lot?.lot_code}
                        </Link>
                        {lot?.quality_block_number && (
                          <span className="text-xs text-muted-foreground font-mono">
                            NC: {lot.quality_block_number}
                          </span>
                        )}
                        <Badge variant="warning" className="text-xs">{dias}d em Decapagem</Badge>
                      </div>
                      <div className="flex items-center gap-1 text-sm">
                        <span className="font-medium text-red-300">{origPn?.part_number}</span>
                        <span className="text-muted-foreground text-xs">— {origPn?.description}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {ev.quantity} pç · Enviado em {formatDate(ev.dispatched_at)}
                        {dispatcher && ` · por ${dispatcher.full_name}`}
                      </p>
                      {ev.notes && (
                        <p className="text-xs text-muted-foreground italic">{ev.notes}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="gap-2 bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                      onClick={() => openReturnDialog(ev)}
                    >
                      <PackageCheck className="h-4 w-4" />
                      Registrar Retorno
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Tab: Histórico De/Para */}
      {tab === 'historico' && (
        <div className="space-y-3">
          {loadingHistory && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loadingHistory && history.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                Nenhum histórico de Decapagem encontrado.
              </CardContent>
            </Card>
          )}
          {history.map(ev => {
            const lot = ev.lot as { lot_code: string } | undefined
            const origPn = ev.original_pn as { part_number: string; description: string } | undefined
            const retPn = ev.returned_pn as { part_number: string; description: string } | undefined
            const retLot = ev.returned_lot as { lot_code: string } | undefined
            const dispatcher = ev.dispatcher as { full_name: string } | undefined
            const returner = ev.returner as { full_name: string } | undefined

            return (
              <Card key={ev.id} className={ev.status === 'returned' ? 'border-emerald-500/20' : 'border-border/50'}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link to={`/lotes/${ev.lot_id}`} className="font-mono text-primary text-sm hover:underline">
                          {lot?.lot_code}
                        </Link>
                        <Badge variant={ev.status === 'returned' ? 'success' : 'secondary'} className="text-xs">
                          {ev.status === 'returned' ? 'Retornado' : 'Cancelado'}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Enviado: {formatDate(ev.dispatched_at)}
                        {ev.returned_at && ` · Retornou: ${formatDate(ev.returned_at)}`}
                      </span>
                    </div>

                    {/* De/Para */}
                    <div className="flex items-center gap-3 p-3 rounded-md" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <div className="text-center min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">De (Pintado)</p>
                        <p className="text-sm font-medium text-red-300 truncate">{origPn?.part_number}</p>
                        <p className="text-xs text-muted-foreground truncate">{origPn?.description}</p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-amber-400 shrink-0" />
                      <div className="text-center min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Para (Bruto)</p>
                        {retPn ? (
                          <>
                            <p className="text-sm font-medium text-emerald-300 truncate">{retPn.part_number}</p>
                            <p className="text-xs text-muted-foreground truncate">{retPn.description}</p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">—</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span>{ev.quantity} pç</span>
                      {dispatcher && <span>Enviado por {dispatcher.full_name}</span>}
                      {returner && <span>Retornado por {returner.full_name}</span>}
                      {retLot && (
                        <Link to={`/lotes/${ev.returned_lot_id}`} className="text-primary hover:underline font-mono">
                          Novo lote: {retLot.lot_code}
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog: Registrar Retorno */}
      <Dialog open={returnDialog.open} onOpenChange={open => !open && closeReturnDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-amber-400" />
              Registrar Retorno da Decapagem
            </DialogTitle>
          </DialogHeader>

          {returnDialog.event && (() => {
            const lot = returnDialog.event.lot as { lot_code: string } | undefined
            const origPn = returnDialog.event.original_pn as { part_number: string; description: string } | undefined
            return (
              <div className="space-y-4">
                {/* Resumo do envio */}
                <div className="p-3 rounded-md space-y-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Lote de origem</p>
                  <p className="font-mono text-primary text-sm">{lot?.lot_code}</p>
                  <div className="flex items-center gap-2 text-sm mt-1">
                    <span className="text-red-300 font-medium">{origPn?.part_number}</span>
                    <ArrowRight className="h-4 w-4 text-amber-400" />
                    <span className="text-muted-foreground italic">PN bruto a selecionar</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{returnDialog.event.quantity} pç</p>
                </div>

                {/* Busca do PN bruto retornado */}
                <div className="space-y-2">
                  <Label>Part Number do Quadro Bruto Retornado *</Label>
                  {selectedPn ? (
                    <div className="flex items-center justify-between p-2 rounded-md border border-emerald-500/40 bg-emerald-500/5">
                      <div>
                        <p className="text-sm font-medium text-emerald-300">{selectedPn.part_number}</p>
                        <p className="text-xs text-muted-foreground">{selectedPn.description}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7"
                        onClick={() => { setSelectedPn(null); setPnSearch('') }}
                      >
                        Trocar
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          placeholder="Buscar por PN ou descrição..."
                          value={pnSearch}
                          onChange={e => setPnSearch(e.target.value)}
                        />
                      </div>
                      {pnSearch.length >= 2 && pnResults.length > 0 && (
                        <div className="border border-border rounded-md divide-y divide-border max-h-40 overflow-y-auto">
                          {pnResults.map(p => (
                            <button
                              key={p.id}
                              className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors"
                              onClick={() => { setSelectedPn(p); setPnSearch('') }}
                            >
                              <p className="text-sm font-medium">{p.part_number}</p>
                              <p className="text-xs text-muted-foreground">{p.description}</p>
                            </button>
                          ))}
                        </div>
                      )}
                      {pnSearch.length >= 2 && pnResults.length === 0 && (
                        <p className="text-xs text-muted-foreground px-1">Nenhum material encontrado.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Etapa de entrada */}
                <div className="space-y-2">
                  <Label>Etapa de Entrada do Material Retornado *</Label>
                  <Select onValueChange={setInitialStageId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione onde o quadro bruto entra..." />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Descrição do defeito (opcional) */}
                <div className="space-y-2">
                  <Label>Descrição do Novo Lote <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                  <Input
                    placeholder={`Retorno de Decapagem do lote ${lot?.lot_code}`}
                    value={defectDescription}
                    onChange={e => setDefectDescription(e.target.value)}
                  />
                </div>

                {/* Observações */}
                <div className="space-y-2">
                  <Label>Observações <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                  <Textarea
                    rows={2}
                    placeholder="Ex: Quadro retornou em boas condições após decapagem..."
                    value={returnNotes}
                    onChange={e => setReturnNotes(e.target.value)}
                  />
                </div>
              </div>
            )
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={closeReturnDialog} disabled={loading}>
              Cancelar
            </Button>
            <Button
              onClick={handleRegisterReturn}
              disabled={loading}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar Retorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
