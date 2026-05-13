import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { useAuth } from '../hooks/useAuth'
import { Plus, Search, Edit2, Loader2 } from 'lucide-react'
import { normalizePartNumber } from '../lib/utils'
import type { ProductMaster } from '../types'

export default function MaterialsPage() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<ProductMaster | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ part_number: '', description: '', family: '', material_type: '' })

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['materials', search],
    queryFn: async () => {
      let query = supabase.from('product_master').select('*').order('part_number')
      if (search.length >= 2) {
        const normalized = normalizePartNumber(search)
        query = query.or(`normalized_part_number.ilike.%${normalized}%,description.ilike.%${search}%`)
      }
      const { data } = await query.limit(100)
      return (data ?? []) as ProductMaster[]
    },
  })

  const openNew = () => {
    setEditing(null)
    setForm({ part_number: '', description: '', family: '', material_type: '' })
    setDialog(true)
  }

  const openEdit = (p: ProductMaster) => {
    setEditing(p)
    setForm({ part_number: p.part_number, description: p.description, family: p.family ?? '', material_type: p.material_type ?? '' })
    setDialog(true)
  }

  const handleSave = async () => {
    if (!form.part_number.trim() || !form.description.trim()) {
      toast({ variant: 'destructive', title: 'Part number e descrição são obrigatórios' })
      return
    }

    setLoading(true)
    try {
      const normalized = normalizePartNumber(form.part_number)
      const payload = {
        part_number: form.part_number.trim(),
        normalized_part_number: normalized,
        description: form.description.trim(),
        family: form.family.trim() || null,
        material_type: form.material_type.trim() || null,
      }

      let error
      if (editing) {
        const result = await supabase.from('product_master').update(payload).eq('id', editing.id)
        error = result.error
      } else {
        const result = await supabase.from('product_master').insert(payload)
        error = result.error
      }

      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message })
      } else {
        toast({ title: editing ? 'Material atualizado!' : 'Material cadastrado!' })
        setDialog(false)
        queryClient.invalidateQueries({ queryKey: ['materials'] })
      }
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = async (p: ProductMaster) => {
    await supabase.from('product_master').update({ active: !p.active }).eq('id', p.id)
    queryClient.invalidateQueries({ queryKey: ['materials'] })
  }

  const families = [...new Set(products.map(p => p.family).filter(Boolean))]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cadastro de Materiais</h1>
          <p className="text-muted-foreground text-sm">{products.length} materiais encontrados</p>
        </div>
        {isAdmin && (
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Material
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por part number ou descrição..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-4 py-3">Part Number</th>
                    <th className="text-left px-4 py-3">Descrição</th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">Família</th>
                    <th className="text-center px-4 py-3">Status</th>
                    {isAdmin && <th className="text-center px-4 py-3">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} className={`border-b border-border/50 hover:bg-accent/30 ${!p.active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs text-primary">{p.part_number}</td>
                      <td className="px-4 py-3 text-xs">{p.description}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{p.family ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={p.active ? 'success' : 'muted'}>{p.active ? 'Ativo' : 'Inativo'}</Badge>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleActive(p)}>
                              {p.active ? 'Desativar' : 'Ativar'}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de cadastro/edição */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Material' : 'Novo Material'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Part Number *</Label>
              <Input placeholder="Ex: 015183.10003" value={form.part_number} onChange={e => setForm(f => ({ ...f, part_number: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input placeholder="Descrição do material" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Família</Label>
              <Input placeholder="Ex: LINHA TOYS, LINHA AÇO, ALUMINIO ESPECIAL" value={form.family} onChange={e => setForm(f => ({ ...f, family: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Material</Label>
              <Input placeholder="Opcional" value={form.material_type} onChange={e => setForm(f => ({ ...f, material_type: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
