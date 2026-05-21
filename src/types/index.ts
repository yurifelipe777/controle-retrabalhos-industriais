export type UserRole = 'user' | 'quality' | 'admin'
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'inactive'

export interface Profile {
  id: string
  full_name: string
  email: string
  area: string | null
  job_title: string | null
  role: UserRole
  status: UserStatus
  created_at: string
  updated_at: string
  approved_at: string | null
  approved_by: string | null
}

export type LotStatus =
  | 'open'
  | 'in_rework'
  | 'awaiting_quality'
  | 'partially_approved'
  | 'approved'
  | 'partially_scrapped'
  | 'scrapped'
  | 'closed'
  | 'cancelled'
  | 'awaiting_decapagem'

export type QualityStatus =
  | 'pending_block'
  | 'blocked'
  | 'in_inspection'
  | 'approved'
  | 'rejected'
  | 'unblocked'
  | 'scrap_approved'
  | 'sent_to_decapagem'

export interface ProductMaster {
  id: string
  part_number: string
  normalized_part_number: string
  description: string
  family: string | null
  material_type: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface ProcessStage {
  id: string
  name: string
  sequence: number
  active: boolean
  created_at: string
}

export interface DefectType {
  id: string
  name: string
  process_area: string | null
  active: boolean
  created_at: string
}

export interface ReworkLot {
  id: string
  lot_code: string
  part_number_id: string
  quantity_initial: number
  quantity_open: number
  origin_area: string
  current_status: LotStatus
  quality_status: QualityStatus
  defect_type_id: string | null
  defect_description: string
  quality_block_required: boolean
  quality_block_number: string | null
  opened_at: string
  closed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  originated_from_decapagem_id: string | null
  product_master?: ProductMaster
  defect_type?: DefectType
  creator?: Profile
}

export interface LotMovement {
  id: string
  lot_id: string
  from_stage_id: string | null
  to_stage_id: string
  quantity: number
  movement_type: 'initial' | 'transfer' | 'adjustment' | 'reversal'
  moved_at: string
  moved_by: string | null
  notes: string | null
  created_at: string
  is_reversed: boolean
  reversal_of_movement_id: string | null
  from_stage?: ProcessStage
  to_stage?: ProcessStage
  mover?: Profile
}

export interface LotStageBalance {
  id: string
  lot_id: string
  stage_id: string
  balance_quantity: number
  updated_at: string
  stage?: ProcessStage
}

export type QualityEventType = 'block' | 'unblock' | 'inspection' | 'approve' | 'reject' | 'send_to_scrap' | 'send_to_decapagem' | 'return_from_decapagem'

export type DecapagemStatus = 'dispatched' | 'returned' | 'cancelled'

export interface DecapagemEvent {
  id: string
  lot_id: string
  quantity: number
  from_stage_id: string
  original_part_number_id: string
  returned_part_number_id: string | null
  status: DecapagemStatus
  dispatched_at: string
  dispatched_by: string | null
  returned_at: string | null
  returned_by: string | null
  returned_lot_id: string | null
  notes: string | null
  return_notes: string | null
  created_at: string
  lot?: ReworkLot
  original_pn?: ProductMaster
  returned_pn?: ProductMaster
  returned_lot?: ReworkLot
  dispatcher?: Profile
  returner?: Profile
}

export interface QualityEvent {
  id: string
  lot_id: string
  event_type: QualityEventType
  quantity: number | null
  result: string | null
  quality_document: string | null
  notes: string | null
  created_at: string
  created_by: string | null
  creator?: Profile
  lot?: ReworkLot
}

export interface ScrapEvent {
  id: string
  lot_id: string
  quantity: number
  reason: string
  approved_by: string | null
  created_at: string
  approver?: Profile
  lot?: ReworkLot
}

export interface AuditLog {
  id: string
  table_name: string
  record_id: string | null
  action: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  user_id: string | null
  created_at: string
  actor?: Profile
}

export interface LotTimelineEvent {
  lot_id: string
  lot_code: string
  event_type: string
  quantity: number | null
  event_at: string
  actor_name: string | null
  notes: string | null
  sort_order: number
}

export interface DashboardSummary {
  open_lots: number
  total_open_qty: number
  pending_quality_block: number
  avg_aging_days: number
  total_approved: number
  total_rejected: number
  total_scrapped: number
  scrap_rate: number
  oldest_lot_days: number
}

export interface AgingBucket {
  label: string
  color: 'green' | 'yellow' | 'orange' | 'red'
  days_min: number
  days_max: number | null
  count: number
  quantity: number
}
