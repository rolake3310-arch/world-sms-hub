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
      app_settings: {
        Row: {
          bank_enabled: boolean
          bank_instructions: string | null
          crypto_enabled: boolean
          currency: string
          default_price_usd: number
          id: number
          min_fund_usd: number
          squad_enabled: boolean
          squad_environment: string
          squad_public_key: string | null
          updated_at: string
        }
        Insert: {
          bank_enabled?: boolean
          bank_instructions?: string | null
          crypto_enabled?: boolean
          currency?: string
          default_price_usd?: number
          id?: number
          min_fund_usd?: number
          squad_enabled?: boolean
          squad_environment?: string
          squad_public_key?: string | null
          updated_at?: string
        }
        Update: {
          bank_enabled?: boolean
          bank_instructions?: string | null
          crypto_enabled?: boolean
          currency?: string
          default_price_usd?: number
          id?: number
          min_fund_usd?: number
          squad_enabled?: boolean
          squad_environment?: string
          squad_public_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          active: boolean
          bank_name: string
          created_at: string
          extra: string | null
          id: string
          label: string
        }
        Insert: {
          account_name: string
          account_number: string
          active?: boolean
          bank_name: string
          created_at?: string
          extra?: string | null
          id?: string
          label: string
        }
        Update: {
          account_name?: string
          account_number?: string
          active?: boolean
          bank_name?: string
          created_at?: string
          extra?: string | null
          id?: string
          label?: string
        }
        Relationships: []
      }
      country_prices: {
        Row: {
          country_code: string
          country_name: string
          price_usd: number
          updated_at: string
        }
        Insert: {
          country_code: string
          country_name: string
          price_usd: number
          updated_at?: string
        }
        Update: {
          country_code?: string
          country_name?: string
          price_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      crypto_wallets: {
        Row: {
          active: boolean
          address: string
          asset: string
          created_at: string
          id: string
          label: string
          network: string | null
        }
        Insert: {
          active?: boolean
          address: string
          asset: string
          created_at?: string
          id?: string
          label: string
          network?: string | null
        }
        Update: {
          active?: boolean
          address?: string
          asset?: string
          created_at?: string
          id?: string
          label?: string
          network?: string | null
        }
        Relationships: []
      }
      deposits: {
        Row: {
          amount_usd: number
          asset: string | null
          created_at: string
          id: string
          method: Database["public"]["Enums"]["deposit_method"]
          notes: string | null
          proof_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          squad_ref: string | null
          status: Database["public"]["Enums"]["deposit_status"]
          tx_reference: string | null
          user_id: string
        }
        Insert: {
          amount_usd: number
          asset?: string | null
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["deposit_method"]
          notes?: string | null
          proof_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          squad_ref?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          tx_reference?: string | null
          user_id: string
        }
        Update: {
          amount_usd?: number
          asset?: string | null
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["deposit_method"]
          notes?: string | null
          proof_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          squad_ref?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          tx_reference?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          balance_usd: number
          created_at: string
          email: string
          full_name: string | null
          id: string
          status: Database["public"]["Enums"]["user_status"]
        }
        Insert: {
          balance_usd?: number
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          status?: Database["public"]["Enums"]["user_status"]
        }
        Update: {
          balance_usd?: number
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          status?: Database["public"]["Enums"]["user_status"]
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          cost_usd: number
          country_code: string | null
          created_at: string
          error: string | null
          gateway_id: string | null
          id: string
          message: string
          recipient: string
          segments: number
          sender: string
          status: Database["public"]["Enums"]["sms_status"]
          user_id: string
        }
        Insert: {
          cost_usd?: number
          country_code?: string | null
          created_at?: string
          error?: string | null
          gateway_id?: string | null
          id?: string
          message: string
          recipient: string
          segments?: number
          sender: string
          status?: Database["public"]["Enums"]["sms_status"]
          user_id: string
        }
        Update: {
          cost_usd?: number
          country_code?: string | null
          created_at?: string
          error?: string | null
          gateway_id?: string | null
          id?: string
          message?: string
          recipient?: string
          segments?: number
          sender?: string
          status?: Database["public"]["Enums"]["sms_status"]
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
      credit_balance: {
        Args: { _amount: number; _user_id: string }
        Returns: number
      }
      debit_balance: {
        Args: { _amount: number; _user_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      deposit_method: "crypto" | "squad" | "bank_transfer"
      deposit_status: "pending" | "approved" | "rejected"
      sms_status: "queued" | "sent" | "failed"
      user_status: "active" | "suspended"
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
      app_role: ["admin", "user"],
      deposit_method: ["crypto", "squad", "bank_transfer"],
      deposit_status: ["pending", "approved", "rejected"],
      sms_status: ["queued", "sent", "failed"],
      user_status: ["active", "suspended"],
    },
  },
} as const
