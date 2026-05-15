import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { calcAgingDays, formatDate, formatQuantity } from '../lib/utils'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { useAuth } from '../hooks/useAuth'
import { toast } from '../components/ui/use-toast'
import { Plus, Search, Eye, AlertTriangle, Pencil, Trash2 } from 'lucide-react'
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

const ALL_LOT_STATUSES: LotStatus[] = [
  'open', 'in_rework', 'awaiting_quality', 'partially_approved', 'approved',
  'partially_scrapped', 'scrapped', 'closed', 'cancelled',
]

const ALL_QUALITY_STATUSES: QualityStatus[] = [
  'pending_block', 'blocked', 'in_inspection', 'approved', 'rejected', 'unblocked', 'scrap_approved',
]

// ─────────────────────────────────────────────────────────────
// Modal de edição (Admin)
// ─────────────────────────────────────────────────────────────
function EditLotModal({
  lot,
  onClose,
  onSuccess,
}: {
  lot: ReworkLot
  onClose: () => void
  onSuccess: () => void
}) {
  const pm = lot.product_master as { part_number: string; description: string } | undefined

  const [partNumberId, setPartNumberId] = useState(lot.part_number_id)
  const [quantityInitial, setQuantityInitial] = useState(String(lot.quantity_initial))
  const [quantityOpen, setQuantityOpen] = useState(String(lot.quantity_open))
  const [originArea, setOriginArea] = useState(lot.origin_area)
  const [currentStatus, setCurrentStatus] = useState(lot.current_status)
  const [qualityStatus, setQualityStatus] = useState(lot.quality_status)
  const [defectTypeId, setDefectTypeId] = useState(lot.defect_type_id ?? 'none')
  const [defectDescription, setDefectDescription] = useState(lot.defect_description)
  const [qualityBlockRequired, setQualityBlockRequired] = useState(lot.quality_block_required)
  const [qualityBlockNumber, setQualityBlockNumber] = useState(lot.quality_block_number ?? '')
  const [openedAt, setOpenedAt] = useState(new Date(lot.opened_at).toISOString().slice(0, 16))
  const [productSearch, setProductSearch] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { data: products = [] } = useQuery({
    queryKey: ['products-for-edit'],
    queryFn: async () => {
      const { data } = await supabase
        .from('product_master')
        .select('id, part_number, description')
        .eq('active', true)
        .order('part_number')
      return (data ?? []) as { id: string; part_number: string; description: string }[]
    },
    staleTime: 60_000,
  })

  const { data: defectTypes = [] } = useQuery({
    queryKey: ['defect-types-for-edit'],
    queryFn: async () => {
      const { data } = await supabase
        .from('defect_types')
        .select('id, name')
        .eq('active', true)
        .order('name')
      return (data ?? []) as { id: string; name: string }[]
    },
    staleTime: 60_000,
  })

  const filteredProducts = productSearch.trim()
    ? products.filter(p =>
        p.part_number.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.description.toLowerCase().includes(productSearch.toLowerCase())
      )
    : products

  const selectedProduct = products.find(p => p.id === partNumberId)

  const handleSave = async () => {
    const qInit = parseFloat(quantityInitial.replace(',', '.'))
    const qOpen = parseFloat(quantityOpen.replace(',', '.'))
    if (isNaN(qInit) || qInit < 0) {
      toast({ variant: 'destructive', title: 'Quantidade inicial inválida' })
      return
    }
    if (isNaN(qOpen) || qOpen < 0 || qOpen > qInit) {
      toast({ variant: 'destructive', title: 'Quantidade aberta inválida', description: 'Deve ser entre 0 e a quantidade inicial.' })
      return
    }
    if (!originArea.trim() || !defectDescription.trim()) {
      toast({ variant: 'destructive', title: 'Preencha todos os campos obrigatórios.' })
      return
    }
    setIsSubmitting(true)
    try {
      const { error } = await supabase.rpc('admin_update_rework_lot', {
        p_lot_id: lot.id,
        p_part_number_id: partNumberId,
        p_quantity_initial: qInit,
        p_quantity_open: qOpen,
        p_origin_area: originArea.trim(),
        p_current_status: currentStatus,
        p_quality_status: qualityStatus,
        p_defect_type_id: defectTypeId === 'none' ? null : defectTypeId,
        p_defect_description: defectDescription.trim(),
        p_quality_block_required: qualityBlockRequired,
        p_quality_block_number: qualityBlockNumber.trim() || null,
        p_opened_at: new Date(openedAt).toISOString(),
      })
      if (error) throw error
      toast({ title: 'Lote atualizado com sucesso!' })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar lote'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Lote <span className="font-mono text-primary">{lot.lot_code}</span></DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Part Number */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">
              Part Number <span className="text-red-400">*</span>
            </label>
            <Input
              placeholder="Buscar part number ou descrição..."
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              className="text-sm mb-1"
            />
            <div className="border border-border rounded-md max-h-36 overflow-y-auto bg-background/50">
              {filteredProducts.slice(0, 80).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setPartNumberId(p.id); setProductSearch('') }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors flex items-center gap-2 ${
                    p.id === partNumberId ? 'bg-primary/10 text-primary font-medium' : ''
                  }`}
                >
                  <span className="font-mono shrink-0">{p.part_number}</span>
                  <span className="text-muted-foreground truncate">{p.description}</span>
                </button>
              ))}
              {filteredProducts.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum produto encontrado</p>
              )}
            </div>
            {selectedProduct && (
              <p className="text-xs text-primary mt-1">
                Atual: <span className="font-mono">{selectedProduct.part_number}</span> — {selectedProduct.description}
              </p>
            )}
            {!selectedProduct && pm && (
              <p className="text-xs text-muted-foreground mt-1">
                Original: <span className="font-mono">{pm.part_number}</span> — {pm.description}
              </p>
            )}
          </div>

          {/* Quantities */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                Qtd Inicial <span className="text-red-400">*</span>
              </label>
              <Input
                type="number"
                min={0}
                step="any"
                value={quantityInitial}
                onChange={e => setQuantityInitial(e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                Qtd Aberta <span className="text-red-400">*</span>
              </label>
              <Input
                type="number"
                min={0}
                step="any"
                value={quantityOpen}
                onChange={e => setQuantityOpen(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          {/* Origin + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                Setor de Origem <span className="text-red-400">*</span>
              </label>
              <Input
                value={originArea}
                onChange={e => setOriginArea(e.target.value)}
                className="text-sm"
                placeholder="Ex: Montagem"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                Aberto em <span className="text-red-400">*</span>
              </label>
              <Input
                type="datetime-local"
                value={openedAt}
                onChange={e => setOpenedAt(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>

          {/* Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">Status Atual</label>
              <Select value={currentStatus} onValueChange={setCurrentStatus}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_LOT_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{LOT_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">Status Qualidade</label>
              <Select value={qualityStatus} onValueChange={setQualityStatus}>
                <SelectTrigger className="text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_QUALITY_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{QUALITY_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Defect Type */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Tipo de Defeito</label>
            <Select value={defectTypeId} onValueChange={setDefectTypeId}>
              <SelectTrigger className="text-sm h-9">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem tipo específico</SelectItem>
                {defectTypes.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Defect Description */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">
              Descrição do Defeito <span className="text-red-400">*</span>
            </label>
            <Textarea
              value={defectDescription}
              onChange={e => setDefectDescription(e.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          {/* Quality Block */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-2">Requer Bloqueio Qualidade</label>
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={qualityBlockRequired}
                  onChange={e => setQualityBlockRequired(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">{qualityBlockRequired ? 'Sim' : 'Não'}</span>
              </label>
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium block mb-1.5">Nº do Bloqueio</label>
              <Input
                value={qualityBlockNumber}
                onChange={e => setQualityBlockNumber(e.target.value)}
                className="text-sm"
                placeholder="Ex: NC-2026-001"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────
export default function LotsListPage() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [editingLot, setEditingLot] = useState<ReworkLot | null>(null)

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

  const handleDelete = async (lot: ReworkLot) => {
    const confirmed = confirm(
      `Excluir lote ${lot.lot_code}?\n\nEsta ação é IRREVERSÍVEL e removerá todas as movimentações, eventos de qualidade e registros associados.`
    )
    if (!confirmed) return
    try {
      const { error } = await supabase.rpc('admin_delete_rework_lot', { p_lot_id: lot.id })
      if (error) throw error
      toast({ title: `Lote ${lot.lot_code} excluído com sucesso.` })
      queryClient.invalidateQueries({ queryKey: ['lots-list'] })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir lote'
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: msg })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lotes de Retrabalho</h1>
          <p className="text-muted-foreground text-sm">
            {filtered.length} lote{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
          </p>
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
              <PackageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
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
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-[180px] truncate">
                          {pm?.description ?? '—'}
                        </td>
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
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-0.5">
                            <Link to={`/lotes/${lot.id}`}>
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Visualizar">
                                <Eye className="h-3 w-3" />
                              </Button>
                            </Link>
                            {isAdmin && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                                  title="Editar lote"
                                  onClick={() => setEditingLot(lot)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                  title="Excluir lote"
                                  onClick={() => handleDelete(lot)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
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

      {editingLot && (
        <EditLotModal
          lot={editingLot}
          onClose={() => setEditingLot(null)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['lots-list'] })}
        />
      )}
    </div>
  )
}

function PackageIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />
    </svg>
  )
}
