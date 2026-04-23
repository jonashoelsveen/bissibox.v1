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
      companies: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["company_kind"]
          logo_url: string | null
          name: string
          website: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["company_kind"]
          logo_url?: string | null
          name: string
          website?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["company_kind"]
          logo_url?: string | null
          name?: string
          website?: string | null
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
          featured: boolean
          id: string
          location: string | null
          organizer: string
          owner_id: string | null
          popularity: number
          published: boolean
          race_types: string[]
          region: string | null
          signup_deadline: string | null
          signup_fee: number
          starts_at: string
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
          featured?: boolean
          id?: string
          location?: string | null
          organizer: string
          owner_id?: string | null
          popularity?: number
          published?: boolean
          race_types?: string[]
          region?: string | null
          signup_deadline?: string | null
          signup_fee?: number
          starts_at: string
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
          featured?: boolean
          id?: string
          location?: string | null
          organizer?: string
          owner_id?: string | null
          popularity?: number
          published?: boolean
          race_types?: string[]
          region?: string | null
          signup_deadline?: string | null
          signup_fee?: number
          starts_at?: string
          title?: string
          updated_at?: string
          world_athletics_certified?: boolean
        }
        Relationships: []
      }
      media_albums: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          updated_at: string
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
          updated_at?: string
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
          updated_at?: string
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
        ]
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          address: string | null
          address2: string | null
          anonymous: boolean
          athlete_active: boolean
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
          postal_code: string | null
          postal_place: string | null
          team: string | null
          team_group: string | null
          updated_at: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          address?: string | null
          address2?: string | null
          anonymous?: boolean
          athlete_active?: boolean
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
          postal_code?: string | null
          postal_place?: string | null
          team?: string | null
          team_group?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          address?: string | null
          address2?: string | null
          anonymous?: boolean
          athlete_active?: boolean
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
          postal_code?: string | null
          postal_place?: string | null
          team?: string | null
          team_group?: string | null
          updated_at?: string
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
      teams: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          nif_id: string | null
          owner_id: string
          postal_code: string | null
          postal_place: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          nif_id?: string | null
          owner_id: string
          postal_code?: string | null
          postal_place?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          nif_id?: string | null
          owner_id?: string
          postal_code?: string | null
          postal_place?: string | null
          updated_at?: string
          website?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      account_type: "individual" | "team"
      app_role: "organizer" | "photographer" | "timekeeper"
      company_kind: "timing" | "production"
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
    },
  },
} as const
