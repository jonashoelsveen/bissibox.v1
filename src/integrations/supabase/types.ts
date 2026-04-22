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
      profiles: {
        Row: {
          address: string | null
          address2: string | null
          anonymous: boolean
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
          last_name: string | null
          license: string | null
          mobile: string | null
          mode: string
          nationality: string | null
          postal_code: string | null
          postal_place: string | null
          team: string | null
          team_group: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          address2?: string | null
          anonymous?: boolean
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
          last_name?: string | null
          license?: string | null
          mobile?: string | null
          mode?: string
          nationality?: string | null
          postal_code?: string | null
          postal_place?: string | null
          team?: string | null
          team_group?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          address2?: string | null
          anonymous?: boolean
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
          last_name?: string | null
          license?: string | null
          mobile?: string | null
          mode?: string
          nationality?: string | null
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
          created_at: string
          event_id: string
          id: string
          race_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bib_number?: string | null
          created_at?: string
          event_id: string
          id?: string
          race_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bib_number?: string | null
          created_at?: string
          event_id?: string
          id?: string
          race_type?: string
          status?: string
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
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
