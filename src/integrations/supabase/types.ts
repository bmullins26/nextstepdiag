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
      beta_applications: {
        Row: {
          access_status: string
          activated_at: string | null
          application_status: string
          approved_at: string | null
          approved_by: string | null
          beta_wave: number
          calls_per_week: number
          company: string | null
          created_at: string
          deactivated_at: string | null
          email: string
          experience_years: number
          first_name: string
          id: string
          invite_accepted_at: string | null
          invite_code: string | null
          invited_at: string | null
          last_name: string
          last_status_reason: string | null
          location: string
          location_raw: string | null
          notes: string | null
          owner_labels: string[]
          owner_notes: string | null
          owner_notes_updated_at: string | null
          owner_notes_updated_by: string | null
          owner_rating: number | null
          primary_brands: Json
          reason: string
          referred_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          role: string
          source: string
          state: string | null
          status: string
          suspended_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_status?: string
          activated_at?: string | null
          application_status?: string
          approved_at?: string | null
          approved_by?: string | null
          beta_wave?: number
          calls_per_week: number
          company?: string | null
          created_at?: string
          deactivated_at?: string | null
          email: string
          experience_years: number
          first_name: string
          id?: string
          invite_accepted_at?: string | null
          invite_code?: string | null
          invited_at?: string | null
          last_name: string
          last_status_reason?: string | null
          location: string
          location_raw?: string | null
          notes?: string | null
          owner_labels?: string[]
          owner_notes?: string | null
          owner_notes_updated_at?: string | null
          owner_notes_updated_by?: string | null
          owner_rating?: number | null
          primary_brands?: Json
          reason: string
          referred_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role: string
          source?: string
          state?: string | null
          status?: string
          suspended_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_status?: string
          activated_at?: string | null
          application_status?: string
          approved_at?: string | null
          approved_by?: string | null
          beta_wave?: number
          calls_per_week?: number
          company?: string | null
          created_at?: string
          deactivated_at?: string | null
          email?: string
          experience_years?: number
          first_name?: string
          id?: string
          invite_accepted_at?: string | null
          invite_code?: string | null
          invited_at?: string | null
          last_name?: string
          last_status_reason?: string | null
          location?: string
          location_raw?: string | null
          notes?: string | null
          owner_labels?: string[]
          owner_notes?: string | null
          owner_notes_updated_at?: string | null
          owner_notes_updated_by?: string | null
          owner_rating?: number | null
          primary_brands?: Json
          reason?: string
          referred_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          role?: string
          source?: string
          state?: string | null
          status?: string
          suspended_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      community_attachments: {
        Row: {
          created_at: string
          discussion_id: string | null
          id: string
          mime_type: string
          reply_id: string | null
          size_bytes: number
          storage_path: string
          uploader_id: string
        }
        Insert: {
          created_at?: string
          discussion_id?: string | null
          id?: string
          mime_type: string
          reply_id?: string | null
          size_bytes?: number
          storage_path: string
          uploader_id: string
        }
        Update: {
          created_at?: string
          discussion_id?: string | null
          id?: string
          mime_type?: string
          reply_id?: string | null
          size_bytes?: number
          storage_path?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_attachments_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "community_discussions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_attachments_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "community_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      community_discussions: {
        Row: {
          appliance_type: string
          author_id: string
          body: string
          brand: string
          complaint: string
          confirmed_failure: string | null
          confirmed_failure_count: number
          confirmed_success_count: number
          created_at: string
          discussion_type: string
          error_code: string | null
          family_key: string | null
          helpful_count: number
          id: string
          like_count: number
          model_number: string
          reply_count: number
          solved_reply_id: string | null
          success_rate: number | null
          tags: string[]
          title: string
          updated_at: string
          verified_outcome_id: string | null
          view_count: number
        }
        Insert: {
          appliance_type: string
          author_id: string
          body?: string
          brand: string
          complaint: string
          confirmed_failure?: string | null
          confirmed_failure_count?: number
          confirmed_success_count?: number
          created_at?: string
          discussion_type: string
          error_code?: string | null
          family_key?: string | null
          helpful_count?: number
          id?: string
          like_count?: number
          model_number: string
          reply_count?: number
          solved_reply_id?: string | null
          success_rate?: number | null
          tags?: string[]
          title: string
          updated_at?: string
          verified_outcome_id?: string | null
          view_count?: number
        }
        Update: {
          appliance_type?: string
          author_id?: string
          body?: string
          brand?: string
          complaint?: string
          confirmed_failure?: string | null
          confirmed_failure_count?: number
          confirmed_success_count?: number
          created_at?: string
          discussion_type?: string
          error_code?: string | null
          family_key?: string | null
          helpful_count?: number
          id?: string
          like_count?: number
          model_number?: string
          reply_count?: number
          solved_reply_id?: string | null
          success_rate?: number | null
          tags?: string[]
          title?: string
          updated_at?: string
          verified_outcome_id?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_discussions_verified_outcome_id_fkey"
            columns: ["verified_outcome_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_outcomes"
            referencedColumns: ["id"]
          },
        ]
      }
      community_insight_feedback: {
        Row: {
          created_at: string
          discussion_id: string
          final_outcome: string | null
          id: string
          insight_snapshot: Json
          session_id: string | null
          updated_at: string
          user_id: string
          user_response: string | null
        }
        Insert: {
          created_at?: string
          discussion_id: string
          final_outcome?: string | null
          id?: string
          insight_snapshot?: Json
          session_id?: string | null
          updated_at?: string
          user_id: string
          user_response?: string | null
        }
        Update: {
          created_at?: string
          discussion_id?: string
          final_outcome?: string | null
          id?: string
          insight_snapshot?: Json
          session_id?: string | null
          updated_at?: string
          user_id?: string
          user_response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_insight_feedback_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "community_discussions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_insight_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reactions: {
        Row: {
          created_at: string
          id: string
          reaction: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reaction: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reaction?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      community_replies: {
        Row: {
          author_id: string
          body: string
          created_at: string
          discussion_id: string
          edited_at: string | null
          helpful_count: number
          id: string
          is_solved: boolean
          like_count: number
          not_helpful_count: number
          parent_reply_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          discussion_id: string
          edited_at?: string | null
          helpful_count?: number
          id?: string
          is_solved?: boolean
          like_count?: number
          not_helpful_count?: number
          parent_reply_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          discussion_id?: string
          edited_at?: string | null
          helpful_count?: number
          id?: string
          is_solved?: boolean
          like_count?: number
          not_helpful_count?: number
          parent_reply_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_replies_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "community_discussions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_replies_parent_reply_id_fkey"
            columns: ["parent_reply_id"]
            isOneToOne: false
            referencedRelation: "community_replies"
            referencedColumns: ["id"]
          },
        ]
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
          evidence_used: Json
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
          evidence_used?: Json
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
          evidence_used?: Json
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
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          plan_type: string | null
          price_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          plan_type?: string | null
          price_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          plan_type?: string | null
          price_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      tech_talk_messages: {
        Row: {
          body: string
          channel: string
          created_at: string
          id: string
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tech_talk_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tech_talk_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          active: boolean
          affiliate_url: string | null
          category: string
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          notes: string | null
          quantity: number
          subcategory: string | null
          tool_name: string
          tool_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          affiliate_url?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          quantity?: number
          subcategory?: string | null
          tool_name: string
          tool_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          affiliate_url?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          quantity?: number
          subcategory?: string | null
          tool_name?: string
          tool_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          created_at: string
          lookups_used: number
          period_month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          lookups_used?: number
          period_month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          lookups_used?: number
          period_month?: string
          updated_at?: string
          user_id?: string
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
      _beta_guess_state: { Args: { input: string }; Returns: string }
      _community_recompute_success: {
        Args: { disc_id: string }
        Returns: undefined
      }
      community_family_key: {
        Args: { brand: string; model: string }
        Returns: string
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_pro_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_lookup: { Args: { _user_id: string }; Returns: Json }
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
