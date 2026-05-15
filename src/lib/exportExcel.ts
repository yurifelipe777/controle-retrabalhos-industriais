import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { supabase } from './supabase'
import { formatDate, formatDateTime } from './utils'

const LOT_STATUS: Record<string, string> = {
  open: 'Aberto', in_rework: 'Em Retrabalho', awaiting_quality: 'Aguard. Qualidade',
  partially_approved: 'Parc. Aprovado', approved: 'Aprovado',
  partially_scrapped: 'Parc. Sucateado', scrapped: 'Sucateado',
  closed: 'Encerrado', cancelled: 'Cancelado',
}

const QUALITY_STATUS: Record<string, string> = {
  pending_block: 'Pend. Bloqueio', blocked: 'Bloqueado', in_inspection: 'Em Inspeção',
  approved: 'Aprovado', rejected: 'Reprovado', unblocked: 'Desbloqueado', scrap_approved: 'Sucata Aprov.',
}

const MOVEMENT_TYPE: Record<string, string> = {
  initial: 'Entrada Inicial', transfer: 'Transferência',
  adjustment: 'Ajuste', reversal: 'Estorno',
}

const QUALITY_EVENT_TYPE: Record<string, string> = {
  block: 'Bloqueio', unblock: 'Desbloqueio', inspection: 'Inspeção',
  approve: 'Aprovação', reject: 'Reprovação', send_to_scrap: 'Envio Sucata',
}

function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map(w => ({ wch: w }))
}

