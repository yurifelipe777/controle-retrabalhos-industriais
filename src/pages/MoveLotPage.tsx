import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { ArrowLeft, MoveRight, Loader2, AlertTriangle } from 'lucide-react'
import { formatQuantity } from '../lib/utils'
import type { LotStageBalance, ProcessStage, ReworkLot } from '../types'

const schema = z.object({
  from_stage_id: z.string().uuid('Selecione a etapa de origem'),
  to_stage_id: z.string().uuid('Selecione a etapa de destino'),
  quantity: z.coerce.number().positive('Quantidade deve ser maior que zero'),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function MoveLotPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [selectedFromBalance, setSelectedFromBalance] = useState<number | null>(null)

  const { data: lot } = useQuery({
    queryKey: ['lot-detail', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('rework_lots')
        .select(`*, product_master(part_number, description)`)
        .eq('id', id!)
        .single()
      return data as unknown as ReworkLot | null
    },
  })

  const { data: balances = [] } = useQuery({
    queryKey: ['lot-balances', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('lot_stage_balances')
        .select(`*, stage:process_stages(id, name, sequence)`)
        .eq('lot_id', id!)
        .gt('balance_quantity', 0)
      return (data ?? []) as unknown as LotStageBalance[]
    },
  })

  const { data: stages = [] } = useQuery({
    queryKey: ['process-stages'],
    queryFn: async () => {
      const { data } = await supabase.from('process_stages').select('*').eq('active', true).order('sequence')
      return (data ?? []) as ProcessStage[]
    },
  })

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const fromStageId = watch('from_stage_id')
  const toStageId = watch('to_stage_id')
  const quantity = watch('quantity')

  const destinationStages = stages.filter(s => s.id !== fromStageId && !['Aprovado', 'Sucata'].includes(s.name))

  const onSubmit = async (data: FormData) => {
    if (data.from_stage_id === data.to_stage_id) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Etapa de origem e destino devem ser diferentes' })
      return
    }
    if (selectedFromBalance !== null && data.quantity > selectedFromBalance) {
      toast({ variant: 'destructive', title: 'Saldo insuficiente', description: `Disponível: ${selectedFromBalance}` })
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.rpc('move_lot_quantity', {
        p_lot_id: id!,
        p_from_stage_id: data.from_stage_id,
        p_to_stage_id: data.to_stage_id,
        p_quantity: data.quantity,
        p_notes: data.notes || undefined,
      })

      if (error) {
        toast({ variant: 'destructive', title: 'Erro na movimentação', description: error.message })
      } else {
        toast({ title: 'Movimentação registrada com sucesso!' })
        queryClient.invalidateQueries({ queryKey: ['lot-detail', id] })
        queryClient.invalidateQueries({ queryKey: ['lot-balances', id] })
        queryClient.invalidateQueries({ queryKey: ['lot-movements', id] })
        navigate(`/lotes/${id}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const pm = lot?.product_master as { part_number: string; description: string } | undefined

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/lotes/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Movimentar Lote</h1>
          <p className="text-muted-foreground text-sm font-mono">{lot?.lot_code}</p>
        </div>
      </div>

      {lot && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{pm?.part_number}</span>
              <span className="text-muted-foreground">{pm?.description}</span>
              <div className="text-right">
                <span className="text-xs text-muted-foreground">Saldo Total</span>
                <p className="font-bold text-primary">{formatQuantity(lot.quantity_open)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Movimentação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Origem */}
            <div className="space-y-2">
              <Label>Etapa de Origem *</Label>
              <Select onValueChange={v => {
                setValue('from_stage_id', v)
                const bal = balances.find(b => (b.stage as { id: string } | undefined)?.id === v)
                setSelectedFromBalance(bal?.balance_quantity ?? null)
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa de origem..." />
                </SelectTrigger>
                <SelectContent>
                  {balances.map(b => {
                    const stage = b.stage as { id: string; name: string } | undefined
                    return (
                      <SelectItem key={b.id} value={stage?.id ?? ''}>
                        {stage?.name} — {formatQuantity(b.balance_quantity)} pç
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              {errors.from_stage_id && <p className="text-xs text-destructive">{errors.from_stage_id.message}</p>}
              {selectedFromBalance !== null && (
                <p className="text-xs text-muted-foreground">Disponível nesta etapa: <strong>{formatQuantity(selectedFromBalance)}</strong> peças</p>
              )}
            </div>

            {/* Destino */}
            <div className="space-y-2">
              <Label>Etapa de Destino *</Label>
              <Select onValueChange={v => setValue('to_stage_id', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa de destino..." />
                </SelectTrigger>
                <SelectContent>
                  {destinationStages.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.to_stage_id && <p className="text-xs text-destructive">{errors.to_stage_id.message}</p>}
            </div>

            {/* Quantidade */}
            <div className="space-y-2">
              <Label>Quantidade *</Label>
              <Input
                type="number"
                min="1"
                max={selectedFromBalance ?? undefined}
                placeholder="0"
                {...register('quantity')}
              />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
              {selectedFromBalance !== null && quantity > 0 && quantity > selectedFromBalance && (
                <div className="flex items-center gap-1 text-xs text-red-400">
                  <AlertTriangle className="h-3 w-3" />
                  Quantidade superior ao saldo disponível ({formatQuantity(selectedFromBalance)})
                </div>
              )}
            </div>

            {/* Preview */}
            {fromStageId && toStageId && quantity > 0 && (
              <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{balances.find(b => (b.stage as { id: string } | undefined)?.id === fromStageId) ? (balances.find(b => (b.stage as { id: string } | undefined)?.id === fromStageId)?.stage as { name: string } | undefined)?.name : '—'}</span>
                  <MoveRight className="h-4 w-4 text-primary" />
                  <span className="text-primary">{stages.find(s => s.id === toStageId)?.name}</span>
                  <span className="ml-auto font-bold">{formatQuantity(quantity)} pç</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Observação</Label>
              <Textarea placeholder="Opcional" rows={2} {...register('notes')} />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => navigate(`/lotes/${id}`)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Movimentação
          </Button>
        </div>
      </form>
    </div>
  )
}
