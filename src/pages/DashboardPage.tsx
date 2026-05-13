import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { AlertTriangle, Package, Clock, CheckCircle, XCircle, Trash2, TrendingUp, AlertCircle } from 'lucide-react'
import { calcAgingDays, formatQuantity, formatPercent } from '../lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import type { ReworkLot } from '../types'

const AGING_COLORS = {
  green: '#10b981',
  yellow: '#f59e0b',
  orange: '#f97316',
  red: '#ef4444',
}

function StatCard({
  title, value, icon: Icon, variant = 'default', subtitle,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  variant?: 'default' | 'warning' | 'danger' | 'success'
  subtitle?: string
}) {
  const cfg = {
    default: { color: '#E8291C', bg: 'rgba(232,41,28,0.1)', border: 'rgba(232,41,28,0.15)' },
    warning: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.15)' },
    danger:  { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.15)' },
    success: { color: '#22C55E', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.15)' },
  }[variant]

  return (
    <Card className="stat-card-hover cursor-default">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/40 mb-1.5 font-medium truncate">{title}</p>
            <p className="text-2xl font-black leading-none" style={{ color: cfg.color }}>{value}</p>
            {subtitle && <p className="text-xs text-white/30 mt-1.5">{subtitle}</p>}
          </div>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
            <Icon className="h-5 w-5" style={{ color: cfg.color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { data: lots = [], isLoading } = useQuery({
    queryKey: ['dashboard-lots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rework_lots')
        .select(`*, product_master(part_number, description, family)`)
        .not('current_status', 'in', '("closed","cancelled")')
      if (error) throw error
      return data as unknown as (ReworkLot & { product_master: { part_number: string; description: string; family: string } })[]
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { data: scrapTotal } = useQuery({
    queryKey: ['scrap-total'],
    queryFn: async () => {
      const { data } = await supabase.from('scrap_events').select('quantity')
      return data?.reduce((sum, e) => sum + (e.quantity ?? 0), 0) ?? 0
    },
  })

  const { data: approvedTotal } = useQuery({
    queryKey: ['approved-total'],
    queryFn: async () => {
      const { data } = await supabase
        .from('quality_events')
        .select('quantity')
        .eq('event_type', 'approve')
      return data?.reduce((sum, e) => sum + (e.quantity ?? 0), 0) ?? 0
    },
  })

  // Computações locais
  const openLots = lots.length
  const totalOpenQty = lots.reduce((s, l) => s + l.quantity_open, 0)
  const pendingBlock = lots.filter(l => l.quality_status === 'pending_block').length
  const pendingBlockQty = lots.filter(l => l.quality_status === 'pending_block').reduce((s, l) => s + l.quantity_open, 0)
  const totalInitial = lots.reduce((s, l) => s + l.quantity_initial, 0) + (approvedTotal ?? 0) + (scrapTotal ?? 0)
  const scrapRate = totalInitial > 0 ? ((scrapTotal ?? 0) / totalInitial) * 100 : 0

  // Aging
  const agingBuckets = [
    { label: '0-2 dias', color: '#10b981', min: 0, max: 2, count: 0, qty: 0 },
    { label: '3-5 dias', color: '#f59e0b', min: 3, max: 5, count: 0, qty: 0 },
    { label: '6-10 dias', color: '#f97316', min: 6, max: 10, count: 0, qty: 0 },
    { label: '+10 dias', color: '#ef4444', min: 11, max: Infinity, count: 0, qty: 0 },
  ]
  lots.forEach(l => {
    const days = calcAgingDays(l.opened_at)
    const bucket = agingBuckets.find(b => days >= b.min && days <= b.max)
    if (bucket) { bucket.count++; bucket.qty += l.quantity_open }
  })

  const avgAging = lots.length > 0
    ? lots.reduce((s, l) => s + calcAgingDays(l.opened_at), 0) / lots.length
    : 0
  const oldestAging = lots.length > 0
    ? Math.max(...lots.map(l => calcAgingDays(l.opened_at)))
    : 0

  // Top part numbers
  const pnMap: Record<string, { label: string; qty: number }> = {}
  lots.forEach(l => {
    const pn = l.product_master?.part_number ?? 'N/A'
    if (!pnMap[pn]) pnMap[pn] = { label: pn, qty: 0 }
    pnMap[pn].qty += l.quantity_open
  })
  const topPNs = Object.values(pnMap).sort((a, b) => b.qty - a.qty).slice(0, 10)

  // Lotes sem bloqueio
  const noBlockLots = lots.filter(l => l.quality_status === 'pending_block')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Visão geral dos retrabalhos em andamento</p>
      </div>

      {/* Alerta crítico */}
      {pendingBlock > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-red-500/30 bg-red-500/10">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-400">
              {pendingBlock} lote{pendingBlock > 1 ? 's' : ''} sem bloqueio formal de Qualidade
            </p>
            <p className="text-xs text-muted-foreground">
              {formatQuantity(pendingBlockQty)} peças em retrabalho sem documentação NC/RNC
            </p>
          </div>
        </div>
      )}

      {/* Cards de KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Peças em Retrabalho" value={formatQuantity(totalOpenQty)} icon={Package} />
        <StatCard title="Lotes Abertos" value={openLots} icon={TrendingUp} />
        <StatCard
          title="Sem Bloqueio Qualidade"
          value={pendingBlock}
          icon={AlertCircle}
          variant={pendingBlock > 0 ? 'danger' : 'success'}
        />
        <StatCard
          title="Aging Médio"
          value={`${avgAging.toFixed(1)}d`}
          icon={Clock}
          variant={avgAging > 10 ? 'danger' : avgAging > 5 ? 'warning' : 'default'}
          subtitle={`Mais antigo: ${oldestAging}d`}
        />
        <StatCard title="Taxa de Sucata" value={formatPercent(scrapRate)} icon={Trash2} variant="warning" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Aprovado" value={formatQuantity(approvedTotal ?? 0)} icon={CheckCircle} variant="success" />
        <StatCard title="Total Sucateado" value={formatQuantity(scrapTotal ?? 0)} icon={XCircle} variant="danger" />
      </div>

      {/* Gráficos */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Part Numbers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Part Numbers em Retrabalho</CardTitle>
          </CardHeader>
          <CardContent>
            {topPNs.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">Nenhum dado disponível</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topPNs} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} />
                  <YAxis dataKey="label" type="category" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }} width={80} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(225, 40%, 10%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
                    labelStyle={{ color: 'rgba(255,255,255,0.8)' }}
                    itemStyle={{ color: '#E8291C' }}
                  />
                  <Bar dataKey="qty" name="Qtd Aberta" fill="#E8291C" radius={[0, 4, 4, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Aging por faixa */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Aging por Faixa</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={agingBuckets.filter(b => b.count > 0)}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="count"
                  nameKey="label"
                  label={({ label, count }) => `${label}: ${count}`}
                  labelLine={false}
                >
                  {agingBuckets.map((b, i) => (
                    <Cell key={i} fill={b.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(225, 40%, 10%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-2">
              {agingBuckets.map(b => (
                <div key={b.label} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
                  {b.label}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lotes sem bloqueio */}
      {noBlockLots.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Lotes Sem Bloqueio de Qualidade ({noBlockLots.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs border-b border-border">
                    <th className="text-left pb-2">Lote</th>
                    <th className="text-left pb-2">Part Number</th>
                    <th className="text-left pb-2">Descrição</th>
                    <th className="text-right pb-2">Qtd Aberta</th>
                    <th className="text-right pb-2">Aging</th>
                  </tr>
                </thead>
                <tbody>
                  {noBlockLots.slice(0, 10).map(lot => {
                    const aging = calcAgingDays(lot.opened_at)
                    return (
                      <tr key={lot.id} className="border-b border-border/50 hover:bg-accent/50">
                        <td className="py-2 font-mono text-xs text-primary">{lot.lot_code}</td>
                        <td className="py-2 text-xs">{lot.product_master?.part_number}</td>
                        <td className="py-2 text-xs text-muted-foreground truncate max-w-[200px]">{lot.product_master?.description}</td>
                        <td className="py-2 text-right">{formatQuantity(lot.quantity_open)}</td>
                        <td className="py-2 text-right">
                          <Badge variant={aging > 10 ? 'danger' : aging > 5 ? 'warning' : 'outline'}>
                            {aging}d
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
