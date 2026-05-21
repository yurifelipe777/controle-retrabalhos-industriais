import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import {
  AlertTriangle, Package, Clock, CheckCircle, XCircle, Trash2,
  TrendingUp, AlertCircle, X, Eye, ChevronRight, FlaskConical, ExternalLink,
  MapPin, Tag, Layers, Activity, Zap, Target,
} from 'lucide-react'
import { calcAgingDays, formatDate, formatDateTime, formatQuantity, formatPercent } from '../lib/utils'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, ReferenceLine,
  LineChart, Line, Legend, BarChart, Bar,
} from 'recharts'
import type { ReworkLot, LotMovement } from '../types'

// ─── Types ────────────────────────────────────────────────────
type QualityEventRow = {
  id: string; lot_id: string; event_type: string
  quantity: number | null; result: string | null
  notes: string | null; created_at: string; created_by: string | null
}
type DrillCard = 'rework' | 'lots' | 'pending_block' | 'aging' | 'decapagem' | null

// ─── Label maps ───────────────────────────────────────────────
const LOT_STATUS_LABELS: Record<string, string> = {
  open: 'Aberto', in_rework: 'Em Retrabalho', awaiting_quality: 'Aguard. Qualidade',
  partially_approved: 'Parc. Aprovado', approved: 'Aprovado',
  partially_scrapped: 'Parc. Sucateado', scrapped: 'Sucateado',
  closed: 'Encerrado', cancelled: 'Cancelado', awaiting_decapagem: 'Em Decapagem',
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

// ─── StatCard ─────────────────────────────────────────────────
function StatCard({
  title, value, icon: Icon, variant = 'default', subtitle, onClick,
}: {
  title: string; value: string | number; icon: React.ElementType
  variant?: 'default' | 'warning' | 'danger' | 'success'; subtitle?: string
  onClick?: () => void
}) {
  const cfg = {
    default: { color: '#C41414', bg: 'rgba(196,20,20,0.09)', border: 'rgba(196,20,20,0.14)' },
    warning: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.15)' },
    danger:  { color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.15)' },
    success: { color: '#22C55E', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.15)' },
  }[variant]
  return (
    <Card
      className={`stat-card-hover ${onClick ? 'cursor-pointer hover:shadow-md hover:border-primary/30 transition-shadow' : 'cursor-default'}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium truncate">{title}</p>
            <p className="text-2xl font-black leading-none" style={{ color: cfg.color }}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground/70 mt-1.5">{subtitle}</p>}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
              <Icon className="h-5 w-5" style={{ color: cfg.color }} />
            </div>
            {onClick && <span className="text-[9px] text-muted-foreground/50 font-medium">ver detalhes</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── HBar (generic horizontal bar row) ────────────────────────
function HBar({
  label, value, maxValue, total, sublabel, color = '#C41414', rank,
}: {
  label: string; value: number; maxValue: number; total: number
  sublabel?: string; color?: string; rank?: number
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0
  const share = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="group rounded-lg px-3 py-2.5 hover:bg-accent/40 transition-colors">
      <div className="flex items-baseline gap-2 mb-1.5">
        {rank !== undefined && (
          <span className="text-[9px] font-bold w-4 text-center text-muted-foreground/50 shrink-0">#{rank}</span>
        )}
        <span className="text-xs font-semibold text-foreground truncate flex-1">{label}</span>
        {sublabel && <span className="text-[10px] text-muted-foreground/60 hidden group-hover:block shrink-0">{sublabel}</span>}
        <span className="text-[11px] font-bold tabular-nums shrink-0" style={{ color }}>
          {formatQuantity(value)} pç
        </span>
        <span className="text-[10px] text-muted-foreground/60 shrink-0 w-9 text-right">{share.toFixed(0)}%</span>
      </div>
      <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.07)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}cc, ${color})` }}
        />
      </div>
    </div>
  )
}

// ─── AreaTooltip ──────────────────────────────────────────────
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

