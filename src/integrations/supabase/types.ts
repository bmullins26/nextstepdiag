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
      age_decode_corroborations: {
        Row: {
          best_trust: string | null
          brand_key: string
          created_at: string
          expires_at: string
          hits: Json
          id: string
          model_number: string
          query: string
          source_count: number
          updated_at: string
          year_scores: Json
        }
        Insert: {
          best_trust?: string | null
          brand_key: string
          created_at?: string
          expires_at?: string
          hits?: Json
          id?: string
          model_number: string
          query: string
          source_count?: number
          updated_at?: string
          year_scores?: Json
        }
        Update: {
          best_trust?: string | null
          brand_key?: string
          created_at?: string
          expires_at?: string
          hits?: Json
          id?: string
          model_number?: string
          query?: string
          source_count?: number
          updated_at?: string
          year_scores?: Json
        }
        Relationships: []
      }
      age_decode_ground_truth: {
        Row: {
          created_at: string
          decoder_confidence: string | null
          decoder_year: number | null
          id: string
          known_month: number | null
          known_year: number
          manufacturer: string
          model_number: string | null
          notes: string | null
          serial_number: string
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decoder_confidence?: string | null
          decoder_year?: number | null
          id?: string
          known_month?: number | null
          known_year: number
          manufacturer: string
          model_number?: string | null
          notes?: string | null
          serial_number: string
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decoder_confidence?: string | null
          decoder_year?: number | null
          id?: string
          known_month?: number | null
          known_year?: number
          manufacturer?: string
          model_number?: string | null
          notes?: string | null
          serial_number?: string
          source?: string | null
          updated_at?: string
          user_id?: string
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
      appliance_age_api_cache: {
        Row: {
          alternative_years: Json
          brand_key: string
          confidence_percent: number | null
          created_at: string
          expires_at: string
          id: string
          manufacture_month: number | null
          manufacture_year: number | null
          model_number: string
          raw_response: Json
          response_time_ms: number | null
          serial_number: string
          status_code: number
          success: boolean
          updated_at: string
        }
        Insert: {
          alternative_years?: Json
          brand_key: string
          confidence_percent?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          manufacture_month?: number | null
          manufacture_year?: number | null
          model_number: string
          raw_response: Json
          response_time_ms?: number | null
          serial_number: string
          status_code: number
          success: boolean
          updated_at?: string
        }
        Update: {
          alternative_years?: Json
          brand_key?: string
          confidence_percent?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          manufacture_month?: number | null
          manufacture_year?: number | null
          model_number?: string
          raw_response?: Json
          response_time_ms?: number | null
          serial_number?: string
          status_code?: number
          success?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      appliance_age_api_log: {
        Row: {
          brand: string
          created_at: string
          error_message: string | null
          event: string
          id: string
          model_number: string
          response_time_ms: number | null
          serial_number: string
          source: string | null
          status_code: number | null
          user_id: string | null
        }
        Insert: {
          brand: string
          created_at?: string
          error_message?: string | null
          event: string
          id?: string
          model_number: string
          response_time_ms?: number | null
          serial_number: string
          source?: string | null
          status_code?: number | null
          user_id?: string | null
        }
        Update: {
          brand?: string
          created_at?: string
          error_message?: string | null
          event?: string
          id?: string
          model_number?: string
          response_time_ms?: number | null
          serial_number?: string
          source?: string | null
          status_code?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      appliance_type_overrides: {
        Row: {
          appliance_type: string
          brand_display: string
          brand_key: string
          corrected_by: string | null
          correction_count: number
          created_at: string
          hit_count: number
          id: string
          last_used_at: string | null
          model_display: string
          model_key: string
          sub_type: string | null
          updated_at: string
        }
        Insert: {
          appliance_type: string
          brand_display: string
          brand_key: string
          corrected_by?: string | null
          correction_count?: number
          created_at?: string
          hit_count?: number
          id?: string
          last_used_at?: string | null
          model_display: string
          model_key: string
          sub_type?: string | null
          updated_at?: string
        }
        Update: {
          appliance_type?: string
          brand_display?: string
          brand_key?: string
          corrected_by?: string | null
          correction_count?: number
          created_at?: string
          hit_count?: number
          id?: string
          last_used_at?: string | null
          model_display?: string
          model_key?: string
          sub_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      diagnostic_outcomes: {
        Row: {
          actual_failure: string | null
          appliance_type: string
          complaint: string
          confirmed_at: string | null
          created_at: string
          id: string
          manufacturer: string
          model_number: string
          notes: string | null
          outcome: string
          platform: string | null
          recommended_failure: string
          session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_failure?: string | null
          appliance_type?: string
          complaint?: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          manufacturer?: string
          model_number?: string
          notes?: string | null
          outcome: string
          platform?: string | null
          recommended_failure?: string
          session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          actual_failure?: string | null
          appliance_type?: string
          complaint?: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          manufacturer?: string
          model_number?: string
          notes?: string | null
          outcome?: string
          platform?: string | null
          recommended_failure?: string
          session_id?: string | null
          updated_at?: string
          user_id?: string
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
      tech_sheet_lookups: {
        Row: {
          brand: string
          cache_hit: boolean
          confidence: string
          created_at: string
          id: string
          model_number: string
          outcome: string
          source_trust: string | null
          source_url: string | null
          user_id: string | null
        }
        Insert: {
          brand: string
          cache_hit?: boolean
          confidence: string
          created_at?: string
          id?: string
          model_number: string
          outcome: string
          source_trust?: string | null
          source_url?: string | null
          user_id?: string | null
        }
        Update: {
          brand?: string
          cache_hit?: boolean
          confidence?: string
          created_at?: string
          id?: string
          model_number?: string
          outcome?: string
          source_trust?: string | null
          source_url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      tech_sheets: {
        Row: {
          brand: string
          confidence: string
          content_markdown: string | null
          created_at: string
          created_by: string | null
          fault_codes: Json
          fetched_at: string
          id: string
          model_number: string
          platform_family: string | null
          source_trust: string
          source_type: string
          source_url: string | null
          test_points: Json
          updated_at: string
        }
        Insert: {
          brand: string
          confidence?: string
          content_markdown?: string | null
          created_at?: string
          created_by?: string | null
          fault_codes?: Json
          fetched_at?: string
          id?: string
          model_number: string
          platform_family?: string | null
          source_trust?: string
          source_type?: string
          source_url?: string | null
          test_points?: Json
          updated_at?: string
        }
        Update: {
          brand?: string
          confidence?: string
          content_markdown?: string | null
          created_at?: string
          created_by?: string | null
          fault_codes?: Json
          fetched_at?: string
          id?: string
          model_number?: string
          platform_family?: string | null
          source_trust?: string
          source_type?: string
          source_url?: string | null
          test_points?: Json
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
