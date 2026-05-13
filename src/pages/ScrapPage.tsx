import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Trash2, Search, Loader2, AlertTriangle } from 'lucide-react'
import { formatDateTime, formatQuantity, normalizePartNumber } from '../lib/utils'
import type { ReworkLot, ScrapEvent, LotStageBalance } from '../types'

export default function ScrapPage() {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [lotSearch, setLotSearch] = useState('')
  const [selectedLot, setSelectedLot] = useState<ReworkLot | null>(null)
  const [fromStageId, setFromStageId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')

  const { data: searchResults = [] } = useQuery({
    queryKey: ['scrap-lot-search', lotSearch],
    enabled: lotSearch.length >= 2,
    queryFn: async () => {
      const normalized = normalizePartNumber(lotSearch)
      const { data } = await supabase
        .from('rework_lots')
        .select(`*, product_master(part_number, description)`)
        .or(`lot_code.ilike.%${lotSearch}%,product_master.normalized_part_number.ilike.%${normalized}%`)
        .not('current_status', 'in', '("closed","cancelled")')
        .limit(10)
      return (data ?? []) as unknown as ReworkLot[]
    },
  })

  const { data: balances = [] } = useQuery({
    queryKey: ['scrap-balances', selectedLot?.id],
    enabled: !!selectedLot?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('lot_stage_balances')
        .select(`*, stage:process_stages(id, name, sequence)`)
        .eq('lot_id', selectedLot!.id)
        .gt('balance_quantity', 0)
      return (data ?? []) as unknown as LotStageBalance[]
    },
  })

  const { data: recentScraps = [] } = useQuery({
    queryKey: ['scrap-history'],
    queryFn: async () => {
      const { data } = await supabase
        .from('scrap_events')
        .select(`*, lot:rework_lots(lot_code, product_master(part_number, description)), approver:profiles!approved_by(full_name)`)
        .order('created_at', { ascending: false })
        .limit(20)
      return (data ?? []) as unknown as ScrapEvent[]
    },
  })

  const selectedBalance = balances.find(b => (b.stage as { id: string } | undefined)?.id === fromStageId)
  const availableQty = selectedBalance?.balance_quantity ?? 0

  const handleSubmit = async () => {
    if (!selectedLot || !fromStageId || !quantity || !reason.trim()) {
      toast({ variant: 'destructive', title: 'Preencha todos os campos obrigatórios' })
      return
    }

    const qty = Number(quantity)
    if (qty <= 0 || qty > availableQty) {
      toast({ variant: 'destructive', title: 'Quantidade inválida', description: `Disponível: ${availableQty}` })
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.rpc('send_to_scrap', {
        p_lot_id: selectedLot.id,
        p_from_stage_id: fromStageId,
        p_quantity: qty,
        p_reason: reason,
      })

      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao registrar sucata', description: error.message })
      } else {
        toast({ title: 'Sucata registrada com sucesso!' })
        setSelectedLot(null)
        setLotSearch('')
        setFromStageId('')
        setQuantity('')
        setReason('')
        queryClient.invalidateQueries({ queryKey: ['scrap-history'] })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sucata</h1>
        <p className="text-muted-foreground text-sm">Registre peças destinadas à sucata com motivo obrigatório</p>
      </div>

      {/* Formulário */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-400" />
            Novo Registro de Sucata
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Busca de lote */}
          <div className="space-y-2">
            <Label>Lote *</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por código do lote ou part number..."
                value={lotSearch}
                onChange={e => { setLotSearch(e.target.value); setSelectedLot(null) }}
                className="pl-9"
              />
            </div>
            {searchResults.length > 0 && !selectedLot && (
              <div className="border border-border rounded-md bg-popover shadow-md">
                {searchResults.map(l => {
                  const pm = l.product_master as { part_number: string; description: string } | undefined
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b border-border/50 last:border-0"
                      onClick={() => { setSelectedLot(l); setLotSearch(l.lot_code) }}
                    >
                      <span className="font-mono text-primary">{l.lot_code}</span>
                      <span className="ml-2 text-muted-foreground text-xs">{pm?.part_number} — {pm?.description}</span>
                      <span className="ml-2 text-xs text-primary">{formatQuantity(l.quantity_open)} pç</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {selectedLot && (
            <>
              <div className="p-3 rounded-md bg-muted/30 text-sm space-y-1">
                <p className="font-mono text-primary">{selectedLot.lot_code}</p>
                <p className="text-xs text-muted-foreground">Saldo total em aberto: <strong>{formatQuantity(selectedLot.quantity_open)}</strong></p>
              </div>

              <div className="space-y-2">
                <Label>Etapa de Origem *</Label>
                <Select onValueChange={setFromStageId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a etapa..." /></SelectTrigger>
                  <SelectContent>
                    {balances.map(b => {
                      const stage = b.stage as { id: string; name: string } | undefined
                      return <SelectItem key={b.id} value={stage?.id ?? ''}>{stage?.name} — {formatQuantity(b.balance_quantity)} pç</SelectItem>
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quantidade *</Label>
                <Input
                  type="number" min="1" max={availableQty}
                  placeholder="0"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                />
                {fromStageId && availableQty > 0 && (
                  <p className="text-xs text-muted-foreground">Disponível nesta etapa: <strong>{formatQuantity(availableQty)}</strong></p>
                )}
                {Number(quantity) > availableQty && availableQty > 0 && (
                  <div className="flex items-center gap-1 text-xs text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    Quantidade superior ao disponível
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Motivo da Sucata *</Label>
                <Textarea
                  rows={3}
                  placeholder="Descreva o motivo pelo qual essas peças estão sendo destinadas à sucata..."
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Obrigatório. Esta informação fica permanentemente registrada.</p>
              </div>

              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                <strong>Atenção:</strong> O registro de sucata é irreversível. Certifique-se de que as informações estão corretas.
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => { setSelectedLot(null); setLotSearch(''); setFromStageId(''); setQuantity(''); setReason('') }}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleSubmit} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Registrar Sucata
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Histórico recente */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Histórico Recente de Sucata</CardTitle>
        </CardHeader>
        <CardContent>
          {recentScraps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum registro de sucata</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left pb-2">Lote</th>
                    <th className="text-left pb-2">Material</th>
                    <th className="text-right pb-2">Qtd</th>
                    <th className="text-left pb-2">Motivo</th>
                    <th className="text-left pb-2">Aprovador</th>
                    <th className="text-left pb-2">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {recentScraps.map(s => {
                    const lot = s.lot as { lot_code: string; product_master: { part_number: string } } | undefined
                    const approver = s.approver as { full_name: string } | undefined
                    return (
                      <tr key={s.id} className="border-b border-border/50">
                        <td className="py-2 font-mono text-xs text-primary">{lot?.lot_code}</td>
                        <td className="py-2 text-xs">{lot?.product_master?.part_number}</td>
                        <td className="py-2 text-right font-medium text-red-400">{formatQuantity(s.quantity)}</td>
                        <td className="py-2 text-xs text-muted-foreground max-w-[200px] truncate">{s.reason}</td>
                        <td className="py-2 text-xs">{approver?.full_name}</td>
                        <td className="py-2 text-xs text-muted-foreground">{formatDateTime(s.created_at)}</td>
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
