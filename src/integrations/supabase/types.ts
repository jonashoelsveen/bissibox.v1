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
      calendar_categories: {
        Row: {
          color: string
          created_at: string
          default_key: string | null
          hidden: boolean
          id: string
          is_default: boolean
          kind: string
          name: string
          pinned: boolean
          sort_order: number
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color: string
          created_at?: string
          default_key?: string | null
          hidden?: boolean
          id?: string
          is_default?: boolean
          kind?: string
          name: string
          pinned?: boolean
          sort_order?: number
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          default_key?: string | null
          hidden?: boolean
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
          pinned?: boolean
          sort_order?: number
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
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
          pace_sec_per_km: number | null
          session_note: string | null
          session_note_updated_at: string | null
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
        }
        Insert: {
          activities?: Json | null
          activity?: string | null
          all_day?: boolean
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
          pace_sec_per_km?: number | null
          session_note?: string | null
          session_note_updated_at?: string | null
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
        }
        Update: {
          activities?: Json | null
          activity?: string | null
          all_day?: boolean
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
          pace_sec_per_km?: number | null
          session_note?: string | null
          session_note_updated_at?: string | null
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
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sessions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "calendar_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          cover_media_id: string | null
          created_at: string
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["company_kind"]
          logo_url: string | null
          name: string
          website: string | null
        }
        Insert: {
          cover_media_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["company_kind"]
          logo_url?: string | null
          name: string
          website?: string | null
        }
        Update: {
          cover_media_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["company_kind"]
          logo_url?: string | null
          name?: string
          website?: string | null
        }
        Relationships: []
      }
      company_follows: {
        Row: {
          company_id: string
          created_at: string
          follower_id: string
          id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          follower_id: string
          id?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          follower_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_follows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "event_media_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
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
          event_id: string
          id: string
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
          event_id: string
          id?: string
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
          event_id?: string
          id?: string
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
          popularity: number
          published: boolean
          race_types: string[]
          region: string | null
          signup_deadline: string | null
          signup_fee: number
          starts_at: string
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
          popularity?: number
          published?: boolean
          race_types?: string[]
          region?: string | null
          signup_deadline?: string | null
          signup_fee?: number
          starts_at: string
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
          popularity?: number
          published?: boolean
          race_types?: string[]
          region?: string | null
          signup_deadline?: string | null
          signup_fee?: number
          starts_at?: string
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
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_timing_company_id_fkey"
            columns: ["timing_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      media_albums: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          member_user_id: string | null
          name: string
          pinned: boolean
          sort_order: number
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          member_user_id?: string | null
          name: string
          pinned?: boolean
          sort_order?: number
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          member_user_id?: string | null
          name?: string
          pinned?: boolean
          sort_order?: number
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_albums_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      media_item_albums: {
        Row: {
          album_id: string
          created_at: string
          id: string
          media_item_id: string
        }
        Insert: {
          album_id: string
          created_at?: string
          id?: string
          media_item_id: string
        }
        Update: {
          album_id?: string
          created_at?: string
          id?: string
          media_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_item_albums_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "media_albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_item_albums_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
        ]
      }
      media_items: {
        Row: {
          album_id: string | null
          allowed_media_houses: string[]
          captured_at: string | null
          created_at: string
          event_id: string | null
          file_size: number | null
          id: string
          media_type: string
          mime_type: string | null
          organizer: string | null
          photographer: string | null
          storage_path: string
          subject: string | null
          team_id: string | null
          updated_at: string
          uploaded_in_mode: string
          user_id: string
          visible_friends: boolean
          visible_media: boolean
          visible_world: boolean
        }
        Insert: {
          album_id?: string | null
          allowed_media_houses?: string[]
          captured_at?: string | null
          created_at?: string
          event_id?: string | null
          file_size?: number | null
          id?: string
          media_type: string
          mime_type?: string | null
          organizer?: string | null
          photographer?: string | null
          storage_path: string
          subject?: string | null
          team_id?: string | null
          updated_at?: string
          uploaded_in_mode?: string
          user_id: string
          visible_friends?: boolean
          visible_media?: boolean
          visible_world?: boolean
        }
        Update: {
          album_id?: string | null
          allowed_media_houses?: string[]
          captured_at?: string | null
          created_at?: string
          event_id?: string | null
          file_size?: number | null
          id?: string
          media_type?: string
          mime_type?: string | null
          organizer?: string | null
          photographer?: string | null
          storage_path?: string
          subject?: string | null
          team_id?: string | null
          updated_at?: string
          uploaded_in_mode?: string
          user_id?: string
          visible_friends?: boolean
          visible_media?: boolean
          visible_world?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "media_items_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "media_albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_items_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
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
          email: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          first_name: string | null
          gender: string | null
          id: string
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
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          first_name?: string | null
          gender?: string | null
          id: string
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
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
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
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      [_ in never]: never
    }
    Functions: {
      calc_word_count: { Args: { _body: string }; Returns: number }
      can_annotate_member: { Args: { _member: string }; Returns: boolean }
      can_view_member: { Args: { _member: string }; Returns: boolean }
      coach_can_edit_owner_category: {
        Args: { _category_id: string; _owner: string }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
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
      is_coach_of_member: { Args: { _member: string }; Returns: boolean }
      is_follower_of_member: { Args: { _member: string }; Returns: boolean }
      is_group_leader_of_member: { Args: { _member: string }; Returns: boolean }
      is_media_in_team_profile_album: {
        Args: { _media_id: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
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
  public: {
    Enums: {
      account_type: ["individual", "team"],
      app_role: ["organizer", "photographer", "timekeeper"],
      company_kind: ["timing", "production"],
      event_type: ["meeting", "event", "race"],
    },
  },
} as const
