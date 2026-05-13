export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          email: string
          area: string | null
          job_title: string | null
          role: string
          status: string
          created_at: string
          updated_at: string
          approved_at: string | null
          approved_by: string | null
        }
        Insert: {
          id: string
          full_name: string
          email: string
          area?: string | null
          job_title?: string | null
          role?: string
          status?: string
          created_at?: string
          updated_at?: string
          approved_at?: string | null
          approved_by?: string | null
        }
        Update: {
          full_name?: string
          email?: string
          area?: string | null
          job_title?: string | null
          role?: string
          status?: string
          updated_at?: string
          approved_at?: string | null
          approved_by?: string | null
        }
        Relationships: []
      }
      product_master: {
        Row: {
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
        Insert: {
          id?: string
          part_number: string
          normalized_part_number: string
          description: string
          family?: string | null
          material_type?: string | null
          active?: boolean
        }
        Update: {
          part_number?: string
          normalized_part_number?: string
          description?: string
          family?: string | null
          material_type?: string | null
          active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      process_stages: {
        Row: {
          id: string
          name: string
          sequence: number
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          sequence: number
          active?: boolean
        }
        Update: {
          name?: string
          sequence?: number
          active?: boolean
        }
        Relationships: []
      }
      defect_types: {
        Row: {
          id: string
          name: string
          process_area: string | null
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          process_area?: string | null
          active?: boolean
        }
        Update: {
          name?: string
          process_area?: string | null
          active?: boolean
        }
        Relationships: []
      }
      rework_lots: {
        Row: {
          id: string
          lot_code: string
          part_number_id: string
          quantity_initial: number
          quantity_open: number
          origin_area: string
          current_status: string
          quality_status: string
          defect_type_id: string | null
          defect_description: string
          quality_block_required: boolean
          quality_block_number: string | null
          opened_at: string
          closed_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lot_code?: string
          part_number_id: string
          quantity_initial: number
          quantity_open?: number
          origin_area: string
          current_status?: string
          quality_status?: string
          defect_type_id?: string | null
          defect_description: string
          quality_block_required?: boolean
          quality_block_number?: string | null
          opened_at?: string
          closed_at?: string | null
          created_by?: string | null
        }
        Update: {
          quantity_open?: number
          current_status?: string
          quality_status?: string
          quality_block_number?: string | null
          closed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lot_movements: {
        Row: {
          id: string
          lot_id: string
          from_stage_id: string | null
          to_stage_id: string
          quantity: number
          movement_type: string
          moved_at: string
          moved_by: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lot_id: string
          from_stage_id?: string | null
          to_stage_id: string
          quantity: number
          movement_type?: string
          moved_at?: string
          moved_by?: string | null
          notes?: string | null
        }
        Update: {
          notes?: string | null
        }
        Relationships: []
      }
      lot_stage_balances: {
        Row: {
          id: string
          lot_id: string
          stage_id: string
          balance_quantity: number
          updated_at: string
        }
        Insert: {
          id?: string
          lot_id: string
          stage_id: string
          balance_quantity?: number
        }
        Update: {
          balance_quantity?: number
          updated_at?: string
        }
        Relationships: []
      }
      quality_events: {
        Row: {
          id: string
          lot_id: string
          event_type: string
          quantity: number | null
          result: string | null
          quality_document: string | null
          notes: string | null
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          lot_id: string
          event_type: string
          quantity?: number | null
          result?: string | null
          quality_document?: string | null
          notes?: string | null
          created_by?: string | null
        }
        Update: {
          notes?: string | null
        }
        Relationships: []
      }
      scrap_events: {
        Row: {
          id: string
          lot_id: string
          quantity: number
          reason: string
          approved_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lot_id: string
          quantity: number
          reason: string
          approved_by?: string | null
        }
        Update: {
          reason?: string
        }
        Relationships: []
      }
      attachments: {
        Row: {
          id: string
          lot_id: string | null
          file_url: string
          file_type: string | null
          description: string | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lot_id?: string | null
          file_url: string
          file_type?: string | null
          description?: string | null
          uploaded_by?: string | null
        }
        Update: {
          description?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          table_name: string
          record_id: string | null
          action: string
          old_data: Json | null
          new_data: Json | null
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          table_name: string
          record_id?: string | null
          action: string
          old_data?: Json | null
          new_data?: Json | null
          user_id?: string | null
        }
        Update: {
          old_data?: Json | null
          new_data?: Json | null
        }
        Relationships: []
      }
      legacy_rework_snapshots: {
        Row: {
          id: string
          snapshot_date: string | null
          part_number: string | null
          normalized_part_number: string | null
          description: string | null
          family: string | null
          stage_name: string | null
          quantity: number | null
          source_file: string | null
          created_at: string
        }
        Insert: {
          id?: string
          snapshot_date?: string | null
          part_number?: string | null
          normalized_part_number?: string | null
          description?: string | null
          family?: string | null
          stage_name?: string | null
          quantity?: number | null
          source_file?: string | null
        }
        Update: {
          snapshot_date?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_rework_lot: {
        Args: {
          p_part_number_id: string
          p_quantity_initial: number
          p_origin_area: string
          p_initial_stage_id: string
          p_defect_type_id: string
          p_defect_description: string
          p_quality_block_required?: boolean
          p_quality_block_number?: string
          p_notes?: string
        }
        Returns: Array<{ lot_id: string; lot_code: string }>
      }
      move_lot_quantity: {
        Args: {
          p_lot_id: string
          p_from_stage_id: string
          p_to_stage_id: string
          p_quantity: number
          p_notes?: string
        }
        Returns: undefined
      }
      approve_quantity: {
        Args: {
          p_lot_id: string
          p_from_stage_id: string
          p_quantity: number
          p_quality_document?: string
          p_notes?: string
        }
        Returns: undefined
      }
      send_to_scrap: {
        Args: {
          p_lot_id: string
          p_from_stage_id: string
          p_quantity: number
          p_reason: string
        }
        Returns: undefined
      }
      close_lot: {
        Args: { p_lot_id: string }
        Returns: undefined
      }
      block_lot: {
        Args: {
          p_lot_id: string
          p_quality_document?: string
          p_notes?: string
        }
        Returns: undefined
      }
      promote_first_admin: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      ensure_current_user_profile: {
        Args: Record<PropertyKey, never>
        Returns: Database['public']['Tables']['profiles']['Row']
      }
      current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      current_user_status: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      is_approved_user: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_admin_user: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_quality_user: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
