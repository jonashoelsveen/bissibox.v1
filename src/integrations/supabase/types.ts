export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      calendar_accounts_public: {
        Row: {
          id: string
          user_id: string
          provider: "google" | "outlook" | "icloud"
          email: string | null
          provider_account_id: string
          calendar_id: string | null
          calendar_name: string
          last_synced_at: string | null
          last_error: string | null
          status: "connected" | "needs_reauth" | "error"
          created_at: string
          updated_at: string
        }
        Relationships: []
      }
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
      activities: {
        Row: {
          average_heartrate: number | null
          average_speed: number | null
          created_at: string
          distance_m: number | null
          elapsed_time_sec: number | null
          id: string
          last_synced_at: string | null
          map_polyline: string | null
          max_heartrate: number | null
          moving_time_sec: number | null
          name: string | null
          raw: Json | null
          source: string
          sport_type: string | null
          start_date: string | null
          strava_activity_id: number | null
          sub_type: string | null
          summary_polyline: string | null
          sync_status: string
          total_elevation_gain_m: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          average_heartrate?: number | null
          average_speed?: number | null
          created_at?: string
          distance_m?: number | null
          elapsed_time_sec?: number | null
          id?: string
          last_synced_at?: string | null
          map_polyline?: string | null
          max_heartrate?: number | null
          moving_time_sec?: number | null
          name?: string | null
          raw?: Json | null
          source?: string
          sport_type?: string | null
          start_date?: string | null
          strava_activity_id?: number | null
          sub_type?: string | null
          summary_polyline?: string | null
          sync_status?: string
          total_elevation_gain_m?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          average_heartrate?: number | null
          average_speed?: number | null
          created_at?: string
          distance_m?: number | null
          elapsed_time_sec?: number | null
          id?: string
          last_synced_at?: string | null
          map_polyline?: string | null
          max_heartrate?: number | null
          moving_time_sec?: number | null
          name?: string | null
          raw?: Json | null
          source?: string
          sport_type?: string | null
          start_date?: string | null
          strava_activity_id?: number | null
          sub_type?: string | null
          summary_polyline?: string | null
          sync_status?: string
          total_elevation_gain_m?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      account_change_log: {
        Row: {
          change_type: string
          created_at: string
          field_names: string[]
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          change_type: string
          created_at?: string
          field_names?: string[]
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          change_type?: string
          created_at?: string
          field_names?: string[]
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      app_team_admins: {
        Row: {
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_name: string | null
          id: string
          invite_token: string | null
          invited_at: string | null
          last_name: string | null
          phone: string | null
          sex: string | null
          status: string
          team_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          invite_token?: string | null
          invited_at?: string | null
          last_name?: string | null
          phone?: string | null
          sex?: string | null
          status?: string
          team_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          invite_token?: string | null
          invited_at?: string | null
          last_name?: string | null
          phone?: string | null
          sex?: string | null
          status?: string
          team_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_team_admins_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "app_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      app_team_athletes: {
        Row: {
          created_at: string
          email: string
          id: string
          invite_token: string | null
          invited_at: string | null
          status: string
          team_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invite_token?: string | null
          invited_at?: string | null
          status?: string
          team_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invite_token?: string | null
          invited_at?: string | null
          status?: string
          team_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_team_athletes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "app_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      app_team_coaches: {
        Row: {
          created_at: string
          email: string
          id: string
          invite_token: string | null
          invited_at: string | null
          status: string
          team_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invite_token?: string | null
          invited_at?: string | null
          status?: string
          team_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invite_token?: string | null
          invited_at?: string | null
          status?: string
          team_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_team_coaches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "app_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      app_team_groups: {
        Row: {
          age_from: number | null
          age_to: number | null
          color: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          sort_order: number
          team_id: string
          updated_at: string
        }
        Insert: {
          age_from?: number | null
          age_to?: number | null
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          sort_order?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          age_from?: number | null
          age_to?: number | null
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          sort_order?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_team_groups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "app_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_member_groups: {
        Row: {
          created_at: string
          group_id: string
          id: string
          member_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          member_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          member_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_member_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "app_team_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_member_groups_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "entity_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_member_groups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "app_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_admin_groups: {
        Row: {
          admin_id: string
          created_at: string
          group_id: string
          id: string
          team_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          group_id: string
          id?: string
          team_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          group_id?: string
          id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_admin_groups_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "app_team_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_admin_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "app_team_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_admin_groups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "app_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_members: {
        Row: {
          app_group_id: string | null
          cancelled_at: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_name: string | null
          id: string
          invite_token: string | null
          invited_at: string | null
          last_name: string | null
          payment_status: string
          phone: string | null
          sex: string | null
          status: string
          team_id: string
          user_id: string | null
        }
        Insert: {
          app_group_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          invite_token?: string | null
          invited_at?: string | null
          last_name?: string | null
          payment_status?: string
          phone?: string | null
          sex?: string | null
          status?: string
          team_id: string
          user_id?: string | null
        }
        Update: {
          app_group_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          invite_token?: string | null
          invited_at?: string | null
          last_name?: string | null
          payment_status?: string
          phone?: string | null
          sex?: string | null
          status?: string
          team_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_members_app_group_id_fkey"
            columns: ["app_group_id"]
            isOneToOne: false
            referencedRelation: "app_team_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "app_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_membership_requests: {
        Row: {
          created_at: string
          date_of_birth: string | null
          decided_at: string | null
          decided_by: string | null
          deny_expires_at: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          requester_id: string
          status: string
          team_id: string
          team_name: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          decided_at?: string | null
          decided_by?: string | null
          deny_expires_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          requester_id: string
          status?: string
          team_id: string
          team_name: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          decided_at?: string | null
          decided_by?: string | null
          deny_expires_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          requester_id?: string
          status?: string
          team_id?: string
          team_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_membership_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "app_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      app_teams: {
        Row: {
          created_at: string
          description: string | null
          entity_code: string
          id: string
          name: string
          owner_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_code?: string
          id?: string
          name?: string
          owner_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_code?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      calendar_categories: {
        Row: {
          app_group_id: string | null
          app_team_id: string | null
          color: string
          created_at: string
          default_key: string | null
          gantt_end_week: number | null
          gantt_start_week: number | null
          gantt_end_date: string | null
          gantt_start_date: string | null
          hidden: boolean
          id: string
          is_default: boolean
          kind: string
          name: string
          parent_id: string | null
          pinned: boolean
          sort_order: number
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          app_group_id?: string | null
          app_team_id?: string | null
          color: string
          created_at?: string
          default_key?: string | null
          gantt_end_week?: number | null
          gantt_start_week?: number | null
          gantt_end_date?: string | null
          gantt_start_date?: string | null
          hidden?: boolean
          id?: string
          is_default?: boolean
          kind?: string
          name: string
          parent_id?: string | null
          pinned?: boolean
          sort_order?: number
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          app_group_id?: string | null
          app_team_id?: string | null
          color?: string
          created_at?: string
          default_key?: string | null
          gantt_end_week?: number | null
          gantt_start_week?: number | null
          gantt_end_date?: string | null
          gantt_start_date?: string | null
          hidden?: boolean
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          parent_id?: string | null
          pinned?: boolean
          sort_order?: number
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_categories_app_group_id_fkey"
            columns: ["app_group_id"]
            isOneToOne: false
            referencedRelation: "app_team_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_categories_app_team_id_fkey"
            columns: ["app_team_id"]
            isOneToOne: false
            referencedRelation: "app_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "calendar_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_categories_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_category_coach_access: {
        Row: {
          category_id: string
          coach_user_id: string
          created_at: string
          id: string
          owner_id: string
        }
        Insert: {
          category_id: string
          coach_user_id: string
          created_at?: string
          id?: string
          owner_id: string
        }
        Update: {
          category_id?: string
          coach_user_id?: string
          created_at?: string
          id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_category_coach_access_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "calendar_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sessions: {
        Row: {
          activities: Json | null
          activity: string | null
          all_day: boolean
          app_group_id: string | null
          average_heartrate: number | null
          category: string | null
          category_id: string | null
          coach_pending: boolean
          color: string | null
          created_at: string
          created_by_coach_id: string | null
          description: string | null
          diary_group: string | null
          diary_sub: string | null
          diary_type: string | null
          distance_km: number | null
          ends_at: string
          entity_id: string | null
          id: string
          import_batch_id: string | null
          ical_last_modified: string | null
          ical_recurrence_id: string | null
          ical_sequence: number | null
          ical_uid: string | null
          location: string | null
          location_url: string | null
          subscription_id: string | null
          pace_sec_per_km: number | null
          repeat_rule: string | null
          repeat_series_id: string | null
          session_note: string | null
          session_note_updated_at: string | null
          signup_enabled: boolean
          sort_index: number | null
          sport_type: string | null
          starts_at: string
          strava_activity_id: number | null
          sub_type: string | null
          summary_polyline: string | null
          title: string
          total_elevation_gain_m: number | null
          updated_at: string
          user_id: string
          user_calendar_id: string | null
          follows_calendar_color: boolean
        }
        Insert: {
          activities?: Json | null
          activity?: string | null
          all_day?: boolean
          app_group_id?: string | null
          average_heartrate?: number | null
          category?: string | null
          category_id?: string | null
          coach_pending?: boolean
          color?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          diary_group?: string | null
          diary_sub?: string | null
          diary_type?: string | null
          distance_km?: number | null
          ends_at: string
          entity_id?: string | null
          id?: string
          import_batch_id?: string | null
          ical_last_modified?: string | null
          ical_recurrence_id?: string | null
          ical_sequence?: number | null
          ical_uid?: string | null
          location?: string | null
          location_url?: string | null
          subscription_id?: string | null
          pace_sec_per_km?: number | null
          repeat_rule?: string | null
          repeat_series_id?: string | null
          session_note?: string | null
          session_note_updated_at?: string | null
          signup_enabled?: boolean
          sort_index?: number | null
          sport_type?: string | null
          starts_at: string
          strava_activity_id?: number | null
          sub_type?: string | null
          summary_polyline?: string | null
          title?: string
          total_elevation_gain_m?: number | null
          updated_at?: string
          user_id: string
          user_calendar_id?: string | null
          follows_calendar_color?: boolean
        }
        Update: {
          activities?: Json | null
          activity?: string | null
          all_day?: boolean
          app_group_id?: string | null
          average_heartrate?: number | null
          category?: string | null
          category_id?: string | null
          coach_pending?: boolean
          color?: string | null
          created_at?: string
          created_by_coach_id?: string | null
          description?: string | null
          diary_group?: string | null
          diary_sub?: string | null
          diary_type?: string | null
          distance_km?: number | null
          ends_at?: string
          entity_id?: string | null
          id?: string
          import_batch_id?: string | null
          ical_last_modified?: string | null
          ical_recurrence_id?: string | null
          ical_sequence?: number | null
          ical_uid?: string | null
          location?: string | null
          location_url?: string | null
          subscription_id?: string | null
          pace_sec_per_km?: number | null
          repeat_rule?: string | null
          repeat_series_id?: string | null
          session_note?: string | null
          session_note_updated_at?: string | null
          signup_enabled?: boolean
          sort_index?: number | null
          sport_type?: string | null
          starts_at?: string
          strava_activity_id?: number | null
          sub_type?: string | null
          summary_polyline?: string | null
          title?: string
          total_elevation_gain_m?: number | null
          updated_at?: string
          user_id?: string
          user_calendar_id?: string | null
          follows_calendar_color?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sessions_app_group_id_fkey"
            columns: ["app_group_id"]
            isOneToOne: false
            referencedRelation: "app_team_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_sessions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "calendar_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_sessions_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "calendar_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_sessions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "calendar_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_calendars: {
        Row: {
          app_group_id: string | null
          color: string
          created_at: string
          deleted_at: string | null
          entity_id: string | null
          id: string
          name: string
          owner_id: string
          sort_order: number
          source: string
          updated_at: string
        }
        Insert: {
          app_group_id?: string | null
          color: string
          created_at?: string
          deleted_at?: string | null
          entity_id?: string | null
          id?: string
          name: string
          owner_id: string
          sort_order?: number
          source?: string
          updated_at?: string
        }
        Update: {
          app_group_id?: string | null
          color?: string
          created_at?: string
          deleted_at?: string | null
          entity_id?: string | null
          id?: string
          name?: string
          owner_id?: string
          sort_order?: number
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_calendar_subscriptions: {
        Row: {
          calendar_id: string
          created_at: string
          etag: string | null
          key_version: number
          label_source: string
          last_attempt_at: string | null
          last_error: string | null
          last_modified: string | null
          last_success_at: string | null
          owner_id: string
          refresh_interval_seconds: number
          sync_status: string
          updated_at: string
          url_ciphertext: string
          url_hmac: string
          url_iv: string
        }
        Insert: {
          calendar_id: string
          created_at?: string
          etag?: string | null
          key_version: number
          label_source: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_modified?: string | null
          last_success_at?: string | null
          owner_id: string
          refresh_interval_seconds?: number
          sync_status?: string
          updated_at?: string
          url_ciphertext: string
          url_hmac: string
          url_iv: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          etag?: string | null
          key_version?: number
          label_source?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_modified?: string | null
          last_success_at?: string | null
          owner_id?: string
          refresh_interval_seconds?: number
          sync_status?: string
          updated_at?: string
          url_ciphertext?: string
          url_hmac?: string
          url_iv?: string
        }
        Relationships: []
      }
      user_calendar_members: {
        Row: {
          calendar_id: string
          created_at: string
          display_name: string | null
          email: string
          id: string
          invite_token: string | null
          invited_by: string | null
          role: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          calendar_id: string
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          invite_token?: string | null
          invited_by?: string | null
          role: string
          status: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          calendar_id?: string
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          invite_token?: string | null
          invited_by?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_calendar_visibility: {
        Row: {
          calendar_id: string
          hidden: boolean
          user_id: string
        }
        Insert: {
          calendar_id: string
          hidden?: boolean
          user_id: string
        }
        Update: {
          calendar_id?: string
          hidden?: boolean
          user_id?: string
        }
        Relationships: []
      }
      calendar_accounts: {
        Row: {
          id: string
          user_id: string
          provider: "google" | "outlook" | "icloud"
          email: string | null
          provider_account_id: string
          calendar_id: string | null
          calendar_name: string
          access_token_enc: string | null
          refresh_token_enc: string | null
          caldav_password_enc: string | null
          token_expires_at: string | null
          scope: string | null
          last_synced_at: string | null
          last_error: string | null
          status: "connected" | "needs_reauth" | "error"
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: "google" | "outlook" | "icloud"
          email?: string | null
          provider_account_id: string
          calendar_id?: string | null
          calendar_name?: string
          access_token_enc?: string | null
          refresh_token_enc?: string | null
          caldav_password_enc?: string | null
          token_expires_at?: string | null
          scope?: string | null
          last_synced_at?: string | null
          last_error?: string | null
          status?: "connected" | "needs_reauth" | "error"
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: "google" | "outlook" | "icloud"
          email?: string | null
          provider_account_id?: string
          calendar_id?: string | null
          calendar_name?: string
          access_token_enc?: string | null
          refresh_token_enc?: string | null
          caldav_password_enc?: string | null
          token_expires_at?: string | null
          scope?: string | null
          last_synced_at?: string | null
          last_error?: string | null
          status?: "connected" | "needs_reauth" | "error"
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      calendar_account_event_map: {
        Row: {
          id: string
          account_id: string
          session_id: string | null
          ical_uid: string
          ical_recurrence_id: string | null
          provider_event_id: string
          fingerprint: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          account_id: string
          session_id?: string | null
          ical_uid: string
          ical_recurrence_id?: string | null
          provider_event_id: string
          fingerprint: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          account_id?: string
          session_id?: string | null
          ical_uid?: string
          ical_recurrence_id?: string | null
          provider_event_id?: string
          fingerprint?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_account_event_map_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "calendar_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_subscriptions: {
        Row: {
          id: string
          cal_id: string
          created_by: string
          scope_user_id: string | null
          scope_entity_id: string | null
          input_url: string
          feed_url: string
          etag: string | null
          http_last_modified: string | null
          sync_token: string | null
          last_synced_at: string | null
          next_sync_at: string
          last_http_status: number | null
          last_error: string | null
          event_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cal_id: string
          created_by: string
          scope_user_id?: string | null
          scope_entity_id?: string | null
          input_url: string
          feed_url: string
          etag?: string | null
          http_last_modified?: string | null
          sync_token?: string | null
          last_synced_at?: string | null
          next_sync_at?: string
          last_http_status?: number | null
          last_error?: string | null
          event_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cal_id?: string
          created_by?: string
          scope_user_id?: string | null
          scope_entity_id?: string | null
          input_url?: string
          feed_url?: string
          etag?: string | null
          http_last_modified?: string | null
          sync_token?: string | null
          last_synced_at?: string | null
          next_sync_at?: string
          last_http_status?: number | null
          last_error?: string | null
          event_count?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      calendar_import_batches: {
        Row: {
          id: string
          cal_id: string
          created_by: string
          scope_user_id: string | null
          scope_entity_id: string | null
          source_name: string | null
          session_count: number
          created_at: string
        }
        Insert: {
          id?: string
          cal_id: string
          created_by: string
          scope_user_id?: string | null
          scope_entity_id?: string | null
          source_name?: string | null
          session_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          cal_id?: string
          created_by?: string
          scope_user_id?: string | null
          scope_entity_id?: string | null
          source_name?: string | null
          session_count?: number
          created_at?: string
        }
        Relationships: []
      }
      diary_day_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          day: string
          id: string
          kind: string
          member_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body?: string
          created_at?: string
          day: string
          id?: string
          kind?: string
          member_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          day?: string
          id?: string
          kind?: string
          member_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      diary_session_note_views: {
        Row: {
          event_id: string
          last_seen_at: string
          viewer_id: string
        }
        Insert: {
          event_id: string
          last_seen_at?: string
          viewer_id: string
        }
        Update: {
          event_id?: string
          last_seen_at?: string
          viewer_id?: string
        }
        Relationships: []
      }
      diary_session_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          event_id: string
          id: string
          kind: string
          member_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body?: string
          created_at?: string
          event_id: string
          id?: string
          kind?: string
          member_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          event_id?: string
          id?: string
          kind?: string
          member_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      event_classes: {
        Row: {
          code: string
          created_at: string
          event_id: string
          id: string
          label: string | null
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          event_id: string
          id?: string
          label?: string | null
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          event_id?: string
          id?: string
          label?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_classes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_co_organizers: {
        Row: {
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_co_organizers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          pinned: boolean
          sort_order: number
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          pinned?: boolean
          sort_order?: number
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pinned?: boolean
          sort_order?: number
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_likes: {
        Row: {
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_likes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_media: {
        Row: {
          added_by: string
          created_at: string
          event_id: string
          id: string
          media_item_id: string
        }
        Insert: {
          added_by: string
          created_at?: string
          event_id: string
          id?: string
          media_item_id: string
        }
        Update: {
          added_by?: string
          created_at?: string
          event_id?: string
          id?: string
          media_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_media_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_subevents: {
        Row: {
          bib_from: number | null
          bib_to: number | null
          class_codes: string[]
          course_path: Json
          created_at: string
          distance_km: number | null
          ends_at: string | null
          event_id: string
          id: string
          color: string | null
          live: boolean
          max_participants: number | null
          name: string
          sort_order: number
          split_points: Json
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          bib_from?: number | null
          bib_to?: number | null
          class_codes?: string[]
          course_path?: Json
          created_at?: string
          distance_km?: number | null
          ends_at?: string | null
          event_id: string
          id?: string
          color?: string | null
          live?: boolean
          max_participants?: number | null
          name: string
          sort_order?: number
          split_points?: Json
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          bib_from?: number | null
          bib_to?: number | null
          class_codes?: string[]
          course_path?: Json
          created_at?: string
          distance_km?: number | null
          ends_at?: string | null
          event_id?: string
          id?: string
          color?: string | null
          live?: boolean
          max_participants?: number | null
          name?: string
          sort_order?: number
          split_points?: Json
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_subevents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          category: string | null
          country: string | null
          cover_image: string | null
          created_at: string
          currency: string
          description: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          featured: boolean
          folder: string | null
          id: string
          location: string | null
          media_contact_email: string | null
          media_pitch: string | null
          organizer: string
          owner_id: string | null
          pin_description: string | null
          pin_lat: number | null
          pin_lng: number | null
          mapbox_place_id: string | null
          ticket_color: string | null
          participants_json: Json
          co_organizer_emails: Json
          popularity: number
          published: boolean
          race_types: string[]
          region: string | null
          signup_deadline: string | null
          signup_fee: number
          starts_at: string | null
          team_id: string | null
          timing_company_id: string | null
          title: string
          updated_at: string
          world_athletics_certified: boolean
        }
        Insert: {
          category?: string | null
          country?: string | null
          cover_image?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          featured?: boolean
          folder?: string | null
          id?: string
          location?: string | null
          media_contact_email?: string | null
          media_pitch?: string | null
          organizer: string
          owner_id?: string | null
          pin_description?: string | null
          pin_lat?: number | null
          pin_lng?: number | null
          mapbox_place_id?: string | null
          ticket_color?: string | null
          participants_json?: Json
          co_organizer_emails?: Json
          popularity?: number
          published?: boolean
          race_types?: string[]
          region?: string | null
          signup_deadline?: string | null
          signup_fee?: number
          starts_at?: string | null
          team_id?: string | null
          timing_company_id?: string | null
          title: string
          updated_at?: string
          world_athletics_certified?: boolean
        }
        Update: {
          category?: string | null
          country?: string | null
          cover_image?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          featured?: boolean
          folder?: string | null
          id?: string
          location?: string | null
          media_contact_email?: string | null
          media_pitch?: string | null
          organizer?: string
          owner_id?: string | null
          pin_description?: string | null
          pin_lat?: number | null
          pin_lng?: number | null
          mapbox_place_id?: string | null
          ticket_color?: string | null
          participants_json?: Json
          co_organizer_emails?: Json
          popularity?: number
          published?: boolean
          race_types?: string[]
          region?: string | null
          signup_deadline?: string | null
          signup_fee?: number
          starts_at?: string | null
          team_id?: string | null
          timing_company_id?: string | null
          title?: string
          updated_at?: string
          world_athletics_certified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "app_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      file_folder_links: {
        Row: {
          created_at: string
          file_id: string
          folder_id: string
          id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          folder_id: string
          id?: string
        }
        Update: {
          created_at?: string
          file_id?: string
          folder_id?: string
          id?: string
        }
        Relationships: []
      }
      file_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          pinned: boolean
          sort_order: number
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          pinned?: boolean
          sort_order?: number
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pinned?: boolean
          sort_order?: number
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      files: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          folder_id: string | null
          id: string
          mime_type: string | null
          storage_path: string
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          folder_id?: string | null
          id?: string
          mime_type?: string | null
          storage_path: string
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          folder_id?: string | null
          id?: string
          mime_type?: string | null
          storage_path?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meeting_audience: {
        Row: {
          created_at: string
          event_id: string
          group_id: string | null
          id: string
          include_board: boolean
        }
        Insert: {
          created_at?: string
          event_id: string
          group_id?: string | null
          id?: string
          include_board?: boolean
        }
        Update: {
          created_at?: string
          event_id?: string
          group_id?: string | null
          id?: string
          include_board?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "meeting_audience_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_audience_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "team_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          pinned: boolean
          sort_order: number
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          pinned?: boolean
          sort_order?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pinned?: boolean
          sort_order?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      meeting_invites: {
        Row: {
          email: string
          event_id: string
          id: string
          invited_at: string
          invited_by: string | null
        }
        Insert: {
          email: string
          event_id: string
          id?: string
          invited_at?: string
          invited_by?: string | null
        }
        Update: {
          email?: string
          event_id?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      note_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          note_id: string
          storage_path: string
          team_id: string | null
          uploaded_by: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          note_id: string
          storage_path: string
          team_id?: string | null
          uploaded_by: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          note_id?: string
          storage_path?: string
          team_id?: string | null
          uploaded_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_attachments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      note_cover_jobs: {
        Row: {
          attempts: number
          created_at: string
          finished_at: string | null
          id: string
          last_error: string | null
          note_id: string
          started_at: string | null
          status: string
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          last_error?: string | null
          note_id: string
          started_at?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          last_error?: string | null
          note_id?: string
          started_at?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_cover_jobs_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      note_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          pinned: boolean
          sort_order: number
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          pinned?: boolean
          sort_order?: number
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pinned?: boolean
          sort_order?: number
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          attachments_count: number
          body: string | null
          cover_image_url: string | null
          cover_status: string
          created_at: string
          folder: string | null
          id: string
          team_id: string | null
          title: string
          updated_at: string
          user_id: string
          word_count: number
        }
        Insert: {
          attachments_count?: number
          body?: string | null
          cover_image_url?: string | null
          cover_status?: string
          created_at?: string
          folder?: string | null
          id?: string
          team_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
          word_count?: number
        }
        Update: {
          attachments_count?: number
          body?: string | null
          cover_image_url?: string | null
          cover_status?: string
          created_at?: string
          folder?: string | null
          id?: string
          team_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          word_count?: number
        }
        Relationships: []
      }
      personal_bests: {
        Row: {
          achieved_on: string | null
          competition: string | null
          created_at: string
          discipline: string
          id: string
          performance: string
          source: string
          team: string | null
          updated_at: string
          user_id: string
          venue: string | null
        }
        Insert: {
          achieved_on?: string | null
          competition?: string | null
          created_at?: string
          discipline: string
          id?: string
          performance: string
          source?: string
          team?: string | null
          updated_at?: string
          user_id: string
          venue?: string | null
        }
        Update: {
          achieved_on?: string | null
          competition?: string | null
          created_at?: string
          discipline?: string
          id?: string
          performance?: string
          source?: string
          team?: string | null
          updated_at?: string
          user_id?: string
          venue?: string | null
        }
        Relationships: []
      }
      feature_flag_users: {
        Row: {
          flag_key: string
          user_id: string
          added_at: string
          added_by: string | null
          invited_at: string | null
          accepted_at: string | null
        }
        Insert: {
          flag_key: string
          user_id: string
          added_at?: string
          added_by?: string | null
          invited_at?: string | null
          accepted_at?: string | null
        }
        Update: {
          flag_key?: string
          user_id?: string
          added_at?: string
          added_by?: string | null
          invited_at?: string | null
          accepted_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          address: string | null
          address2: string | null
          anonymous: boolean
          athlete_active: boolean
          athlete_cover_media_id: string | null
          avatar_url: string | null
          birth_date: string | null
          club: string | null
          companion: string | null
          company_club: string | null
          country: string | null
          created_at: string
          default_class: string | null
          display_name: string | null
          email: string | null
          email_verified: boolean
          emergency_contact: string | null
          emergency_phone: string | null
          first_name: string | null
          gender: string | null
          id: string
          is_beta_tester: boolean
          is_photographer: boolean
          last_name: string | null
          license: string | null
          mobile: string | null
          mode: string
          nationality: string | null
          photographer_active: boolean
          photographer_bio: string | null
          photographer_cover_media_id: string | null
          postal_code: string | null
          postal_place: string | null
          team: string | null
          team_group: string | null
          top_bar_color: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          address?: string | null
          address2?: string | null
          anonymous?: boolean
          athlete_active?: boolean
          athlete_cover_media_id?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          club?: string | null
          companion?: string | null
          company_club?: string | null
          country?: string | null
          created_at?: string
          default_class?: string | null
          display_name?: string | null
          email?: string | null
          email_verified?: boolean
          emergency_contact?: string | null
          emergency_phone?: string | null
          first_name?: string | null
          gender?: string | null
          id: string
          is_beta_tester?: boolean
          is_photographer?: boolean
          last_name?: string | null
          license?: string | null
          mobile?: string | null
          mode?: string
          nationality?: string | null
          photographer_active?: boolean
          photographer_bio?: string | null
          photographer_cover_media_id?: string | null
          postal_code?: string | null
          postal_place?: string | null
          team?: string | null
          team_group?: string | null
          top_bar_color?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          address?: string | null
          address2?: string | null
          anonymous?: boolean
          athlete_active?: boolean
          athlete_cover_media_id?: string | null
          avatar_url?: string | null
          birth_date?: string | null
          club?: string | null
          companion?: string | null
          company_club?: string | null
          country?: string | null
          created_at?: string
          default_class?: string | null
          display_name?: string | null
          email?: string | null
          email_verified?: boolean
          emergency_contact?: string | null
          emergency_phone?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          is_beta_tester?: boolean
          is_photographer?: boolean
          last_name?: string | null
          license?: string | null
          mobile?: string | null
          mode?: string
          nationality?: string | null
          photographer_active?: boolean
          photographer_bio?: string | null
          photographer_cover_media_id?: string | null
          postal_code?: string | null
          postal_place?: string | null
          team?: string | null
          team_group?: string | null
          top_bar_color?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      registrations: {
        Row: {
          bib_number: string | null
          class_code: string | null
          consent_share_data: boolean
          created_at: string
          event_id: string
          id: string
          race_type: string
          status: string
          subevent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bib_number?: string | null
          class_code?: string | null
          consent_share_data?: boolean
          created_at?: string
          event_id: string
          id?: string
          race_type: string
          status?: string
          subevent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bib_number?: string | null
          class_code?: string | null
          consent_share_data?: boolean
          created_at?: string
          event_id?: string
          id?: string
          race_type?: string
          status?: string
          subevent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_subevent_id_fkey"
            columns: ["subevent_id"]
            isOneToOne: false
            referencedRelation: "event_subevents"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_board_meeting_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          id: string
          meeting_id: string
          mime_type: string | null
          storage_path: string
          team_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          id?: string
          meeting_id: string
          mime_type?: string | null
          storage_path: string
          team_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          meeting_id?: string
          mime_type?: string | null
          storage_path?: string
          team_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_board_meeting_attachments_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "team_board_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_board_meeting_attachments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_board_meeting_attendance: {
        Row: {
          board_member_id: string
          created_at: string
          id: string
          meeting_id: string
          roster_id: string | null
          team_id: string
        }
        Insert: {
          board_member_id: string
          created_at?: string
          id?: string
          meeting_id: string
          roster_id?: string | null
          team_id: string
        }
        Update: {
          board_member_id?: string
          created_at?: string
          id?: string
          meeting_id?: string
          roster_id?: string | null
          team_id?: string
        }
        Relationships: []
      }
      team_board_meeting_roster: {
        Row: {
          board_member_id: string | null
          created_at: string
          email: string
          id: string
          meeting_id: string
          name: string
          role: string
          sort_order: number
          team_id: string
        }
        Insert: {
          board_member_id?: string | null
          created_at?: string
          email?: string
          id?: string
          meeting_id: string
          name?: string
          role?: string
          sort_order?: number
          team_id: string
        }
        Update: {
          board_member_id?: string | null
          created_at?: string
          email?: string
          id?: string
          meeting_id?: string
          name?: string
          role?: string
          sort_order?: number
          team_id?: string
        }
        Relationships: []
      }
      team_board_meetings: {
        Row: {
          created_at: string
          created_by: string
          folder: string | null
          id: string
          meeting_date: string | null
          notes: string | null
          team_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          folder?: string | null
          id?: string
          meeting_date?: string | null
          notes?: string | null
          team_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          folder?: string | null
          id?: string
          meeting_date?: string | null
          notes?: string | null
          team_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_board_meetings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_board_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_at: string | null
          name: string
          role: string
          sort_order: number
          status: string
          team_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_at?: string | null
          name?: string
          role?: string
          sort_order?: number
          status?: string
          team_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_at?: string | null
          name?: string
          role?: string
          sort_order?: number
          status?: string
          team_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_board_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_followers: {
        Row: {
          created_at: string
          created_by: string | null
          follower_id: string
          id: string
          member_id: string
          team_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          follower_id: string
          id?: string
          member_id: string
          team_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          follower_id?: string
          id?: string
          member_id?: string
          team_id?: string | null
        }
        Relationships: []
      }
      team_follows: {
        Row: {
          created_at: string
          follower_id: string
          id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          id?: string
          team_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_follows_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_group_leaders: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          group_id: string | null
          group_name: string
          id: string
          invite_token: string | null
          invited_at: string | null
          invited_by: string | null
          name: string
          sort_order: number
          status: string
          team_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          group_id?: string | null
          group_name?: string
          id?: string
          invite_token?: string | null
          invited_at?: string | null
          invited_by?: string | null
          name?: string
          sort_order?: number
          status?: string
          team_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          group_id?: string | null
          group_name?: string
          id?: string
          invite_token?: string | null
          invited_at?: string | null
          invited_by?: string | null
          name?: string
          sort_order?: number
          status?: string
          team_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      team_group_meeting_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          id: string
          meeting_id: string
          mime_type: string | null
          storage_path: string
          team_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          id?: string
          meeting_id: string
          mime_type?: string | null
          storage_path: string
          team_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          meeting_id?: string
          mime_type?: string | null
          storage_path?: string
          team_id?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      team_group_meeting_attendance: {
        Row: {
          board_member_id: string
          created_at: string
          id: string
          meeting_id: string
          roster_id: string | null
          team_id: string
        }
        Insert: {
          board_member_id: string
          created_at?: string
          id?: string
          meeting_id: string
          roster_id?: string | null
          team_id: string
        }
        Update: {
          board_member_id?: string
          created_at?: string
          id?: string
          meeting_id?: string
          roster_id?: string | null
          team_id?: string
        }
        Relationships: []
      }
      team_group_meeting_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          pinned: boolean
          sort_order: number
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          pinned?: boolean
          sort_order?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          pinned?: boolean
          sort_order?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_group_meeting_roster: {
        Row: {
          board_member_id: string | null
          created_at: string
          email: string
          id: string
          is_leader: boolean
          meeting_id: string
          name: string
          role: string
          sort_order: number
          team_id: string
          user_id: string | null
        }
        Insert: {
          board_member_id?: string | null
          created_at?: string
          email?: string
          id?: string
          is_leader?: boolean
          meeting_id: string
          name?: string
          role?: string
          sort_order?: number
          team_id: string
          user_id?: string | null
        }
        Update: {
          board_member_id?: string | null
          created_at?: string
          email?: string
          id?: string
          is_leader?: boolean
          meeting_id?: string
          name?: string
          role?: string
          sort_order?: number
          team_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      team_group_meetings: {
        Row: {
          created_at: string
          created_by: string
          folder: string | null
          group_id: string | null
          id: string
          meeting_date: string | null
          notes: string | null
          team_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          folder?: string | null
          group_id?: string | null
          id?: string
          meeting_date?: string | null
          notes?: string | null
          team_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          folder?: string | null
          group_id?: string | null
          id?: string
          meeting_date?: string | null
          notes?: string | null
          team_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_group_meetings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "team_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      team_group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "team_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_group_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_groups: {
        Row: {
          age_from: number | null
          age_to: number | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          leader_email: string | null
          leader_name: string | null
          leader_phone: string | null
          name: string
          sort_order: number
          team_id: string
          updated_at: string
        }
        Insert: {
          age_from?: number | null
          age_to?: number | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          leader_email?: string | null
          leader_name?: string | null
          leader_phone?: string | null
          name?: string
          sort_order?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          age_from?: number | null
          age_to?: number | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          leader_email?: string | null
          leader_name?: string | null
          leader_phone?: string | null
          name?: string
          sort_order?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_groups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          accepted: boolean
          created_at: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          accepted?: boolean
          created_at?: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          accepted?: boolean
          created_at?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_membership_tiers: {
        Row: {
          created_at: string
          criteria_label: string
          currency: string
          description: string | null
          group_assignment_mode: string
          id: string
          is_active: boolean
          is_public: boolean
          name: string
          price: number
          sort_order: number
          team_id: string
        }
        Insert: {
          created_at?: string
          criteria_label?: string
          currency?: string
          description?: string | null
          group_assignment_mode?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          name: string
          price?: number
          sort_order?: number
          team_id: string
        }
        Update: {
          created_at?: string
          criteria_label?: string
          currency?: string
          description?: string | null
          group_assignment_mode?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          name?: string
          price?: number
          sort_order?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_membership_tiers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          status: string
          team_id: string
          tier_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          status?: string
          team_id: string
          tier_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          status?: string
          team_id?: string
          tier_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "team_membership_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          active: boolean
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          cover_media_id: string | null
          created_at: string
          description: string | null
          description_long: string | null
          entity_type: string
          id: string
          name: string
          nif_id: string | null
          owner_id: string
          postal_code: string | null
          postal_place: string | null
          top_bar_color: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          cover_media_id?: string | null
          created_at?: string
          description?: string | null
          description_long?: string | null
          entity_type?: string
          id?: string
          name: string
          nif_id?: string | null
          owner_id: string
          postal_code?: string | null
          postal_place?: string | null
          top_bar_color?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          cover_media_id?: string | null
          created_at?: string
          description?: string | null
          description_long?: string | null
          entity_type?: string
          id?: string
          name?: string
          nif_id?: string | null
          owner_id?: string
          postal_code?: string | null
          postal_place?: string | null
          top_bar_color?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      user_active_followers: {
        Row: {
          created_at: string
          created_by: string | null
          follower_id: string
          id: string
          member_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          follower_id: string
          id?: string
          member_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          follower_id?: string
          id?: string
          member_id?: string
        }
        Relationships: []
      }
      user_coaches: {
        Row: {
          accepted_at: string | null
          calendar_access: string
          coach_email: string
          coach_user_id: string | null
          created_at: string
          diary_access: string
          id: string
          invite_token: string | null
          invited_at: string | null
          owner_id: string
          photos_access: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          calendar_access?: string
          coach_email: string
          coach_user_id?: string | null
          created_at?: string
          diary_access?: string
          id?: string
          invite_token?: string | null
          invited_at?: string | null
          owner_id: string
          photos_access?: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          calendar_access?: string
          coach_email?: string
          coach_user_id?: string | null
          created_at?: string
          diary_access?: string
          id?: string
          invite_token?: string | null
          invited_at?: string | null
          owner_id?: string
          photos_access?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_follows: {
        Row: {
          created_at: string
          follower_id: string
          id: string
          target_role: string
          target_user_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          id?: string
          target_role: string
          target_user_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          id?: string
          target_role?: string
          target_user_id?: string
        }
        Relationships: []
      }
      user_plans: {
        Row: {
          created_at: string
          plan: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          plan?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          plan?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verification_attempts: {
        Row: {
          attempts: number
          channel: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          destination: string
          expires_at: string
          id: string
          max_attempts: number
          target_id: string
          target_kind: string
          target_meta: Json
          user_id: string
        }
        Insert: {
          attempts?: number
          channel: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          destination: string
          expires_at: string
          id?: string
          max_attempts?: number
          target_id: string
          target_kind: string
          target_meta?: Json
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          destination?: string
          expires_at?: string
          id?: string
          max_attempts?: number
          target_id?: string
          target_kind?: string
          target_meta?: Json
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      calendar_accounts_public: {
        Row: {
          id: string
          user_id: string
          provider: "google" | "outlook" | "icloud"
          email: string | null
          provider_account_id: string
          calendar_id: string | null
          calendar_name: string
          last_synced_at: string | null
          last_error: string | null
          status: "connected" | "needs_reauth" | "error"
          created_at: string
          updated_at: string
        }
        Relationships: []
      }
    }
    Functions: {
      claim_due_calendar_subscriptions: {
        Args: { p_limit?: number }
        Returns: Database["public"]["Tables"]["calendar_subscriptions"]["Row"][]
      }
      calc_word_count: { Args: { _body: string }; Returns: number }
      ensure_own_profile_row: { Args: never; Returns: string }
      email_registered_to_other_user: {
        Args: { p_email: string; p_except_user_id: string }
        Returns: boolean
      }
      patch_own_account_profile: {
        Args: {
          p_birth_date?: string | null
          p_first_name?: string | null
          p_last_name?: string | null
          p_mobile?: string | null
          p_patch_birth_date?: boolean
          p_patch_first_name?: boolean
          p_patch_last_name?: boolean
          p_patch_mobile?: boolean
        }
        Returns: {
          birth_date: string | null
          email: string | null
          first_name: string | null
          last_name: string | null
          mobile: string | null
          updated_at: string
        }[]
      }
      can_annotate_member: { Args: { _member: string }; Returns: boolean }
      can_view_member: { Args: { _member: string }; Returns: boolean }
      coach_can_edit_owner_category: {
        Args: { _category_id: string; _owner: string }
        Returns: boolean
      }
      get_member_viewer_role: { Args: { _member: string }; Returns: string }
      get_member_viewer_role_for_leader: {
        Args: { _member: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_follower_of_member: {
        Args: { _member: string }
        Returns: boolean
      }
      is_app_team_admin: { Args: { p_team_id: string }; Returns: boolean }
      is_app_team_admin_for: {
        Args: { p_user_id: string; p_team_id: string }
        Returns: boolean
      }
      is_app_team_owner: { Args: { p_team_id: string }; Returns: boolean }
      is_app_team_member: { Args: { p_team_id: string }; Returns: boolean }
      upsert_entity_calendar_session: { Args: { p: Json }; Returns: string }
      upsert_entity_calendar_session_for: {
        Args: { p_actor: string; p: Json }
        Returns: string
      }
      delete_entity_calendar_session: { Args: { p_id: string }; Returns: boolean }
      delete_entity_calendar_session_for: {
        Args: { p_actor: string; p_id: string }
        Returns: boolean
      }
      list_member_entity_calendar: { Args: never; Returns: Json }
      list_member_entity_calendar_for: {
        Args: { p_user_id: string; p_email?: string | null }
        Returns: Json
      }
      list_visible_calendar_sessions: { Args: never; Returns: Json }
      list_visible_calendar_sessions_for: {
        Args: { p_user_id: string; p_email?: string | null }
        Returns: Json
      }
      accept_user_calendar_invite: {
        Args: { p_token: string }
        Returns: Json
      }
      accept_feature_flags: { Args: never; Returns: undefined }
      feature_flag_launched: {
        Args: { p_flag: string }
        Returns: boolean
      }
      soft_delete_user_calendar: {
        Args: { p_id: string }
        Returns: undefined
      }
      enqueue_email: {
        Args: { queue_name: string; payload: Json }
        Returns: number
      }
      decide_entity_membership_request: {
        Args: {
          p_request_id: string
          p_actor_id: string
          p_action: string
          p_group_id?: string | null
        }
        Returns: Json
      }
      is_coach_of_member: { Args: { _member: string }; Returns: boolean }
      is_follower_of_member: { Args: { _member: string }; Returns: boolean }
      is_group_leader_of_member: { Args: { _member: string }; Returns: boolean }
      is_media_in_team_profile_album: {
        Args: { _media_id: string }
        Returns: boolean
      }
    }
    Enums: {
      account_type: "individual" | "team"
      app_role: "organizer" | "photographer" | "timekeeper"
      company_kind: "timing" | "production"
      event_type: "meeting" | "event" | "race"
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
      account_type: ["individual", "team"],
      app_role: ["organizer", "photographer", "timekeeper"],
      company_kind: ["timing", "production"],
      event_type: ["meeting", "event", "race"],
    },
  },
} as const
