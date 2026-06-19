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
      age_decode_attempts: {
        Row: {
          appliance_type: string | null
          confidence: string | null
          created_at: string
          decoder_version: string
          id: string
          manufacture_month: number | null
          manufacture_year: number | null
          manufacturer: string
          model_number: string
          rule_id: string | null
          serial_number: string
          status: string
          unknown_reason: string | null
          user_id: string | null
        }
        Insert: {
          appliance_type?: string | null
          confidence?: string | null
          created_at?: string
          decoder_version: string
          id?: string
          manufacture_month?: number | null
          manufacture_year?: number | null
          manufacturer: string
          model_number: string
          rule_id?: string | null
          serial_number: string
          status: string
          unknown_reason?: string | null
          user_id?: string | null
        }
        Update: {
          appliance_type?: string | null
          confidence?: string | null
          created_at?: string
          decoder_version?: string
          id?: string
          manufacture_month?: number | null
          manufacture_year?: number | null
          manufacturer?: string
          model_number?: string
          rule_id?: string | null
          serial_number?: string
          status?: string
          unknown_reason?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          created_at: string
          feature: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          feature: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          feature?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          user_id?: string | null
        }
        Relationships: []
      }
      diagnostic_sessions: {
        Row: {
          age_years: number | null
          appliance: Json
          appliance_type: string
          brand: string
          complaint: string
          created_at: string
          current_findings_summary: string
          findings: Json
          history: Json
          id: string
          is_favorite: boolean
          manufacture_year: number | null
          model_number: string
          most_likely_failure: string
          most_likely_failures: Json
          recommended_next_test: string
          serial_number: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          age_years?: number | null
          appliance?: Json
          appliance_type?: string
          brand?: string
          complaint?: string
          created_at?: string
          current_findings_summary?: string
          findings?: Json
          history?: Json
          id?: string
          is_favorite?: boolean
          manufacture_year?: number | null
          model_number?: string
          most_likely_failure?: string
          most_likely_failures?: Json
          recommended_next_test?: string
          serial_number?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          age_years?: number | null
          appliance?: Json
          appliance_type?: string
          brand?: string
          complaint?: string
          created_at?: string
          current_findings_summary?: string
          findings?: Json
          history?: Json
          id?: string
          is_favorite?: boolean
          manufacture_year?: number | null
          model_number?: string
          most_likely_failure?: string
          most_likely_failures?: Json
          recommended_next_test?: string
          serial_number?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      error_code_cache: {
        Row: {
          affected_components: Json
          appliance_type: string
          brand: string
          cached_at: string
          code: string
          common_causes: Json
          confidence: string
          id: string
          meaning: string
          model_number: string
          recommended_tests: Json
          service_notes: string
          sources: Json
          updated_at: string
        }
        Insert: {
          affected_components?: Json
          appliance_type?: string
          brand: string
          cached_at?: string
          code: string
          common_causes?: Json
          confidence?: string
          id?: string
          meaning: string
          model_number?: string
          recommended_tests?: Json
          service_notes?: string
          sources?: Json
          updated_at?: string
        }
        Update: {
          affected_components?: Json
          appliance_type?: string
          brand?: string
          cached_at?: string
          code?: string
          common_causes?: Json
          confidence?: string
          id?: string
          meaning?: string
          model_number?: string
          recommended_tests?: Json
          service_notes?: string
          sources?: Json
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["feedback_kind"]
          status: Database["public"]["Enums"]["feedback_status"]
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["feedback_kind"]
          status?: Database["public"]["Enums"]["feedback_status"]
          subject?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["feedback_kind"]
          status?: Database["public"]["Enums"]["feedback_status"]
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          full_name: string
          id: string
          is_suspended: boolean
          last_activity_at: string | null
          last_login_at: string | null
          plan: Database["public"]["Enums"]["plan_tier"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string
          full_name?: string
          id: string
          is_suspended?: boolean
          last_activity_at?: string | null
          last_login_at?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          full_name?: string
          id?: string
          is_suspended?: boolean
          last_activity_at?: string | null
          last_login_at?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
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
      app_role: "owner" | "user"
      feedback_kind: "bug" | "feature" | "general"
      feedback_status: "open" | "reviewed" | "closed"
      plan_tier: "free" | "pro" | "master" | "lifetime"
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
      app_role: ["owner", "user"],
      feedback_kind: ["bug", "feature", "general"],
      feedback_status: ["open", "reviewed", "closed"],
      plan_tier: ["free", "pro", "master", "lifetime"],
    },
  },
} as const