// ─── Score Badge ──────────────────────────────────────────────
function HealthBadge({ score }: { score: number }) {
  const { color, bg, label } = score >= 80
    ? { color: '#16a34a', bg: 'rgba(22,163,74,0.1)', label: 'Situação Controlada' }
    : score >= 60
    ? { color: '#d97706', bg: 'rgba(217,119,6,0.1)', label: 'Requer Atenção' }
    : { color: '#dc2626', bg: 'rgba(220,38,38,0.1)', label: 'Situação Crítica' }
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border" style={{ background: bg, borderColor: color + '40' }}>
      <div>
        <span className="text-3xl font-black tabular-nums" style={{ color }}>{score}</span>
        <span className="text-xs font-semibold ml-0.5" style={{ color: color + 'cc' }}>/100</span>
      </div>
      <div>
        <p className="text-xs font-bold" style={{ color }}>{label}</p>
        <p className="text-[10px] text-muted-foreground">Índice de Saúde Operacional</p>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────
export default function DashboardPage() {
  const [selectedPN, setSelectedPN] = useState<string | null>(null)
  const [drillCard, setDrillCard] = useState<DrillCard>(null)

  // ── Queries ───────────────────────────────────────────────
  const { data: lots = [], isLoading } = useQuery({
    queryKey: ['dashboard-lots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rework_lots')
        .select('*, product_master(part_number, description, family, material_type), defect_type:defect_types(name)')
        .not('current_status', 'in', '("closed","cancelled")')
        .order('opened_at', { ascending: false })
      if (error) throw error
      return data as unknown as (ReworkLot & {
        product_master: { part_number: string; description: string; family: string | null; material_type: string | null }
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
      const { data } = await supabase.from('quality_events').select('quantity').eq('event_type', 'approve')
      return data?.reduce((sum, e) => sum + (e.quantity ?? 0), 0) ?? 0
    },
  })

  const { data: stageBalances = [] } = useQuery({
    queryKey: ['stage-balances'],
    queryFn: async () => {
      const { data } = await supabase
        .from('lot_stage_balances')
        .select('stage_id, balance_quantity, stage:process_stages(name, sequence)')
        .gt('balance_quantity', 0)
      return (data ?? []) as { stage_id: string; balance_quantity: number; stage: { name: string; sequence: number } | null }[]
    },
    staleTime: 30_000,
  })

  const sixtyDaysAgo = useMemo(() => new Date(Date.now() - 60 * 86_400_000).toISOString(), [])

  const { data: trendLots = [] } = useQuery({
    queryKey: ['trend-lots'],
    queryFn: async () => {
      const { data } = await supabase
        .from('rework_lots').select('quantity_initial, opened_at').gte('opened_at', sixtyDaysAgo)
      return (data ?? []) as { quantity_initial: number; opened_at: string }[]
    },
    staleTime: 60_000,
  })

  const { data: trendQuality = [] } = useQuery({
    queryKey: ['trend-quality'],
    queryFn: async () => {
      const { data } = await supabase
        .from('quality_events').select('event_type, quantity, created_at')
        .in('event_type', ['approve', 'send_to_scrap']).gte('created_at', sixtyDaysAgo)
      return (data ?? []) as { event_type: string; quantity: number | null; created_at: string }[]
    },
    staleTime: 60_000,
  })

  // ── PN Drilldown queries (existing) ───────────────────────
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
        .select('*, from_stage:process_stages!from_stage_id(name), to_stage:process_stages!to_stage_id(name)')
        .in('lot_id', drilldownLotIds).order('moved_at', { ascending: true })
      return (data ?? []) as unknown as LotMovement[]
    },
  })

  const { data: drilldownQEvents = [], isLoading: qLoading } = useQuery({
    queryKey: ['dash-quality', selectedPN],
    enabled: !!selectedPN && drilldownLotIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('quality_events').select('*')
        .in('lot_id', drilldownLotIds).order('created_at', { ascending: true })
      return (data ?? []) as QualityEventRow[]
    },
  })

  // ── Base computations ─────────────────────────────────────
  const decapagemLots = lots.filter(l => l.current_status === 'awaiting_decapagem')
  const decapagemQty  = decapagemLots.reduce((s, l) => s + l.quantity_open, 0)
  const reworkLots    = lots.filter(l => l.current_status !== 'awaiting_decapagem')

  const openLots      = reworkLots.length
  const totalOpenQty  = reworkLots.reduce((s, l) => s + l.quantity_open, 0)
  const pendingBlock  = reworkLots.filter(l => l.quality_status === 'pending_block').length
  const pendingBlockQty = reworkLots.filter(l => l.quality_status === 'pending_block').reduce((s, l) => s + l.quantity_open, 0)
  const totalInitial  = lots.reduce((s, l) => s + l.quantity_initial, 0) + (approvedTotal ?? 0) + (scrapTotal ?? 0)
  const scrapRate     = totalInitial > 0 ? ((scrapTotal ?? 0) / totalInitial) * 100 : 0
  const approvalRate  = (approvedTotal ?? 0) + (scrapTotal ?? 0) > 0
    ? ((approvedTotal ?? 0) / ((approvedTotal ?? 0) + (scrapTotal ?? 0))) * 100 : 0

  const avgAging      = reworkLots.length > 0 ? reworkLots.reduce((s, l) => s + calcAgingDays(l.opened_at), 0) / reworkLots.length : 0
  const oldestAging   = reworkLots.length > 0 ? Math.max(...reworkLots.map(l => calcAgingDays(l.opened_at))) : 0

  // ── Executive analytics (new) ─────────────────────────────
  const areaData = useMemo(() => {
    const map: Record<string, { qty: number; lots: number; aging_sum: number }> = {}
    reworkLots.forEach(l => {
      if (!map[l.origin_area]) map[l.origin_area] = { qty: 0, lots: 0, aging_sum: 0 }
      map[l.origin_area].qty += l.quantity_open
      map[l.origin_area].lots++
      map[l.origin_area].aging_sum += calcAgingDays(l.opened_at)
    })
    return Object.entries(map)
      .map(([area, d]) => ({ area, ...d, avg_aging: d.lots > 0 ? d.aging_sum / d.lots : 0 }))
      .sort((a, b) => b.qty - a.qty)
  }, [reworkLots])

  const defectData = useMemo(() => {
    const map: Record<string, { name: string; qty: number; lots: number }> = {}
    reworkLots.forEach(l => {
      const name = (l.defect_type as { name: string } | null)?.name ?? 'Não especificado'
      const key  = l.defect_type_id ?? '__none'
      if (!map[key]) map[key] = { name, qty: 0, lots: 0 }
      map[key].qty += l.quantity_open
      map[key].lots++
    })
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 8)
  }, [reworkLots])

  const familyData = useMemo(() => {
    const map: Record<string, { qty: number; lots: number }> = {}
    reworkLots.forEach(l => {
      const family = l.product_master?.family ?? 'Sem família'
      if (!map[family]) map[family] = { qty: 0, lots: 0 }
      map[family].qty += l.quantity_open
      map[family].lots++
    })
    return Object.entries(map).map(([family, d]) => ({ family, ...d })).sort((a, b) => b.qty - a.qty)
  }, [reworkLots])

  const stageData = useMemo(() => {
    const map: Record<string, { name: string; sequence: number; qty: number }> = {}
    stageBalances.forEach(b => {
      if (!b.stage) return
      if (!map[b.stage_id]) map[b.stage_id] = { name: b.stage.name, sequence: b.stage.sequence, qty: 0 }
      map[b.stage_id].qty += b.balance_quantity
    })
    return Object.values(map).filter(s => s.qty > 0).sort((a, b) => a.sequence - b.sequence)
  }, [stageBalances])

  const weeklyTrend = useMemo(() => {
    const weeks: Record<string, { label: string; entered: number; approved: number; scrapped: number }> = {}
    const getKey = (dateStr: string) => {
      const d = new Date(dateStr)
      const mon = new Date(d)
      mon.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1))
      return mon.toISOString().slice(0, 10)
    }
    const fmtKey = (key: string) => {
      const d = new Date(key + 'T12:00:00Z')
      return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
    }
    trendLots.forEach(l => {
      const k = getKey(l.opened_at)
      if (!weeks[k]) weeks[k] = { label: fmtKey(k), entered: 0, approved: 0, scrapped: 0 }
      weeks[k].entered += l.quantity_initial
    })
    trendQuality.forEach(e => {
      const k = getKey(e.created_at)
      if (!weeks[k]) weeks[k] = { label: fmtKey(k), entered: 0, approved: 0, scrapped: 0 }
      if (e.event_type === 'approve')       weeks[k].approved += e.quantity ?? 0
      if (e.event_type === 'send_to_scrap') weeks[k].scrapped += e.quantity ?? 0
    })
    return Object.entries(weeks).sort(([a],[b]) => a.localeCompare(b)).slice(-8).map(([,v]) => v)
  }, [trendLots, trendQuality])

  const insights = useMemo(() => {
    type Lvl = 'critical' | 'warning' | 'success' | 'info'
    const list: { level: Lvl; text: string }[] = []

    if (pendingBlock > 0)
      list.push({ level: 'critical', text: `${pendingBlock} lote${pendingBlock > 1 ? 's' : ''} sem bloqueio formal de Qualidade — documentação NC/RNC pendente` })

    const criticalAging = reworkLots.filter(l => calcAgingDays(l.opened_at) > 15)
    if (criticalAging.length > 0)
      list.push({ level: 'critical', text: `${criticalAging.length} lote${criticalAging.length > 1 ? 's' : ''} com mais de 15 dias em aberto — risco de impacto na produção` })

    if (areaData.length > 0) {
      const top = areaData[0]
      const pct = totalOpenQty > 0 ? top.qty / totalOpenQty * 100 : 0
      list.push({
        level: pct > 50 ? 'critical' : pct > 30 ? 'warning' : 'info',
        text: `${top.area} é o setor com mais retrabalho: ${formatQuantity(top.qty)} pç (${pct.toFixed(0)}% do total) — ${top.lots} lote${top.lots > 1 ? 's' : ''}, aging médio ${top.avg_aging.toFixed(1)}d`,
      })
    }

    if (defectData.length > 0) {
      const top = defectData[0]
      const pct = totalOpenQty > 0 ? top.qty / totalOpenQty * 100 : 0
      list.push({ level: 'warning', text: `Defeito mais recorrente: "${top.name}" — ${formatQuantity(top.qty)} pç (${pct.toFixed(0)}%), ${top.lots} lote${top.lots > 1 ? 's' : ''}` })
    }

    if (decapagemLots.length > 0)
      list.push({ level: 'warning', text: `${formatQuantity(decapagemQty)} pç aguardando retorno de decapagem externa (${decapagemLots.length} lotes) — custo adicional de processo` })

    if (approvalRate >= 90)
      list.push({ level: 'success', text: `Excelente taxa de aprovação: ${approvalRate.toFixed(1)}% — processo de retrabalho eficiente` })
    else if (approvalRate >= 75)
      list.push({ level: 'info', text: `Taxa de aprovação: ${approvalRate.toFixed(1)}% — aceitável, mas há espaço para melhoria` })
    else if (approvalRate > 0)
      list.push({ level: 'warning', text: `Taxa de aprovação abaixo de 75% (${approvalRate.toFixed(1)}%) — revisar método e critério de retrabalho` })

    if (familyData.length > 0) {
      const top = familyData[0]
      const pct = totalOpenQty > 0 ? top.qty / totalOpenQty * 100 : 0
      if (pct > 60)
        list.push({ level: 'info', text: `Família "${top.family}" domina o retrabalho: ${pct.toFixed(0)}% das peças — investigar causa raiz desta linha de produto` })
    }

    return list
  }, [pendingBlock, reworkLots, areaData, defectData, decapagemLots, decapagemQty, approvalRate, totalOpenQty, familyData])

  const healthScore = useMemo(() => {
    let score = 100
    if (pendingBlock > 0)  score -= Math.min(20, pendingBlock * 5)
    score -= Math.min(20, scrapRate * 1.5)
    score -= avgAging > 10 ? 15 : avgAging > 7 ? 10 : avgAging > 5 ? 5 : 0
    const old = reworkLots.filter(l => calcAgingDays(l.opened_at) > 15).length
    score -= Math.min(15, old * 3)
    if (decapagemLots.length > 0) score -= Math.min(10, decapagemLots.length * 2)
    return Math.max(0, Math.round(score))
  }, [pendingBlock, scrapRate, avgAging, reworkLots, decapagemLots])

  // ── Card drilldown ────────────────────────────────────────
  const cardDrillData = useMemo(() => {
    if (!drillCard) return []
    if (drillCard === 'rework')        return reworkLots
    if (drillCard === 'lots')          return reworkLots
    if (drillCard === 'pending_block') return reworkLots.filter(l => l.quality_status === 'pending_block')
    if (drillCard === 'aging')         return [...reworkLots].sort((a, b) => calcAgingDays(b.opened_at) - calcAgingDays(a.opened_at))
    if (drillCard === 'decapagem')     return decapagemLots
    return []
  }, [drillCard, reworkLots, decapagemLots])

  const CARD_DRILL_TITLES: Record<NonNullable<DrillCard>, string> = {
    rework: 'Peças em Retrabalho — Detalhe por Lote',
    lots: 'Lotes Abertos — Detalhe Completo',
    pending_block: 'Lotes sem Bloqueio Formal de Qualidade',
    aging: 'Lotes por Aging (mais antigos primeiro)',
    decapagem: 'Lotes em Decapagem Externa',
  }

  // ── Aging buckets ─────────────────────────────────────────
  const agingBuckets = [
    { label: '0-2 dias', color: '#10b981', min: 0, max: 2,  count: 0, qty: 0 },
    { label: '3-5 dias', color: '#f59e0b', min: 3, max: 5,  count: 0, qty: 0 },
    { label: '6-10 dias',color: '#f97316', min: 6, max: 10, count: 0, qty: 0 },
    { label: '+10 dias', color: '#ef4444', min: 11,max: Infinity, count: 0, qty: 0 },
  ]
  reworkLots.forEach(l => {
    const days = calcAgingDays(l.opened_at)
    const b = agingBuckets.find(b => days >= b.min && days <= b.max)
    if (b) { b.count++; b.qty += l.quantity_open }
  })

  // ── PN bar chart ──────────────────────────────────────────
  const pnMap: Record<string, { label: string; qty: number; descricao: string }> = {}
  lots.forEach(l => {
    const pn = l.product_master?.part_number ?? 'N/A'
    if (!pnMap[pn]) pnMap[pn] = { label: pn, qty: 0, descricao: l.product_master?.description ?? '' }
    pnMap[pn].qty += l.quantity_open
  })
  const topPNs = Object.values(pnMap).sort((a, b) => b.qty - a.qty).slice(0, 10)

  // ── PN timeline (existing) ────────────────────────────────
  const lotCodeMap = useMemo(
    () => Object.fromEntries(drilldownLots.map(l => [l.id, l.lot_code])),
    [drilldownLots]
  )
  const drilldownQtyTotal = drilldownLots.reduce((s, l) => s + l.quantity_initial, 0)
  const drilldownQtyOpen  = drilldownLots.reduce((s, l) => s + l.quantity_open, 0)
  const drilldownAvgAging = drilldownLots.length > 0
    ? drilldownLots.reduce((s, l) => s + calcAgingDays(l.opened_at), 0) / drilldownLots.length : 0

  const timelineData = useMemo(() => {
    if (!selectedPN || (drilldownMovements.length === 0 && drilldownQEvents.length === 0)) return []
    type Ev = { ts: number; label: string; dateLabel: string; delta: number; qty: number; lot: string; from?: string; to?: string; qty_in_process: number }
    const events: Omit<Ev, 'qty_in_process'>[] = []
    for (const m of drilldownMovements) {
      const ts   = new Date(m.moved_at).getTime()
      const from = (m.from_stage as { name: string } | undefined)?.name
      const to   = (m.to_stage   as { name: string } | undefined)?.name
      const lot  = lotCodeMap[m.lot_id] ?? '?'
      let delta  = 0
      if (m.movement_type === 'initial') delta = +m.quantity
      else if (m.movement_type === 'reversal') {
        const orig = drilldownMovements.find(x => x.id === m.reversal_of_movement_id)
        if (orig?.movement_type === 'initial') delta = -m.quantity
      }
      events.push({ ts, label: EVENT_LABELS[m.movement_type] ?? m.movement_type, dateLabel: formatDateTime(m.moved_at), delta, qty: m.quantity, lot, from: from ?? '—', to: to ?? '—' })
    }
    for (const qe of drilldownQEvents) {
      const ts  = new Date(qe.created_at).getTime()
      const lot = lotCodeMap[qe.lot_id] ?? '?'
      let delta = 0
      if (qe.event_type === 'approve')       delta = -(qe.quantity ?? 0)
      else if (qe.event_type === 'send_to_scrap') delta = -(qe.quantity ?? 0)
      events.push({ ts, label: EVENT_LABELS[qe.event_type] ?? qe.event_type, dateLabel: formatDateTime(qe.created_at), delta, qty: qe.quantity ?? 0, lot })
    }
    events.sort((a, b) => a.ts - b.ts)
    let cumulative = 0
    return events.map(e => { cumulative += e.delta; return { ...e, qty_in_process: Math.max(0, cumulative) } })
  }, [selectedPN, drilldownMovements, drilldownQEvents, lotCodeMap])

  const handleBarClick = (data: { label: string }) => setSelectedPN(prev => prev === data.label ? null : data.label)

  // ── Render ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const stageTotal = stageData.reduce((s, d) => s + d.qty, 0)
  const areaMax    = areaData[0]?.qty ?? 1
  const defectMax  = defectData[0]?.qty ?? 1
  const familyMax  = familyData[0]?.qty ?? 1

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Executivo</h1>
          <p className="text-muted-foreground text-sm">Análise em tempo real para tomada de decisão</p>
        </div>
        <HealthBadge score={healthScore} />
      </div>

      {/* ── Insights automáticos ────────────────────────────── */}
      {insights.length > 0 && (
        <div className="rounded-xl border border-border bg-white p-4 space-y-2 card-shadow">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            DIAGNÓSTICO AUTOMÁTICO — {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {insights.map((ins, i) => {
              const cfg = ins.level === 'critical'
                ? 'bg-red-50 border-red-200 text-red-700'
                : ins.level === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : ins.level === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-blue-50 border-blue-200 text-blue-700'
              const dot = ins.level === 'critical' ? 'bg-red-500' : ins.level === 'warning' ? 'bg-amber-500' : ins.level === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
              return (
                <div key={i} className={`flex gap-2 items-start rounded-lg border px-3 py-2 text-xs ${cfg}`}>
                  <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                  <span>{ins.text}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── KPI Row 1 ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Peças em Retrabalho" value={formatQuantity(totalOpenQty)} icon={Package}
          onClick={() => setDrillCard('rework')} />
        <StatCard title="Lotes Abertos" value={openLots} icon={TrendingUp}
          onClick={() => setDrillCard('lots')} />
        <StatCard title="Sem Bloqueio Qualidade" value={pendingBlock} icon={AlertCircle}
          variant={pendingBlock > 0 ? 'danger' : 'success'}
          onClick={pendingBlock > 0 ? () => setDrillCard('pending_block') : undefined} />
        <StatCard title="Aging Médio" value={`${avgAging.toFixed(1)}d`} icon={Clock}
          variant={avgAging > 10 ? 'danger' : avgAging > 5 ? 'warning' : 'default'}
          subtitle={`Mais antigo: ${oldestAging}d`}
          onClick={() => setDrillCard('aging')} />
        <StatCard title="Taxa de Sucata" value={formatPercent(scrapRate)} icon={Trash2} variant="warning" />
      </div>

      {/* ── KPI Row 2 ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Aprovado" value={formatQuantity(approvedTotal ?? 0)} icon={CheckCircle} variant="success" />
        <StatCard title="Total Sucateado" value={formatQuantity(scrapTotal ?? 0)} icon={XCircle} variant="danger" />
        <StatCard title="Em Decapagem Externa" value={decapagemLots.length} icon={FlaskConical} variant="warning"
          subtitle={decapagemLots.length > 0 ? `${formatQuantity(decapagemQty)} pç aguardando` : 'Nenhum lote'}
          onClick={decapagemLots.length > 0 ? () => setDrillCard('decapagem') : undefined} />
        <StatCard title="Taxa de Aprovação" value={formatPercent(approvalRate)}
          icon={Target}
          variant={approvalRate >= 90 ? 'success' : approvalRate >= 75 ? 'default' : 'warning'}
          subtitle={`De ${formatQuantity((approvedTotal ?? 0) + (scrapTotal ?? 0))} pç processadas`} />
      </div>

      {/* ── Card Drilldown Dialog ──────────────────────────── */}
      <Dialog open={drillCard !== null} onOpenChange={open => { if (!open) setDrillCard(null) }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-sm font-semibold">
              {drillCard ? CARD_DRILL_TITLES[drillCard] : ''}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {cardDrillData.length} lote{cardDrillData.length !== 1 ? 's' : ''} —{' '}
              {formatQuantity(cardDrillData.reduce((s, l) => s + l.quantity_open, 0))} pç abertas
            </p>
          </DialogHeader>
          <div className="overflow-auto flex-1">
            {cardDrillData.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">Nenhum lote nesta categoria.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left px-3 py-2.5">Lote</th>
                    <th className="text-left px-3 py-2.5">Part Number</th>
                    <th className="text-left px-3 py-2.5 hidden md:table-cell">Descrição</th>
                    <th className="text-left px-3 py-2.5 hidden md:table-cell">Setor</th>
                    <th className="text-left px-3 py-2.5 hidden md:table-cell">Defeito</th>
                    <th className="text-center px-3 py-2.5">Status</th>
                    <th className="text-center px-3 py-2.5">Qualidade</th>
                    <th className="text-right px-3 py-2.5">Inicial</th>
                    <th className="text-right px-3 py-2.5">Aberto</th>
                    <th className="text-right px-3 py-2.5">Aging</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {cardDrillData.map(lot => {
                    const aging  = calcAgingDays(lot.opened_at)
                    const defect = lot.defect_type as { name: string } | null
                    return (
                      <tr key={lot.id} className="border-b border-border/40 hover:bg-accent/20">
                        <td className="px-3 py-2 font-mono text-primary whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {lot.quality_status === 'pending_block' && <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />}
                            {lot.lot_code}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono">{lot.product_master?.part_number ?? '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden md:table-cell max-w-[160px] truncate">{lot.product_master?.description ?? '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{lot.origin_area}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden md:table-cell max-w-[120px] truncate">{defect?.name ?? '—'}</td>
                        <td className="px-3 py-2 text-center"><Badge variant="muted" className="text-xs">{LOT_STATUS_LABELS[lot.current_status] ?? lot.current_status}</Badge></td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant={lot.quality_status === 'pending_block' ? 'danger' : 'muted'} className="text-xs">
                            {QUALITY_STATUS_LABELS[lot.quality_status] ?? lot.quality_status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">{formatQuantity(lot.quantity_initial)}</td>
                        <td className="px-3 py-2 text-right font-medium text-primary">{formatQuantity(lot.quantity_open)}</td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant={aging > 10 ? 'danger' : aging > 5 ? 'warning' : aging > 2 ? 'outline' : 'success'} className="text-xs">{aging}d</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Link to={`/lotes/${lot.id}`} onClick={() => setDrillCard(null)}>
                            <Button variant="ghost" size="icon" className="h-6 w-6"><ExternalLink className="h-3 w-3" /></Button>
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── SEÇÃO: ONDE ESTÁ O PROBLEMA? ────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-4 h-[2px] bg-primary inline-block rounded" />
          Onde está o problema?
        </p>
        <div className="grid lg:grid-cols-5 gap-4">

          {/* Por Área */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm">Retrabalho por Setor de Origem</CardTitle>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Qual setor gera mais retrabalho?</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              {areaData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sem dados</p>
              ) : (
                <div className="space-y-0.5">
                  {areaData.map((d, i) => (
                    <div key={d.area}>
                      <HBar
                        label={d.area}
                        value={d.qty}
                        maxValue={areaMax}
                        total={totalOpenQty}
                        sublabel={`${d.lots} lotes • aging médio ${d.avg_aging.toFixed(1)}d`}
                        color={i === 0 ? '#C41414' : i === 1 ? '#F59E0B' : i === 2 ? '#F97316' : '#6B7280'}
                        rank={i + 1}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Por Defeito */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                  <Tag className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-sm">Tipos de Defeito</CardTitle>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Quais defeitos mais impactam?</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              {defectData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sem dados</p>
              ) : (
                <div className="space-y-0.5">
                  {defectData.map((d, i) => (
                    <HBar
                      key={d.name}
                      label={d.name}
                      value={d.qty}
                      maxValue={defectMax}
                      total={totalOpenQty}
                      sublabel={`${d.lots} lotes`}
                      color={i === 0 ? '#C41414' : i === 1 ? '#F59E0B' : '#6B7280'}
                      rank={i + 1}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── SEÇÃO: ONDE ESTÃO AS PEÇAS AGORA? ───────────────── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-4 h-[2px] bg-primary inline-block rounded" />
          Distribuição atual do estoque em processo
        </p>
        <div className="grid lg:grid-cols-2 gap-4">

          {/* Por Etapa */}
          <Card>
            <CardHeader className="pb-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                  <Layers className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-sm">Peças por Etapa de Processo</CardTitle>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Onde estão as peças agora?</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {stageData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sem saldo registrado</p>
              ) : (
                <div className="space-y-2">
                  {stageData.map((s, i) => {
                    const pct = stageTotal > 0 ? (s.qty / stageTotal) * 100 : 0
                    const colors = ['#3B82F6','#8B5CF6','#EC4899','#F97316','#14B8A6','#C41414','#84CC16']
                    const color  = colors[i % colors.length]
                    return (
                      <div key={s.name} className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-xs text-foreground truncate">{s.name}</span>
                        </div>
                        <div className="w-28 h-2.5 rounded-full overflow-hidden shrink-0" style={{ background: 'rgba(0,0,0,0.06)' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <span className="text-xs font-bold tabular-nums w-16 text-right" style={{ color }}>
                          {formatQuantity(s.qty)} pç
                        </span>
                        <span className="text-[10px] text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
                      </div>
                    )
                  })}
                  <div className="pt-1 border-t border-border mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>Total rastreado</span>
                    <span className="font-semibold text-foreground">{formatQuantity(stageTotal)} pç</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Por Família */}
          <Card>
            <CardHeader className="pb-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
                  <Activity className="h-3.5 w-3.5 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-sm">Por Família de Produto</CardTitle>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Qual família de produto mais impacta?</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              {familyData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sem dados de família</p>
              ) : (
                <div className="space-y-0.5">
                  {familyData.map((d, i) => (
                    <HBar
                      key={d.family}
                      label={d.family}
                      value={d.qty}
                      maxValue={familyMax}
                      total={totalOpenQty}
                      sublabel={`${d.lots} lotes`}
                      color={i === 0 ? '#8B5CF6' : i === 1 ? '#3B82F6' : '#6B7280'}
                      rank={i + 1}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── SEÇÃO: EFICIÊNCIA E TENDÊNCIA ────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-4 h-[2px] bg-primary inline-block rounded" />
          Eficiência e evolução histórica
        </p>
        <div className="grid lg:grid-cols-5 gap-4">

          {/* Tendência Semanal */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tendência Semanal — Últimas 8 Semanas</CardTitle>
              <p className="text-[10px] text-muted-foreground">A situação está melhorando?</p>
            </CardHeader>
            <CardContent>
              {weeklyTrend.length < 2 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Dados insuficientes (< 2 semanas)</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weeklyTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} width={35} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid hsl(220,20%,90%)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 11 }}
                      formatter={(v: number, name: string) => [
                        `${formatQuantity(v)} pç`,
                        name === 'entered' ? 'Entradas' : name === 'approved' ? 'Aprovadas' : 'Sucatadas',
                      ]}
                    />
                    <Legend formatter={(v) => v === 'entered' ? 'Entradas' : v === 'approved' ? 'Aprovadas' : 'Sucatadas'} iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="entered"  fill="#C41414" opacity={0.85} radius={[3,3,0,0]} />
                    <Bar dataKey="approved" fill="#22C55E" opacity={0.85} radius={[3,3,0,0]} />
                    <Bar dataKey="scrapped" fill="#EF4444" opacity={0.7}  radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Eficiência */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Eficiência do Processo</CardTitle>
              <p className="text-[10px] text-muted-foreground">Resultado acumulado de todo o histórico</p>
            </CardHeader>
            <CardContent className="space-y-3 pt-1">
              {/* Funnel visual */}
              <div className="space-y-2">
                {[
                  { label: 'Total entrado em retrabalho', value: totalInitial, color: '#6B7280', pct: 100 },
                  { label: 'Em processo agora', value: totalOpenQty + decapagemQty, color: '#C41414', pct: totalInitial > 0 ? ((totalOpenQty + decapagemQty) / totalInitial * 100) : 0 },
                  { label: 'Aprovadas e liberadas', value: approvedTotal ?? 0, color: '#22C55E', pct: totalInitial > 0 ? ((approvedTotal ?? 0) / totalInitial * 100) : 0 },
                  { label: 'Sucateadas', value: scrapTotal ?? 0, color: '#EF4444', pct: totalInitial > 0 ? ((scrapTotal ?? 0) / totalInitial * 100) : 0 },
                ].map(row => (
                  <div key={row.label}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground">{row.label}</span>
                      <span className="text-xs font-bold tabular-nums" style={{ color: row.color }}>
                        {formatQuantity(row.value)} <span className="text-[9px] font-normal text-muted-foreground">({row.pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${row.pct}%`, background: row.color }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Taxa de aprovação */}
              <div className="rounded-lg p-3 border" style={{
                background: approvalRate >= 90 ? 'rgba(34,197,94,0.07)' : approvalRate >= 75 ? 'rgba(196,20,20,0.05)' : 'rgba(239,68,68,0.07)',
                borderColor: approvalRate >= 90 ? 'rgba(34,197,94,0.2)' : approvalRate >= 75 ? 'rgba(196,20,20,0.15)' : 'rgba(239,68,68,0.2)',
              }}>
                <p className="text-[10px] text-muted-foreground mb-1">Taxa de aprovação (aprovadas / processadas)</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black" style={{ color: approvalRate >= 90 ? '#16a34a' : approvalRate >= 75 ? '#C41414' : '#dc2626' }}>
                    {approvalRate.toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {approvalRate >= 90 ? 'Excelente' : approvalRate >= 75 ? 'Aceitável' : 'Abaixo do esperado'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── SEÇÃO: TOP PART NUMBERS (interativo) ─────────────── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-4 h-[2px] bg-primary inline-block rounded" />
          Análise por Part Number
        </p>
        <div className="grid lg:grid-cols-2 gap-6">

          {/* PN Bar chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Top Part Numbers em Retrabalho</CardTitle>
                {selectedPN && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground gap-1" onClick={() => setSelectedPN(null)}>
                    <X className="h-3 w-3" /> Limpar
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedPN ? `Filtrando: ${selectedPN}` : 'Clique para ver histórico de movimentações'}
              </p>
            </CardHeader>
            <CardContent>
              {topPNs.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">Nenhum dado</p>
              ) : (
                <div className="space-y-0.5 mt-1">
                  {topPNs.map((entry, index) => {
                    const pct       = topPNs[0]?.qty > 0 ? (entry.qty / topPNs[0].qty) * 100 : 0
                    const isSelected = selectedPN === entry.label
                    const isDimmed   = selectedPN !== null && !isSelected
                    return (
                      <div
                        key={index}
                        className="rounded-lg px-3 py-2 cursor-pointer transition-all duration-150 hover:bg-accent/50"
                        style={{ background: isSelected ? 'rgba(196,20,20,0.06)' : undefined, opacity: isDimmed ? 0.3 : 1 }}
                        onClick={() => handleBarClick(entry)}
                      >
                        <div className="flex items-baseline gap-2 mb-1.5">
                          <span className="font-mono text-[11px] font-semibold shrink-0 transition-colors" style={{ color: isSelected ? '#C41414' : 'hsl(220, 28%, 18%)' }}>
                            {entry.label}
                          </span>
                          <span className="text-[9.5px] text-muted-foreground/60 truncate flex-1">{entry.descricao}</span>
                          <span className="text-[11px] font-bold tabular-nums shrink-0" style={{ color: isSelected ? '#C41414' : 'hsl(220,12%,46%)' }}>
                            {formatQuantity(entry.qty)} pç
                          </span>
                        </div>
                        <div className="h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.07)' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: isSelected ? 'linear-gradient(90deg, #8B0E0E, #C41414)' : '#C41414', transition: 'width 0.5s ease' }} />
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
              <CardTitle className="text-sm font-medium">Distribuição de Aging</CardTitle>
              <p className="text-[10px] text-muted-foreground">Há quanto tempo os lotes estão em aberto?</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={agingBuckets.filter(b => b.count > 0)}
                    cx="50%" cy="50%" outerRadius={72}
                    dataKey="count" nameKey="label"
                    label={({ label, count }) => `${label}: ${count}`} labelLine={false}
                  >
                    {agingBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid hsl(220,20%,90%)', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 11 }}
                    formatter={(v: number, name: string) => [`${v} lotes`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                {agingBuckets.map(b => (
                  <div key={b.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
                    <span>{b.label}</span>
                    <span className="font-semibold text-foreground">{b.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── PN Drilldown Panel ─────────────────────────────── */}
      {selectedPN && (
        <Card className="border border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base text-primary font-mono">{selectedPN}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{drilldownLots[0]?.product_master?.description ?? ''}</p>
                <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                  <span><span className="text-foreground/70 font-medium">{drilldownLots.length}</span> lote{drilldownLots.length !== 1 ? 's' : ''}</span>
                  <span><span className="text-primary font-medium">{formatQuantity(drilldownQtyOpen)}</span> pç abertas</span>
                  <span>Inicial: <span className="text-foreground/70">{formatQuantity(drilldownQtyTotal)}</span> pç</span>
                  <span>Aging médio: <span className={drilldownAvgAging > 10 ? 'text-red-500' : drilldownAvgAging > 5 ? 'text-amber-500' : 'text-green-500'}>{drilldownAvgAging.toFixed(1)}d</span></span>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedPN(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
                Evolução de Peças em Processo
                {(movLoading || qLoading) && <span className="inline-block w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />}
              </p>
              {timelineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={timelineData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#C41414" stopOpacity={0.20} />
                        <stop offset="95%" stopColor="#C41414" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="dateLabel" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} width={35} />
                    <Tooltip content={<AreaTooltip />} />
                    <ReferenceLine y={0} stroke="rgba(0,0,0,0.08)" />
                    <Area type="stepAfter" dataKey="qty_in_process" stroke="#C41414" fill="url(#areaGrad)" strokeWidth={2}
                      dot={timelineData.length <= 20 ? { fill: '#C41414', r: 3, strokeWidth: 0 } : false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : movLoading || qLoading ? (
                <div className="h-28 flex items-center justify-center text-muted-foreground text-xs">Carregando...</div>
              ) : (
                <div className="h-20 flex items-center justify-center text-muted-foreground text-xs">Nenhum movimento registrado.</div>
              )}
            </div>

            {/* Lotes do PN */}
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
                      const aging  = calcAgingDays(lot.opened_at)
                      const defect = lot.defect_type as { name: string } | null
                      return (
                        <tr key={lot.id} className="border-b border-border/40 hover:bg-accent/20">
                          <td className="px-3 py-2 font-mono text-primary">{lot.lot_code}</td>
                          <td className="px-3 py-2 text-muted-foreground">{formatDate(lot.opened_at)}</td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">{defect?.name ?? '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{lot.origin_area}</td>
                          <td className="px-3 py-2 text-center"><Badge variant="muted" className="text-xs">{LOT_STATUS_LABELS[lot.current_status]}</Badge></td>
                          <td className="px-3 py-2 text-center">
                            <Badge variant={lot.quality_status === 'pending_block' ? 'danger' : 'muted'} className="text-xs">
                              {QUALITY_STATUS_LABELS[lot.quality_status]}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right">{formatQuantity(lot.quantity_initial)}</td>
                          <td className="px-3 py-2 text-right font-medium text-primary">{formatQuantity(lot.quantity_open)}</td>
                          <td className="px-3 py-2 text-right">
                            <Badge variant={aging > 10 ? 'danger' : aging > 5 ? 'warning' : 'outline'} className="text-xs">{aging}d</Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Link to={`/lotes/${lot.id}`}>
                              <Button variant="ghost" size="icon" className="h-6 w-6"><Eye className="h-3 w-3" /></Button>
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Timeline de eventos */}
            {timelineData.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-2">Linha do Tempo de Eventos</p>
                <div className="overflow-x-auto rounded-md border border-border/50 max-h-64 overflow-y-auto">
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
                            <span className={ev.delta > 0 ? 'text-emerald-500' : ev.delta < 0 ? 'text-red-500' : 'text-muted-foreground'}>{ev.label}</span>
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                            {ev.from && ev.to ? (
                              <span className="flex items-center gap-1">{ev.from}<ChevronRight className="h-2.5 w-2.5 shrink-0" />{ev.to}</span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {ev.qty > 0 ? (
                              <span className={ev.delta > 0 ? 'text-emerald-500' : ev.delta < 0 ? 'text-red-500' : ''}>
                                {ev.delta > 0 ? '+' : ev.delta < 0 ? '-' : ''}{formatQuantity(ev.qty)}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium">{formatQuantity(ev.qty_in_process)}</td>
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

      {/* ── Lista completa ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              {selectedPN ? `Lotes — ${selectedPN}` : `Todos os Lotes em Aberto (${lots.length})`}
            </CardTitle>
            {selectedPN && (
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setSelectedPN(null)}>
                <X className="h-3 w-3" /> Ver todos
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {lots.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">Nenhum lote ativo.</p>
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
                    const aging     = calcAgingDays(lot.opened_at)
                    const defect    = lot.defect_type as { name: string } | null
                    const isSelected = selectedPN === lot.product_master?.part_number
                    return (
                      <tr
                        key={lot.id}
                        className={`border-b border-border/40 hover:bg-accent/20 transition-colors cursor-pointer
                          ${selectedPN && !isSelected ? 'opacity-40' : ''}
                          ${isSelected ? 'bg-primary/5' : ''}`}
                        onClick={() => handleBarClick({ label: lot.product_master?.part_number ?? '' })}
                      >
                        <td className="px-4 py-2 font-mono text-primary whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {lot.quality_status === 'pending_block' && <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />}
                            {lot.lot_code}
                          </div>
                        </td>
                        <td className="px-4 py-2 font-mono">{lot.product_master?.part_number ?? '—'}</td>
                        <td className="px-4 py-2 text-muted-foreground hidden lg:table-cell max-w-[160px] truncate">{lot.product_master?.description ?? '—'}</td>
                        <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{lot.origin_area}</td>
                        <td className="px-4 py-2 text-muted-foreground hidden md:table-cell max-w-[120px] truncate">{defect?.name ?? '—'}</td>
                        <td className="px-4 py-2 text-center"><Badge variant="muted" className="text-xs">{LOT_STATUS_LABELS[lot.current_status]}</Badge></td>
                        <td className="px-4 py-2 text-center">
                          <Badge variant={lot.quality_status === 'pending_block' ? 'danger' : 'muted'} className="text-xs">
                            {QUALITY_STATUS_LABELS[lot.quality_status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-right">{formatQuantity(lot.quantity_initial)}</td>
                        <td className="px-4 py-2 text-right font-medium text-primary">{formatQuantity(lot.quantity_open)}</td>
                        <td className="px-4 py-2 text-right">
                          <Badge variant={aging > 10 ? 'danger' : aging > 5 ? 'warning' : aging > 2 ? 'outline' : 'success'} className="text-xs">{aging}d</Badge>
                        </td>
                        <td className="px-4 py-2" onClick={e => e.stopPropagation()}>
                          <Link to={`/lotes/${lot.id}`}>
                            <Button variant="ghost" size="icon" className="h-6 w-6"><Eye className="h-3 w-3" /></Button>
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
