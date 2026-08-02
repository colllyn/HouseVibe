export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          available_from: string | null
          bedrooms: number | null
          budget_max: number | null
          budget_min: number | null
          commute_destination: string | null
          cooking_required: boolean | null
          created_at: string
          created_by: string
          deal_breakers: string[]
          deleted_at: string | null
          first_property_id: string | null
          hard_requirements: Json
          id: string
          last_interaction_at: string | null
          minimum_lease_months: number | null
          name: string
          next_follow_up_at: string | null
          pets_required: boolean | null
          phone: string | null
          preferred_communities: string[]
          preferred_districts: string[]
          raw_input_text: string | null
          rental_type: string | null
          soft_preferences: Json
          source_content_id: string | null
          source_platform: string | null
          stage: Database["public"]["Enums"]["client_stage"]
          updated_at: string
          wechat: string | null
          workspace_id: string
        }
        Insert: {
          available_from?: string | null
          bedrooms?: number | null
          budget_max?: number | null
          budget_min?: number | null
          commute_destination?: string | null
          cooking_required?: boolean | null
          created_at?: string
          created_by: string
          deal_breakers?: string[]
          deleted_at?: string | null
          first_property_id?: string | null
          hard_requirements?: Json
          id?: string
          last_interaction_at?: string | null
          minimum_lease_months?: number | null
          name: string
          next_follow_up_at?: string | null
          pets_required?: boolean | null
          phone?: string | null
          preferred_communities?: string[]
          preferred_districts?: string[]
          raw_input_text?: string | null
          rental_type?: string | null
          soft_preferences?: Json
          source_content_id?: string | null
          source_platform?: string | null
          stage?: Database["public"]["Enums"]["client_stage"]
          updated_at?: string
          wechat?: string | null
          workspace_id: string
        }
        Update: {
          available_from?: string | null
          bedrooms?: number | null
          budget_max?: number | null
          budget_min?: number | null
          commute_destination?: string | null
          cooking_required?: boolean | null
          created_at?: string
          created_by?: string
          deal_breakers?: string[]
          deleted_at?: string | null
          first_property_id?: string | null
          hard_requirements?: Json
          id?: string
          last_interaction_at?: string | null
          minimum_lease_months?: number | null
          name?: string
          next_follow_up_at?: string | null
          pets_required?: boolean | null
          phone?: string | null
          preferred_communities?: string[]
          preferred_districts?: string[]
          raw_input_text?: string | null
          rental_type?: string | null
          soft_preferences?: Json
          source_content_id?: string | null
          source_platform?: string | null
          stage?: Database["public"]["Enums"]["client_stage"]
          updated_at?: string
          wechat?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_first_property_id_fkey"
            columns: ["first_property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      collaboration_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          owner_workspace_id: string
          property_id: string
          requested_at: string
          requester_workspace_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["collab_req_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          owner_workspace_id: string
          property_id: string
          requested_at?: string
          requester_workspace_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["collab_req_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          owner_workspace_id?: string
          property_id?: string
          requested_at?: string
          requester_workspace_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["collab_req_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_requests_owner_workspace_id_fkey"
            columns: ["owner_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaboration_requests_requester_workspace_id_fkey"
            columns: ["requester_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_entitlements: {
        Row: {
          created_at: string
          expires_at: string | null
          feature: Database["public"]["Enums"]["feature_key"]
          granted_at: string
          granted_by: string
          id: string
          reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: Database["public"]["Enums"]["entitlement_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          feature: Database["public"]["Enums"]["feature_key"]
          granted_at?: string
          granted_by: string
          id?: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["entitlement_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          feature?: Database["public"]["Enums"]["feature_key"]
          granted_at?: string
          granted_by?: string
          id?: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["entitlement_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_entitlements_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_entitlements_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          id: string
          interaction_type: Database["public"]["Enums"]["interaction_type"]
          next_action: string | null
          occurred_at: string
          property_id: string | null
          raw_text: string | null
          summary: string | null
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          id?: string
          interaction_type: Database["public"]["Enums"]["interaction_type"]
          next_action?: string | null
          occurred_at: string
          property_id?: string | null
          raw_text?: string | null
          summary?: string | null
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          id?: string
          interaction_type?: Database["public"]["Enums"]["interaction_type"]
          next_action?: string | null
          occurred_at?: string
          property_id?: string | null
          raw_text?: string | null
          summary?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_links: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          max_uses: number | null
          recipient_email: string | null
          status: string
          target_workspace_id: string
          token_hash: string
          updated_at: string
          used_count: number
          workspace_role: Database["public"]["Enums"]["workspace_role"]
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          recipient_email?: string | null
          status?: string
          target_workspace_id: string
          token_hash: string
          updated_at?: string
          used_count?: number
          workspace_role?: Database["public"]["Enums"]["workspace_role"]
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          recipient_email?: string | null
          status?: string
          target_workspace_id?: string
          token_hash?: string
          updated_at?: string
          used_count?: number
          workspace_role?: Database["public"]["Enums"]["workspace_role"]
        }
        Relationships: [
          {
            foreignKeyName: "invitation_links_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitation_links_target_workspace_id_fkey"
            columns: ["target_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address_text: string | null
          allow_marketing_reuse: boolean
          area_sqm: number | null
          available_from: string | null
          bathrooms: number | null
          bedrooms: number | null
          building_no: string | null
          business_area: string | null
          city: string
          commission_split: string | null
          community_name: string | null
          cooking_allowed: boolean | null
          created_at: string
          created_by: string
          decoration: string | null
          deleted_at: string | null
          deposit_terms: string | null
          description: string | null
          district: string | null
          drawbacks: string[]
          facilities: Json
          floor: number | null
          has_elevator: boolean | null
          id: string
          is_shared: boolean
          living_rooms: number | null
          marketing_reuse_granted_at: string | null
          minimum_lease_months: number | null
          monthly_rent: number | null
          orientation: string | null
          pets_allowed: boolean | null
          raw_input_text: string | null
          rental_type: string
          room_no: string | null
          selling_points: string[]
          shared_at: string | null
          shared_expires_at: string | null
          source_type: string
          status: Database["public"]["Enums"]["property_status"]
          subway_text: string | null
          tags: string[]
          title: string
          total_floors: number | null
          unit_no: string | null
          updated_at: string
          visual_fact_flags: Json
          visual_summary: string | null
          workspace_id: string
        }
        Insert: {
          address_text?: string | null
          allow_marketing_reuse?: boolean
          area_sqm?: number | null
          available_from?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          building_no?: string | null
          business_area?: string | null
          city: string
          commission_split?: string | null
          community_name?: string | null
          cooking_allowed?: boolean | null
          created_at?: string
          created_by: string
          decoration?: string | null
          deleted_at?: string | null
          deposit_terms?: string | null
          description?: string | null
          district?: string | null
          drawbacks?: string[]
          facilities?: Json
          floor?: number | null
          has_elevator?: boolean | null
          id?: string
          is_shared?: boolean
          living_rooms?: number | null
          marketing_reuse_granted_at?: string | null
          minimum_lease_months?: number | null
          monthly_rent?: number | null
          orientation?: string | null
          pets_allowed?: boolean | null
          raw_input_text?: string | null
          rental_type?: string
          room_no?: string | null
          selling_points?: string[]
          shared_at?: string | null
          shared_expires_at?: string | null
          source_type?: string
          status?: Database["public"]["Enums"]["property_status"]
          subway_text?: string | null
          tags?: string[]
          title: string
          total_floors?: number | null
          unit_no?: string | null
          updated_at?: string
          visual_fact_flags?: Json
          visual_summary?: string | null
          workspace_id: string
        }
        Update: {
          address_text?: string | null
          allow_marketing_reuse?: boolean
          area_sqm?: number | null
          available_from?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          building_no?: string | null
          business_area?: string | null
          city?: string
          commission_split?: string | null
          community_name?: string | null
          cooking_allowed?: boolean | null
          created_at?: string
          created_by?: string
          decoration?: string | null
          deleted_at?: string | null
          deposit_terms?: string | null
          description?: string | null
          district?: string | null
          drawbacks?: string[]
          facilities?: Json
          floor?: number | null
          has_elevator?: boolean | null
          id?: string
          is_shared?: boolean
          living_rooms?: number | null
          marketing_reuse_granted_at?: string | null
          minimum_lease_months?: number | null
          monthly_rent?: number | null
          orientation?: string | null
          pets_allowed?: boolean | null
          raw_input_text?: string | null
          rental_type?: string
          room_no?: string | null
          selling_points?: string[]
          shared_at?: string | null
          shared_expires_at?: string | null
          source_type?: string
          status?: Database["public"]["Enums"]["property_status"]
          subway_text?: string | null
          tags?: string[]
          title?: string
          total_floors?: number | null
          unit_no?: string | null
          updated_at?: string
          visual_fact_flags?: Json
          visual_summary?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      property_matches: {
        Row: {
          client_id: string
          created_at: string
          id: string
          match_level: Database["public"]["Enums"]["match_level"]
          matched_reasons: Json
          needs_confirmation: Json
          property_id: string
          score: number
          status: Database["public"]["Enums"]["match_status"]
          unmatched_reasons: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          match_level?: Database["public"]["Enums"]["match_level"]
          matched_reasons?: Json
          needs_confirmation?: Json
          property_id: string
          score?: number
          status?: Database["public"]["Enums"]["match_status"]
          unmatched_reasons?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          match_level?: Database["public"]["Enums"]["match_level"]
          matched_reasons?: Json
          needs_confirmation?: Json
          property_id?: string
          score?: number
          status?: Database["public"]["Enums"]["match_status"]
          unmatched_reasons?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_matches_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_matches_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_matches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      property_media: {
        Row: {
          ai_analysis_status: Database["public"]["Enums"]["ai_analysis_status"]
          ai_analyzed_at: string | null
          ai_labels: Json | null
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          height: number | null
          id: string
          is_cover: boolean
          media_type: Database["public"]["Enums"]["media_type"]
          property_id: string
          scene_tag: string | null
          sort_order: number
          storage_path: string
          width: number | null
          workspace_id: string
        }
        Insert: {
          ai_analysis_status?: Database["public"]["Enums"]["ai_analysis_status"]
          ai_analyzed_at?: string | null
          ai_labels?: Json | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          height?: number | null
          id?: string
          is_cover?: boolean
          media_type?: Database["public"]["Enums"]["media_type"]
          property_id: string
          scene_tag?: string | null
          sort_order?: number
          storage_path: string
          width?: number | null
          workspace_id: string
        }
        Update: {
          ai_analysis_status?: Database["public"]["Enums"]["ai_analysis_status"]
          ai_analyzed_at?: string | null
          ai_labels?: Json | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          height?: number | null
          id?: string
          is_cover?: boolean
          media_type?: Database["public"]["Enums"]["media_type"]
          property_id?: string
          scene_tag?: string | null
          sort_order?: number
          storage_path?: string
          width?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_media_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_media_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      property_private_details: {
        Row: {
          created_at: string
          exact_address: string | null
          id: string
          internal_notes: string | null
          key_location: string | null
          owner_name: string | null
          owner_phone: string | null
          owner_wechat: string | null
          property_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          exact_address?: string | null
          id?: string
          internal_notes?: string | null
          key_location?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          owner_wechat?: string | null
          property_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          exact_address?: string | null
          id?: string
          internal_notes?: string | null
          key_location?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          owner_wechat?: string | null
          property_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_private_details_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_private_details_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      system_admins: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          revoked_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          revoked_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          revoked_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_admins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string
          client_id: string | null
          collaboration_request_id: string | null
          completed_at: string | null
          content_project_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          due_at: string | null
          id: string
          property_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_type: Database["public"]["Enums"]["task_type"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to: string
          client_id?: string | null
          collaboration_request_id?: string | null
          completed_at?: string | null
          content_project_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          property_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type: Database["public"]["Enums"]["task_type"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string
          client_id?: string | null
          collaboration_request_id?: string | null
          completed_at?: string | null
          content_project_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          property_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: Database["public"]["Enums"]["task_type"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          business_type: string
          city: string | null
          created_at: string
          id: string
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          business_type?: string
          city?: string | null
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          business_type?: string
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invitation: {
        Args: { p_token_hash: string }
        Returns: Json
      }
      create_property_with_private_details: {
        Args: {
          p_address_text?: string
          p_area_sqm?: number
          p_available_from?: string
          p_bathrooms?: number
          p_bedrooms?: number
          p_business_area?: string
          p_city: string
          p_community_name?: string
          p_cooking_allowed?: boolean
          p_decoration?: string
          p_deposit_terms?: string
          p_description?: string
          p_district?: string
          p_drawbacks?: string[]
          p_exact_address?: string
          p_floor?: number
          p_has_elevator?: boolean
          p_internal_notes?: string
          p_key_location?: string
          p_living_rooms?: number
          p_minimum_lease_months?: number
          p_monthly_rent?: number
          p_orientation?: string
          p_owner_name?: string
          p_owner_phone?: string
          p_owner_wechat?: string
          p_pets_allowed?: boolean
          p_rental_type?: string
          p_selling_points?: string[]
          p_source_type?: string
          p_subway_text?: string
          p_tags?: string[]
          p_title: string
          p_total_floors?: number
          p_workspace_id: string
        }
        Returns: string
      }
      create_workspace_with_owner: {
        Args: {
          workspace_business_type?: string
          workspace_city?: string
          workspace_name: string
        }
        Returns: Json
      }
      disable_feature_entitlement: {
        Args: {
          p_feature: Database["public"]["Enums"]["feature_key"]
          p_reason?: string
          p_user_id: string
        }
        Returns: Json
      }
      grant_feature_entitlement: {
        Args: {
          p_expires_at?: string
          p_feature: Database["public"]["Enums"]["feature_key"]
          p_user_id: string
        }
        Returns: Json
      }
      grant_system_admin: { Args: { p_user_id: string }; Returns: Json }
      list_system_admins: { Args: never; Returns: Json }
      list_user_entitlements: { Args: { p_user_id: string }; Returns: Json }
      remove_workspace_member: {
        Args: { p_member_id: string; p_workspace_id: string }
        Returns: Json
      }
      revoke_feature_entitlement: {
        Args: {
          p_feature: Database["public"]["Enums"]["feature_key"]
          p_reason?: string
          p_user_id: string
        }
        Returns: Json
      }
      revoke_system_admin: { Args: { p_user_id: string }; Returns: Json }
      set_client_stage: {
        Args: {
          p_client_id: string
          p_new_stage: Database["public"]["Enums"]["client_stage"]
        }
        Returns: {
          available_from: string | null
          bedrooms: number | null
          budget_max: number | null
          budget_min: number | null
          commute_destination: string | null
          cooking_required: boolean | null
          created_at: string
          created_by: string
          deal_breakers: string[]
          deleted_at: string | null
          first_property_id: string | null
          hard_requirements: Json
          id: string
          last_interaction_at: string | null
          minimum_lease_months: number | null
          name: string
          next_follow_up_at: string | null
          pets_required: boolean | null
          phone: string | null
          preferred_communities: string[]
          preferred_districts: string[]
          raw_input_text: string | null
          rental_type: string | null
          soft_preferences: Json
          source_content_id: string | null
          source_platform: string | null
          stage: Database["public"]["Enums"]["client_stage"]
          updated_at: string
          wechat: string | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "clients"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_media_cover: {
        Args: { p_media_id: string }
        Returns: {
          ai_analysis_status: Database["public"]["Enums"]["ai_analysis_status"]
          ai_analyzed_at: string | null
          ai_labels: Json | null
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          height: number | null
          id: string
          is_cover: boolean
          media_type: Database["public"]["Enums"]["media_type"]
          property_id: string
          scene_tag: string | null
          sort_order: number
          storage_path: string
          width: number | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "property_media"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_media_sort_order: {
        Args: { p_media_id: string; p_new_sort_order: number }
        Returns: {
          ai_analysis_status: Database["public"]["Enums"]["ai_analysis_status"]
          ai_analyzed_at: string | null
          ai_labels: Json | null
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          height: number | null
          id: string
          is_cover: boolean
          media_type: Database["public"]["Enums"]["media_type"]
          property_id: string
          scene_tag: string | null
          sort_order: number
          storage_path: string
          width: number | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "property_media"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      soft_delete_media: {
        Args: { p_media_id: string }
        Returns: {
          ai_analysis_status: Database["public"]["Enums"]["ai_analysis_status"]
          ai_analyzed_at: string | null
          ai_labels: Json | null
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          height: number | null
          id: string
          is_cover: boolean
          media_type: Database["public"]["Enums"]["media_type"]
          property_id: string
          scene_tag: string | null
          sort_order: number
          storage_path: string
          width: number | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "property_media"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      ai_analysis_status: "pending" | "processing" | "completed" | "failed"
      client_stage:
        | "new"
        | "qualified"
        | "properties_sent"
        | "viewing_scheduled"
        | "viewed"
        | "considering"
        | "closed_won"
        | "paused"
        | "lost"
        | "deleted"
      collab_req_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "cancelled"
        | "completed"
      entitlement_status: "active" | "disabled" | "revoked"
      feature_key:
        | "ai_data_extraction"
        | "semantic_search"
        | "property_matching"
        | "shared_property_pool"
        | "content_factory"
      interaction_type:
        | "phone_call"
        | "wechat_message"
        | "in_person_meeting"
        | "property_viewing"
        | "follow_up"
        | "negotiation"
        | "contract_signing"
        | "complaint"
        | "other"
      match_level: "excellent" | "good" | "fair" | "low"
      match_status: "active" | "dismissed" | "archived"
      media_type: "image" | "video"
      member_status: "active" | "inactive" | "invited"
      property_status:
        | "draft"
        | "available"
        | "reserved"
        | "rented"
        | "offline"
        | "expired"
        | "deleted"
      task_status: "todo" | "in_progress" | "done" | "cancelled"
      task_type:
        | "contact_client"
        | "send_property"
        | "confirm_viewing"
        | "follow_up_viewing"
        | "update_property_status"
        | "contact_owner"
        | "publish_content"
        | "update_content_data"
        | "follow_up_collaboration"
      workspace_role: "owner" | "member" | "external_collaborator"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_analysis_status: ["pending", "processing", "completed", "failed"],
      client_stage: [
        "new",
        "qualified",
        "properties_sent",
        "viewing_scheduled",
        "viewed",
        "considering",
        "closed_won",
        "paused",
        "lost",
        "deleted",
      ],
      collab_req_status: [
        "pending",
        "accepted",
        "rejected",
        "cancelled",
        "completed",
      ],
      entitlement_status: ["active", "disabled", "revoked"],
      feature_key: [
        "ai_data_extraction",
        "semantic_search",
        "property_matching",
        "shared_property_pool",
        "content_factory",
      ],
      interaction_type: [
        "phone_call",
        "wechat_message",
        "in_person_meeting",
        "property_viewing",
        "follow_up",
        "negotiation",
        "contract_signing",
        "complaint",
        "other",
      ],
      match_level: ["excellent", "good", "fair", "low"],
      match_status: ["active", "dismissed", "archived"],
      media_type: ["image", "video"],
      member_status: ["active", "inactive", "invited"],
      property_status: [
        "draft",
        "available",
        "reserved",
        "rented",
        "offline",
        "expired",
        "deleted",
      ],
      task_status: ["todo", "in_progress", "done", "cancelled"],
      task_type: [
        "contact_client",
        "send_property",
        "confirm_viewing",
        "follow_up_viewing",
        "update_property_status",
        "contact_owner",
        "publish_content",
        "update_content_data",
        "follow_up_collaboration",
      ],
      workspace_role: ["owner", "member", "external_collaborator"],
    },
  },
} as const