export async function exportCompleteReport(): Promise<void> {
  const now = new Date()
  const timestamp = format(now, 'dd-MM-yyyy_HH-mm-ss')
  const filename = `Relatório_Sistema_Retrabalho_${timestamp}.xlsx`

  // Busca todos os dados em paralelo
  const [lotsRes, movementsRes, qualityRes, scrapRes] = await Promise.all([
    supabase
      .from('rework_lots')
      .select(`
        *,
        product_master(part_number, description, family, material_type),
        defect_type:defect_types(name, process_area),
        creator:profiles!created_by(full_name, email)
      `)
      .order('opened_at', { ascending: false }),

    supabase
      .from('lot_movements')
      .select(`
        *,
        lot:rework_lots(lot_code),
        from_stage:process_stages!from_stage_id(name),
        to_stage:process_stages!to_stage_id(name),
        mover:profiles!moved_by(full_name, email)
      `)
      .order('moved_at', { ascending: false })
      .limit(5000),

    supabase
      .from('quality_events')
      .select(`
        *,
        lot:rework_lots(lot_code),
        creator:profiles!created_by(full_name, email)
      `)
      .order('created_at', { ascending: false }),

    supabase
      .from('scrap_events')
      .select(`
        *,
        lot:rework_lots(lot_code),
        approver:profiles!approved_by(full_name, email)
      `)
      .order('created_at', { ascending: false }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lots = (lotsRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const movements = (movementsRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qualityEvents = (qualityRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scrapEvents = (scrapRes.data ?? []) as any[]

  const wb = XLSX.utils.book_new()

  // ─────────────────────────────────────────
  // Sheet 1: Resumo executivo
  // ─────────────────────────────────────────
  const activeLots = lots.filter(l => !['closed', 'cancelled'].includes(l.current_status))
  const totalQtyOpen = activeLots.reduce((s: number, l: { quantity_open: number }) => s + l.quantity_open, 0)
  const totalQtyInitial = lots.reduce((s: number, l: { quantity_initial: number }) => s + l.quantity_initial, 0)
  const totalScraped = scrapEvents.reduce((s: number, e: { quantity: number }) => s + e.quantity, 0)
  const totalApproved = qualityEvents
    .filter((e: { event_type: string }) => e.event_type === 'approve')
    .reduce((s: number, e: { quantity: number | null }) => s + (e.quantity ?? 0), 0)
  const pendingBlock = activeLots.filter((l: { quality_status: string }) => l.quality_status === 'pending_block').length
  const agingValues = activeLots.map((l: { opened_at: string }) =>
    Math.max(0, Math.floor((now.getTime() - new Date(l.opened_at).getTime()) / 86400000))
  )
  const avgAging = agingValues.length > 0 ? (agingValues.reduce((a: number, b: number) => a + b, 0) / agingValues.length).toFixed(1) : 0
  const maxAging = agingValues.length > 0 ? Math.max(...agingValues) : 0
  const scrapRate = (totalQtyInitial + totalApproved + totalScraped) > 0
    ? ((totalScraped / (totalQtyInitial + totalApproved + totalScraped)) * 100).toFixed(1)
    : 0

  const summaryData = [
    ['RELATÓRIO DO SISTEMA DE CONTROLE DE RETRABALHOS INDUSTRIAIS — CALOI'],
    ['Gerado em:', formatDateTime(now.toISOString())],
    [],
    ['LOTES'],
    ['Total de lotes (todos os tempos)', lots.length],
    ['Lotes ativos', activeLots.length],
    ['Lotes encerrados', lots.filter((l: { current_status: string }) => l.current_status === 'closed').length],
    ['Lotes cancelados', lots.filter((l: { current_status: string }) => l.current_status === 'cancelled').length],
    ['Lotes sucateados', lots.filter((l: { current_status: string }) => l.current_status === 'scrapped').length],
    ['Lotes aprovados', lots.filter((l: { current_status: string }) => l.current_status === 'approved').length],
    ['Lotes sem bloqueio de qualidade (ativos)', pendingBlock],
    [],
    ['QUANTIDADES'],
    ['Peças abertas (em processo)', totalQtyOpen],
    ['Total peças aprovadas (eventos)', totalApproved],
    ['Total peças sucateadas', totalScraped],
    ['Taxa de sucata', `${scrapRate}%`],
    [],
    ['AGING (DIAS EM ABERTO)'],
    ['Aging médio (ativos)', avgAging],
    ['Lote mais antigo (dias)', maxAging],
    ['Lotes com mais de 10 dias', agingValues.filter((d: number) => d > 10).length],
    ['Lotes com 6 a 10 dias', agingValues.filter((d: number) => d > 5 && d <= 10).length],
    ['Lotes com 3 a 5 dias', agingValues.filter((d: number) => d > 2 && d <= 5).length],
    ['Lotes com 0 a 2 dias', agingValues.filter((d: number) => d <= 2).length],
    [],
    ['REGISTROS'],
    ['Total de movimentações', movements.length],
    ['Total de eventos de qualidade', qualityEvents.length],
    ['Total de eventos de sucata', scrapEvents.length],
  ]
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
  setColWidths(summaryWs, [40, 25])
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Resumo')

  // ─────────────────────────────────────────
  // Sheet 2: Lotes
  // ─────────────────────────────────────────
  const lotsHeaders = [
    'Código do Lote', 'Part Number', 'Descrição', 'Família', 'Tipo de Material',
    'Qtd Inicial', 'Qtd Aberta', 'Setor de Origem', 'Status Atual', 'Status Qualidade',
    'Tipo de Defeito', 'Área do Defeito', 'Descrição do Defeito',
    'Requer Bloqueio', 'Nº do Bloqueio', 'Criado por', 'E-mail Criador',
    'Aberto em', 'Encerrado em', 'Aging (dias)',
  ]
  const lotsRows = lots.map((l: Record<string, unknown>) => {
    const pm = l.product_master as Record<string, string> | null
    const defect = l.defect_type as Record<string, string> | null
    const creator = l.creator as Record<string, string> | null
    const aging = Math.max(0, Math.floor((now.getTime() - new Date(l.opened_at as string).getTime()) / 86400000))
    return [
      l.lot_code,
      pm?.part_number ?? '',
      pm?.description ?? '',
      pm?.family ?? '',
      pm?.material_type ?? '',
      l.quantity_initial,
      l.quantity_open,
      l.origin_area,
      LOT_STATUS[l.current_status as string] ?? l.current_status,
      QUALITY_STATUS[l.quality_status as string] ?? l.quality_status,
      defect?.name ?? '',
      defect?.process_area ?? '',
      l.defect_description,
      (l.quality_block_required as boolean) ? 'Sim' : 'Não',
      l.quality_block_number ?? '',
      creator?.full_name ?? '',
      creator?.email ?? '',
      formatDate(l.opened_at as string),
      l.closed_at ? formatDate(l.closed_at as string) : '',
      aging,
    ]
  })
  const lotsWs = XLSX.utils.aoa_to_sheet([lotsHeaders, ...lotsRows])
  setColWidths(lotsWs, [18, 14, 32, 14, 16, 10, 10, 16, 16, 16, 22, 18, 40, 14, 14, 22, 28, 14, 14, 10])
  XLSX.utils.book_append_sheet(wb, lotsWs, 'Lotes')

  // ─────────────────────────────────────────
  // Sheet 3: Movimentações
  // ─────────────────────────────────────────
  const movHeaders = [
    'Código do Lote', 'Data/Hora', 'Tipo de Movimento', 'De (Etapa)', 'Para (Etapa)',
    'Quantidade', 'Movido por', 'E-mail', 'Observações', 'Estornado?', 'ID do Estorno de',
  ]
  const movRows = movements.map((m: Record<string, unknown>) => {
    const lot = m.lot as Record<string, string> | null
    const fromStage = m.from_stage as Record<string, string> | null
    const toStage = m.to_stage as Record<string, string> | null
    const mover = m.mover as Record<string, string> | null
    return [
      lot?.lot_code ?? '',
      formatDateTime(m.moved_at as string),
      MOVEMENT_TYPE[m.movement_type as string] ?? m.movement_type,
      fromStage?.name ?? '—',
      toStage?.name ?? '',
      m.quantity,
      mover?.full_name ?? '',
      mover?.email ?? '',
      m.notes ?? '',
      (m.is_reversed as boolean) ? 'Sim' : 'Não',
      m.reversal_of_movement_id ?? '',
    ]
  })
  const movWs = XLSX.utils.aoa_to_sheet([movHeaders, ...movRows])
  setColWidths(movWs, [18, 16, 18, 20, 20, 10, 22, 28, 40, 10, 36])
  XLSX.utils.book_append_sheet(wb, movWs, 'Movimentações')

  // ─────────────────────────────────────────
  // Sheet 4: Eventos de Qualidade
  // ─────────────────────────────────────────
  const qualHeaders = [
    'Código do Lote', 'Data/Hora', 'Tipo de Evento', 'Quantidade', 'Resultado',
    'Documento de Qualidade', 'Observações', 'Criado por', 'E-mail',
  ]
  const qualRows = qualityEvents.map((e: Record<string, unknown>) => {
    const lot = e.lot as Record<string, string> | null
    const creator = e.creator as Record<string, string> | null
    return [
      lot?.lot_code ?? '',
      formatDateTime(e.created_at as string),
      QUALITY_EVENT_TYPE[e.event_type as string] ?? e.event_type,
      e.quantity ?? '',
      e.result ?? '',
      e.quality_document ?? '',
      e.notes ?? '',
      creator?.full_name ?? '',
      creator?.email ?? '',
    ]
  })
  const qualWs = XLSX.utils.aoa_to_sheet([qualHeaders, ...qualRows])
  setColWidths(qualWs, [18, 16, 16, 10, 16, 20, 40, 22, 28])
  XLSX.utils.book_append_sheet(wb, qualWs, 'Qualidade')

  // ─────────────────────────────────────────
  // Sheet 5: Sucata
  // ─────────────────────────────────────────
  const scrapHeaders = [
    'Código do Lote', 'Data/Hora', 'Quantidade', 'Motivo', 'Aprovado por', 'E-mail Aprovador',
  ]
  const scrapRows = scrapEvents.map((e: Record<string, unknown>) => {
    const lot = e.lot as Record<string, string> | null
    const approver = e.approver as Record<string, string> | null
    return [
      lot?.lot_code ?? '',
      formatDateTime(e.created_at as string),
      e.quantity,
      e.reason,
      approver?.full_name ?? '',
      approver?.email ?? '',
    ]
  })
  const scrapWs = XLSX.utils.aoa_to_sheet([scrapHeaders, ...scrapRows])
  setColWidths(scrapWs, [18, 16, 10, 50, 22, 28])
  XLSX.utils.book_append_sheet(wb, scrapWs, 'Sucata')

  // Download
  XLSX.writeFile(wb, filename)
}
