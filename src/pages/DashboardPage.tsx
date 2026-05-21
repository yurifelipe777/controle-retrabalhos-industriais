import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  AlertTriangle, Package, Clock, CheckCircle, XCircle, Trash2,
  TrendingUp, AlertCircle, X, Eye, ChevronRight, FlaskConical,
} from 'lucide-react'
import { calcAgingDays, formatDate, formatDateTime, formatQuantity, formatPercent } from '../lib/utils'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, ReferenceLine,
} from 'recharts'
import type { ReworkLot, LotMovement } from '../types'

type QualityEventRow = {
  id: string
  lot_id: string
  event_type: string
  quantity: number | null
  result: string | null
  notes: string | null
  created_at: string
  created_by: string | null
}

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

const EVENT_LABELS: Record<string, string> = {
  initial: 'Entrada', transfer: 'Transferência', reversal: 'Estorno',
  block: 'Bloqueio QLD', unblock: 'Desbloqueio', inspection: 'Inspeção',
  approve: 'Aprovado QLD', reject: 'Reprovado', send_to_scrap: 'Sucata',
}

// ─────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────
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
    default: { color: '#C41414', bg: 'rgba(196,20,20,0.09)', border: 'rgba(196,20,20,0.14)' },
    warning: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.15)' },
    danger:  { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.15)' },
    success: { color: '#22C55E', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.15)' },
  }[variant]

  return (
    <Card className="stat-card-hover cursor-default">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium truncate">{title}</p>
            <p className="text-2xl font-black leading-none" style={{ color: cfg.color }}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground/70 mt-1.5">{subtitle}</p>}
          </div>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
            <Icon className="h-5 w-5" style={{ color: cfg.color }} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────
// Tooltip customizado do gráfico de barras
// ─────────────────────────────────────────────

function AreaTooltip({ active, payload }: { active?: boolean; payload?: { payload: { label: string; dateLabel: string; lot: string; qty: number; qty_in_process: number } }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-border rounded-lg px-3 py-2 text-xs space-y-0.5 shadow-md">
      <p className="text-muted-foreground">{d.dateLabel}</p>
      <p className="text-foreground font-medium">{d.label} — {d.lot}</p>
      <p className="text-emerald-600 font-semibold">{formatQuantity(d.qty_in_process)} pç em processo</p>
    </div>
  )
}

// ─────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────
export default function DashboardPage() {
  const [selectedPN, setSelectedPN] = useState<string | null>(null)

  // ── Queries base ──────────────────────────
  const { data: lots = [], isLoading } = useQuery({
    queryKey: ['dashboard-lots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rework_lots')
        .select(`*, product_master(part_number, description, family), defect_type:defect_types(name)`)
        .not('current_status', 'in', '("closed","cancelled")')
        .order('opened_at', { ascending: false })
      if (error) throw error
      return data as unknown as (ReworkLot & {
        product_master: { part_number: string; description: string; family: string }
        defect_type: { name: string } | null
      })[]
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

  // ── Drilldown (ativado quando PN selecionado) ──
  const drilldownLots = useMemo(
    () => selectedPN ? lots.filter(l => l.product_master?.part_number === selectedPN) : [],
    [selectedPN, lots]
  )
  const drilldownLotIds = useMemo(() => drilldownLots.map(l => l.id), [drilldownLots])

  const { data: drilldownMovements = [], isLoading: movLoading } = useQuery({
    queryKey: ['dash-movements', selectedPN],
    enabled: !!selectedPN && drilldownLotIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('lot_movements')
        .select(`*, from_stage:process_stages!from_stage_id(name), to_stage:process_stages!to_stage_id(name)`)
        .in('lot_id', drilldownLotIds)
        .order('moved_at', { ascending: true })
      return (data ?? []) as unknown as LotMovement[]
    },
  })

  const { data: drilldownQEvents = [], isLoading: qLoading } = useQuery({
    queryKey: ['dash-quality', selectedPN],
    enabled: !!selectedPN && drilldownLotIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('quality_events')
        .select('*')
        .in('lot_id', drilldownLotIds)
        .order('created_at', { ascending: true })
      return (data ?? []) as QualityEventRow[]
    },
  })

  // ── Computações base ──────────────────────
  const openLots = lots.length
  const totalOpenQty = lots.reduce((s, l) => s + l.quantity_open, 0)
  const pendingBlock = lots.filter(l => l.quality_status === 'pending_block').length
  const pendingBlockQty = lots.filter(l => l.quality_status === 'pending_block').reduce((s, l) => s + l.quantity_open, 0)
  const totalInitial = lots.reduce((s, l) => s + l.quantity_initial, 0) + (approvedTotal ?? 0) + (scrapTotal ?? 0)
  const scrapRate = totalInitial > 0 ? ((scrapTotal ?? 0) / totalInitial) * 100 : 0

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

  const avgAging = lots.length > 0 ? lots.reduce((s, l) => s + calcAgingDays(l.opened_at), 0) / lots.length : 0
  const oldestAging = lots.length > 0 ? Math.max(...lots.map(l => calcAgingDays(l.opened_at))) : 0

  const pnMap: Record<string, { label: string; qty: number; descricao: string }> = {}
  lots.forEach(l => {
    const pn = l.product_master?.part_number ?? 'N/A'
    if (!pnMap[pn]) pnMap[pn] = { label: pn, qty: 0, descricao: l.product_master?.description ?? '' }
    pnMap[pn].qty += l.quantity_open
  })
  const topPNs = Object.values(pnMap).sort((a, b) => b.qty - a.qty).slice(0, 10)

  const decapagemLots = lots.filter(l => l.current_status === 'awaiting_decapagem')
  const decapagemQty = decapagemLots.reduce((s, l) => s + l.quantity_open, 0)

  // ── Timeline data (drilldown) ─────────────
  const lotCodeMap = useMemo(
    () => Object.fromEntries(drilldownLots.map(l => [l.id, l.lot_code])),
    [drilldownLots]
  )

  const timelineData = useMemo(() => {
    if (!selectedPN || (drilldownMovements.length === 0 && drilldownQEvents.length === 0)) return []

    type Ev = {
      ts: number
      label: string
      dateLabel: string
      delta: number
      qty: number
      lot: string
      from?: string
      to?: string
      qty_in_process: number
    }
    const events: Omit<Ev, 'qty_in_process'>[] = []

    // Movimentações
    for (const m of drilldownMovements) {
      const ts = new Date(m.moved_at).getTime()
      const from = (m.from_stage as { name: string } | undefined)?.name
      const to = (m.to_stage as { name: string } | undefined)?.name
      const lot = lotCodeMap[m.lot_id] ?? '?'

      let delta = 0
      if (m.movement_type === 'initial') {
        delta = +m.quantity
      } else if (m.movement_type === 'reversal') {
        const orig = drilldownMovements.find(x => x.id === m.reversal_of_movement_id)
        if (orig?.movement_type === 'initial') delta = -m.quantity
      }

      events.push({
        ts,
        label: EVENT_LABELS[m.movement_type] ?? m.movement_type,
        dateLabel: formatDateTime(m.moved_at),
        delta,
        qty: m.quantity,
        lot,
        from: from ?? '—',
        to: to ?? '—',
      })
    }

    // Eventos de qualidade
    for (const qe of drilldownQEvents) {
      const ts = new Date(qe.created_at).getTime()
      const lot = lotCodeMap[qe.lot_id] ?? '?'
      let delta = 0
      if (qe.event_type === 'approve') delta = -(qe.quantity ?? 0)
      else if (qe.event_type === 'send_to_scrap') delta = -(qe.quantity ?? 0)

      events.push({
        ts,
        label: EVENT_LABELS[qe.event_type] ?? qe.event_type,
        dateLabel: formatDateTime(qe.created_at),
        delta,
        qty: qe.quantity ?? 0,
        lot,
      })
    }

    events.sort((a, b) => a.ts - b.ts)

    let cumulative = 0
    return events.map(e => {
      cumulative += e.delta
      return { ...e, qty_in_process: Math.max(0, cumulative) }
    })
  }, [selectedPN, drilldownMovements, drilldownQEvents, lotCodeMap])

  // Métricas do drilldown
  const drilldownQtyTotal = drilldownLots.reduce((s, l) => s + l.quantity_initial, 0)
  const drilldownQtyOpen = drilldownLots.reduce((s, l) => s + l.quantity_open, 0)
  const drilldownAvgAging = drilldownLots.length > 0
    ? drilldownLots.reduce((s, l) => s + calcAgingDays(l.opened_at), 0) / drilldownLots.length
    : 0

  const handleBarClick = (data: { label: string }) => {
    setSelectedPN(prev => (prev === data.label ? null : data.label))
  }

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

      {/* KPIs */}
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

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Total Aprovado" value={formatQuantity(approvedTotal ?? 0)} icon={CheckCircle} variant="success" />
        <StatCard title="Total Sucateado" value={formatQuantity(scrapTotal ?? 0)} icon={XCircle} variant="danger" />
        <StatCard
          title="Em Decapagem"
          value={decapagemLots.length}
          icon={FlaskConical}
          variant="warning"
          subtitle={decapagemLots.length > 0 ? `${formatQuantity(decapagemQty)} pç aguardando retorno` : 'Nenhum lote em decapagem'}
        />
      </div>

      {/* Gráficos */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Bar chart interativo */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Top Part Numbers em Retrabalho</CardTitle>
              {selectedPN && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground gap-1"
                  onClick={() => setSelectedPN(null)}
                >
                  <X className="h-3 w-3" />
                  Limpar filtro
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedPN ? `Filtrando: ${selectedPN}` : 'Clique em uma barra para ver detalhes'}
            </p>
          </CardHeader>
          <CardContent>
            {topPNs.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">Nenhum dado disponível</p>
            ) : (
              <div className="space-y-0.5 mt-1">
                {topPNs.map((entry, index) => {
                  const pct = topPNs[0]?.qty > 0 ? (entry.qty / topPNs[0].qty) * 100 : 0
                  const isSelected = selectedPN === entry.label
                  const isDimmed = selectedPN !== null && !isSelected
                  return (
                    <div
                      key={index}
                      className="rounded-lg px-3 py-2 cursor-pointer transition-all duration-150 hover:bg-accent/50"
                      style={{
                        background: isSelected ? 'rgba(196,20,20,0.06)' : undefined,
                        opacity: isDimmed ? 0.30 : 1,
                      }}
                      onClick={() => handleBarClick(entry)}
                    >
                      <div className="flex items-baseline gap-2 mb-1.5">
                        <span
                          className="font-mono text-[11px] font-semibold shrink-0 transition-colors"
                          style={{ color: isSelected ? '#C41414' : 'hsl(220, 28%, 18%)' }}
                        >
                          {entry.label}
                        </span>
                        <span className="text-[9.5px] text-muted-foreground/60 truncate flex-1">{entry.descricao}</span>
                        <span
                          className="text-[11px] font-bold tabular-nums shrink-0 transition-colors"
                          style={{ color: isSelected ? '#C41414' : 'hsl(220, 12%, 46%)' }}
                        >
                          {formatQuantity(entry.qty)} pç
                        </span>
                      </div>
                      <div className="h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.07)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: isSelected ? 'linear-gradient(90deg, #8B0E0E, #C41414)' : '#C41414',
                            transition: 'width 0.5s ease, background 0.2s ease',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Aging pie */}
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
                  contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid hsl(220, 20%, 90%)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
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

      {/* ── Painel de Drilldown ─────────────────────────────── */}
      {selectedPN && (
        <Card className="border border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base text-primary font-mono">{selectedPN}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {drilldownLots[0]?.product_master?.description ?? ''}
                </p>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>
                    <span className="text-foreground/70 font-medium">{drilldownLots.length}</span> lote{drilldownLots.length !== 1 ? 's' : ''}
                  </span>
                  <span>
                    <span className="text-primary font-medium">{formatQuantity(drilldownQtyOpen)}</span> pç abertas
                  </span>
                  <span>
                    Inicial: <span className="text-foreground/70">{formatQuantity(drilldownQtyTotal)}</span> pç
                  </span>
                  <span>
                    Aging médio: <span className={drilldownAvgAging > 10 ? 'text-red-400' : drilldownAvgAging > 5 ? 'text-amber-400' : 'text-green-400'}>
                      {drilldownAvgAging.toFixed(1)}d
                    </span>
                  </span>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedPN(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Timeline chart */}
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
                Evolução de Peças em Processo
                {(movLoading || qLoading) && (
                  <span className="inline-block w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
                )}
              </p>
              {timelineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={timelineData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C41414" stopOpacity={0.20} />
                        <stop offset="95%" stopColor="#C41414" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 9 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} width={35} />
                    <Tooltip content={<AreaTooltip />} />
                    <ReferenceLine y={0} stroke="rgba(0,0,0,0.08)" />
                    <Area
                      type="stepAfter"
                      dataKey="qty_in_process"
                      name="Em Processo"
                      stroke="#C41414"
                      fill="url(#areaGrad)"
                      strokeWidth={2}
                      dot={timelineData.length <= 20 ? { fill: '#C41414', r: 3, strokeWidth: 0 } : false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : movLoading || qLoading ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground text-xs">
                  Carregando histórico...
                </div>
              ) : (
                <div className="h-24 flex items-center justify-center text-muted-foreground text-xs">
                  Nenhum movimento registrado para este item.
                </div>
              )}
            </div>

            {/* Lotes deste PN */}
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2">Lotes Ativos</p>
              <div className="overflow-x-auto rounded-md border border-border/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-3 py-2">Lote</th>
                      <th className="text-left px-3 py-2">Aberto em</th>
                      <th className="text-left px-3 py-2">Defeito</th>
                      <th className="text-left px-3 py-2">Setor</th>
                      <th className="text-center px-3 py-2">Status</th>
                      <th className="text-center px-3 py-2">Qualidade</th>
                      <th className="text-right px-3 py-2">Inicial</th>
                      <th className="text-right px-3 py-2">Aberto</th>
                      <th className="text-right px-3 py-2">Aging</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {drilldownLots.map(lot => {
                      const aging = calcAgingDays(lot.opened_at)
                      const defect = lot.defect_type as { name: string } | null
                      return (
                        <tr key={lot.id} className="border-b border-border/40 hover:bg-accent/20">
                          <td className="px-3 py-2 font-mono text-primary">{lot.lot_code}</td>
                          <td className="px-3 py-2 text-muted-foreground">{formatDate(lot.opened_at)}</td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">{defect?.name ?? '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{lot.origin_area}</td>
                          <td className="px-3 py-2 text-center">
                            <Badge variant="muted" className="text-xs">{LOT_STATUS_LABELS[lot.current_status]}</Badge>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Badge variant={lot.quality_status === 'pending_block' ? 'danger' : 'muted'} className="text-xs">
                              {QUALITY_STATUS_LABELS[lot.quality_status]}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right">{formatQuantity(lot.quantity_initial)}</td>
                          <td className="px-3 py-2 text-right font-medium text-primary">{formatQuantity(lot.quantity_open)}</td>
                          <td className="px-3 py-2 text-right">
                            <Badge variant={aging > 10 ? 'danger' : aging > 5 ? 'warning' : 'outline'} className="text-xs">
                              {aging}d
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Link to={`/lotes/${lot.id}`}>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <Eye className="h-3 w-3" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Linha do tempo de eventos */}
            {timelineData.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">Linha do Tempo de Eventos</p>
                <div className="overflow-x-auto rounded-md border border-border/50 max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background/95 backdrop-blur-sm">
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left px-3 py-2">Data/Hora</th>
                        <th className="text-left px-3 py-2">Lote</th>
                        <th className="text-left px-3 py-2">Evento</th>
                        <th className="text-left px-3 py-2">De → Para</th>
                        <th className="text-right px-3 py-2">Qtd</th>
                        <th className="text-right px-3 py-2">Em Processo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timelineData.map((ev, i) => (
                        <tr key={i} className="border-b border-border/40 hover:bg-accent/20">
                          <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{ev.dateLabel}</td>
                          <td className="px-3 py-1.5 font-mono text-primary">{ev.lot}</td>
                          <td className="px-3 py-1.5">
                            <span className={
                              ev.delta > 0 ? 'text-emerald-400' :
                              ev.delta < 0 ? 'text-red-400' :
                              'text-muted-foreground'
                            }>
                              {ev.label}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                            {ev.from && ev.to ? (
                              <span className="flex items-center gap-1">
                                {ev.from}
                                <ChevronRight className="h-2.5 w-2.5 shrink-0" />
                                {ev.to}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {ev.qty > 0 ? (
                              <span className={ev.delta > 0 ? 'text-emerald-400' : ev.delta < 0 ? 'text-red-400' : ''}>
                                {ev.delta > 0 ? '+' : ev.delta < 0 ? '-' : ''}{formatQuantity(ev.qty)}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium">
                            {formatQuantity(ev.qty_in_process)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Lista geral de itens em retrabalho ─────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              {selectedPN
                ? `Todos os lotes — ${selectedPN}`
                : `Todos os Itens em Retrabalho (${lots.length})`
              }
            </CardTitle>
            {selectedPN && (
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setSelectedPN(null)}>
                <X className="h-3 w-3" />
                Ver todos
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {lots.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">Nenhum lote ativo no momento.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left px-4 py-2.5">Lote</th>
                    <th className="text-left px-4 py-2.5">Part Number</th>
                    <th className="text-left px-4 py-2.5 hidden lg:table-cell">Descrição</th>
                    <th className="text-left px-4 py-2.5 hidden md:table-cell">Setor</th>
                    <th className="text-left px-4 py-2.5 hidden md:table-cell">Defeito</th>
                    <th className="text-center px-4 py-2.5">Status</th>
                    <th className="text-center px-4 py-2.5">Qualidade</th>
                    <th className="text-right px-4 py-2.5">Inicial</th>
                    <th className="text-right px-4 py-2.5">Aberto</th>
                    <th className="text-right px-4 py-2.5">Aging</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {(selectedPN ? lots.filter(l => l.product_master?.part_number === selectedPN) : lots).map(lot => {
                    const aging = calcAgingDays(lot.opened_at)
                    const defect = lot.defect_type as { name: string } | null
                    const isSelected = selectedPN === lot.product_master?.part_number
                    return (
                      <tr
                        key={lot.id}
                        className={`border-b border-border/40 hover:bg-accent/20 transition-colors cursor-pointer ${
                          selectedPN && !isSelected ? 'opacity-40' : ''
                        } ${isSelected ? 'bg-primary/5' : ''}`}
                        onClick={() => handleBarClick({ label: lot.product_master?.part_number ?? '' })}
                      >
                        <td className="px-4 py-2 font-mono text-primary whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {lot.quality_status === 'pending_block' && (
                              <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />
                            )}
                            {lot.lot_code}
                          </div>
                        </td>
                        <td className="px-4 py-2 font-mono">{lot.product_master?.part_number ?? '—'}</td>
                        <td className="px-4 py-2 text-muted-foreground hidden lg:table-cell max-w-[160px] truncate">
                          {lot.product_master?.description ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{lot.origin_area}</td>
                        <td className="px-4 py-2 text-muted-foreground hidden md:table-cell max-w-[120px] truncate">
                          {defect?.name ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Badge variant="muted" className="text-xs">{LOT_STATUS_LABELS[lot.current_status]}</Badge>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Badge
                            variant={lot.quality_status === 'pending_block' ? 'danger' : 'muted'}
                            className="text-xs"
                          >
                            {QUALITY_STATUS_LABELS[lot.quality_status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-right">{formatQuantity(lot.quantity_initial)}</td>
                        <td className="px-4 py-2 text-right font-medium text-primary">{formatQuantity(lot.quantity_open)}</td>
                        <td className="px-4 py-2 text-right">
                          <Badge variant={aging > 10 ? 'danger' : aging > 5 ? 'warning' : aging > 2 ? 'outline' : 'success'} className="text-xs">
                            {aging}d
                          </Badge>
                        </td>
                        <td className="px-4 py-2" onClick={e => e.stopPropagation()}>
                          <Link to={`/lotes/${lot.id}`}>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <Eye className="h-3 w-3" />
                            </Button>
                          </Link>
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
    </div>
  )
}
