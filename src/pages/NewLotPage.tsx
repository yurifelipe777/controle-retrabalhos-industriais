import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Loader2, ArrowLeft, Search } from 'lucide-react'
import { normalizePartNumber } from '../lib/utils'
import type { ProductMaster, ProcessStage, DefectType } from '../types'

const schema = z.object({
  part_number_id: z.string().uuid('Selecione um material válido'),
  quantity_initial: z.coerce.number().positive('Quantidade deve ser maior que zero'),
  origin_area: z.string().min(1, 'Setor de origem é obrigatório'),
  initial_stage_id: z.string().uuid('Selecione a etapa inicial'),
  defect_type_id: z.string().uuid('Selecione o tipo de defeito'),
  defect_description: z.string().min(5, 'Descrição do defeito é obrigatória (mín. 5 caracteres)'),
  quality_block_required: z.boolean().default(true),
  quality_block_number: z.string().optional(),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function NewLotPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [pnSearch, setPnSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<ProductMaster | null>(null)

  const { data: stages = [] } = useQuery({
    queryKey: ['process-stages'],
    queryFn: async () => {
      const { data } = await supabase.from('process_stages').select('*').eq('active', true).order('sequence')
      return (data ?? []) as ProcessStage[]
    },
  })

  const { data: defectTypes = [] } = useQuery({
    queryKey: ['defect-types'],
    queryFn: async () => {
      const { data } = await supabase.from('defect_types').select('*').eq('active', true).order('name')
      return (data ?? []) as DefectType[]
    },
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products-search', pnSearch],
    queryFn: async () => {
      if (pnSearch.length < 2) return []
      const normalized = normalizePartNumber(pnSearch)
      const { data } = await supabase
        .from('product_master')
        .select('*')
        .or(`normalized_part_number.ilike.%${normalized}%,description.ilike.%${pnSearch}%`)
        .eq('active', true)
        .limit(10)
      return (data ?? []) as ProductMaster[]
    },
    enabled: pnSearch.length >= 2,
  })

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { quality_block_required: true },
  })

  const qualityBlockRequired = watch('quality_block_required')

  const entradaStage = stages.find(s => s.name === 'Entrada')

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const result = await supabase.rpc('create_rework_lot', {
        p_part_number_id: data.part_number_id,
        p_quantity_initial: data.quantity_initial,
        p_origin_area: data.origin_area,
        p_initial_stage_id: data.initial_stage_id,
        p_defect_type_id: data.defect_type_id,
        p_defect_description: data.defect_description,
        p_quality_block_required: data.quality_block_required,
        p_quality_block_number: data.quality_block_number || undefined,
        p_notes: data.notes || undefined,
      })

      if (result.error) {
        toast({ variant: 'destructive', title: 'Erro ao criar lote', description: result.error.message })
        return
      }

      const lotResult = result.data?.[0]
      toast({ title: 'Lote criado com sucesso!', description: `Código: ${lotResult?.lot_code}` })
      navigate(`/lotes/${lotResult?.lot_id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/lotes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Novo Lote de Retrabalho</h1>
          <p className="text-muted-foreground text-sm">O código será gerado automaticamente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Material */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Material</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Part Number *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Digite o part number ou descrição..."
                  value={pnSearch}
                  onChange={e => { setPnSearch(e.target.value); setSelectedProduct(null) }}
                  className="pl-9"
                />
              </div>
              {products.length > 0 && !selectedProduct && (
                <div className="border border-border rounded-md bg-popover shadow-md">
                  {products.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b border-border/50 last:border-0"
                      onClick={() => {
                        setSelectedProduct(p)
                        setPnSearch(p.part_number)
                        setValue('part_number_id', p.id)
                      }}
                    >
                      <span className="font-mono text-primary">{p.part_number}</span>
                      <span className="ml-2 text-muted-foreground text-xs">{p.description}</span>
                    </button>
                  ))}
                </div>
              )}
              {errors.part_number_id && <p className="text-xs text-destructive">{errors.part_number_id.message}</p>}
            </div>

            {selectedProduct && (
              <div className="p-3 rounded-md bg-primary/5 border border-primary/20 space-y-1">
                <p className="text-xs text-muted-foreground">Material selecionado:</p>
                <p className="font-mono text-sm text-primary">{selectedProduct.part_number}</p>
                <p className="text-sm">{selectedProduct.description}</p>
                {selectedProduct.family && (
                  <p className="text-xs text-muted-foreground">Família: {selectedProduct.family}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dados do lote */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Dados do Lote</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantidade Inicial *</Label>
                <Input type="number" min="1" placeholder="0" {...register('quantity_initial')} />
                {errors.quantity_initial && <p className="text-xs text-destructive">{errors.quantity_initial.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Setor de Origem *</Label>
                <Input placeholder="Ex: Linha Toys, Linha Aço..." {...register('origin_area')} />
                {errors.origin_area && <p className="text-xs text-destructive">{errors.origin_area.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Etapa Inicial do Retrabalho *</Label>
              <Select
                defaultValue={entradaStage?.id}
                onValueChange={v => setValue('initial_stage_id', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa..." />
                </SelectTrigger>
                <SelectContent>
                  {stages.filter(s => !['Aprovado', 'Sucata'].includes(s.name)).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.initial_stage_id && <p className="text-xs text-destructive">{errors.initial_stage_id.message}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Defeito */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Informações do Defeito</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Defeito *</Label>
              <Select onValueChange={v => setValue('defect_type_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo de defeito..." />
                </SelectTrigger>
                <SelectContent>
                  {defectTypes.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.defect_type_id && <p className="text-xs text-destructive">{errors.defect_type_id.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Descrição do Defeito *</Label>
              <Textarea
                placeholder="Descreva o defeito encontrado..."
                rows={3}
                {...register('defect_description')}
              />
              {errors.defect_description && <p className="text-xs text-destructive">{errors.defect_description.message}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Qualidade */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Bloqueio de Qualidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="quality_block"
                className="w-4 h-4 accent-primary"
                {...register('quality_block_required')}
                defaultChecked
              />
              <Label htmlFor="quality_block">Este lote requer bloqueio formal de Qualidade</Label>
            </div>

            {qualityBlockRequired && (
              <div className="space-y-2">
                <Label>Número do Documento de Bloqueio (NC/RNC)</Label>
                <Input placeholder="Ex: NC-2026-001, RNC-0042..." {...register('quality_block_number')} />
              </div>
            )}

            {!qualityBlockRequired && (
              <div className="p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-xs text-yellow-400">
                  Atenção: Lotes sem bloqueio de qualidade aparecem em alerta crítico no dashboard.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Observações */}
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea placeholder="Informações adicionais..." rows={2} {...register('notes')} />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => navigate('/lotes')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar Lote
          </Button>
        </div>
      </form>
    </div>
  )
}
