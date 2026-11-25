export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface OrderItemJson {
  productId?: string;
  name: string;
  qty: number;
  price: number;
  unit?: string;
}

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: string;
          name: string;
          category: string;
          grade: string;
          badge_text: string;
          badge_color: string;
          farmer: string;
          warehouse: string;
          stock_kg: number;
          base_weekly_sales: number;
          base_farmer_price: number;
          rating: number;
          price_b2c: number;
          price_b2b: number;
          unit: string;
          image_url: string;
          qc_notes: string;
          updated_at: string | null;
        };
        Insert: {
          id: string;
          name: string;
          category: string;
          grade: string;
          badge_text: string;
          badge_color: string;
          farmer: string;
          warehouse: string;
          stock_kg?: number;
          base_weekly_sales?: number;
          base_farmer_price?: number;
          rating?: number;
          price_b2c: number;
          price_b2b: number;
          unit: string;
          image_url: string;
          qc_notes: string;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['products']['Insert']>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          date_label: string;
          buyer_mode: 'B2C' | 'B2B';
          status:
            | 'PACKING_QR'
            | 'IN_TRANSIT'
            | 'ARRIVED_PENDING_POD'
            | 'COMPLETED'
            | 'RETURN_REQUESTED'
            | 'CANCELLED';
          status_label: string;
          courier: string;
          qr_code_resi: string;
          payment_method: string;
          items: OrderItemJson[];
          shipping_fee: number;
          total_amount: number;
          pod_signed: boolean;
          pod_timestamp: string | null;
          pod_signed_at?: string | null;
          pod_signature_data?: string | null;
          return_requested?: boolean;
          return_reason?: string | null;
          return_requested_at?: string | null;
          created_at: string | null;
        };
        Insert: {
          id: string;
          date_label?: string;
          buyer_mode?: 'B2C' | 'B2B';
          status:
            | 'PACKING_QR'
            | 'IN_TRANSIT'
            | 'ARRIVED_PENDING_POD'
            | 'COMPLETED'
            | 'RETURN_REQUESTED'
            | 'CANCELLED';
          status_label: string;
          courier: string;
          qr_code_resi: string;
          payment_method: string;
          items: OrderItemJson[];
          shipping_fee: number;
          total_amount: number;
          pod_signed?: boolean;
          pod_timestamp?: string | null;
          pod_signed_at?: string | null;
          pod_signature_data?: string | null;
          return_requested?: boolean;
          return_reason?: string | null;
          return_requested_at?: string | null;
          created_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
        Relationships: [];
      };
      supply_plans: {
        Row: {
          id: string;
          commodity_id: string;
          commodity_name: string;
          target_qty: number;
          ref_price: number;
          harvest_date: string;
          status: 'WAITING_FARMER' | 'CONFIRMED_BY_FARMER' | 'PO_ISSUED' | 'CANCELLED';
          confirmed_qty: number;
          agreed_price: number;
          created_at: string | null;
        };
        Insert: {
          id: string;
          commodity_id: string;
          commodity_name: string;
          target_qty: number;
          ref_price: number;
          harvest_date: string;
          status?: 'WAITING_FARMER' | 'CONFIRMED_BY_FARMER' | 'PO_ISSUED' | 'CANCELLED';
          confirmed_qty: number;
          agreed_price: number;
          created_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['supply_plans']['Insert']>;
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          po_number: string;
          plan_id: string;
          commodity_id: string;
          commodity_name: string;
          qty: number;
          agreed_price: number;
          total_amount: number;
          status: 'PO_ISSUED' | 'HARVEST_SENT_TO_QC' | 'QC_COMPLETED' | 'CANCELLED';
          grade_a_kg?: number | null;
          grade_b_kg?: number | null;
          grade_b_pouches?: number | null;
          qc_completed_at?: string | null;
          created_at: string | null;
        };
        Insert: {
          po_number: string;
          plan_id: string;
          commodity_id: string;
          commodity_name: string;
          qty: number;
          agreed_price: number;
          total_amount: number;
          status?: 'PO_ISSUED' | 'HARVEST_SENT_TO_QC' | 'QC_COMPLETED' | 'CANCELLED';
          grade_a_kg?: number | null;
          grade_b_kg?: number | null;
          grade_b_pouches?: number | null;
          qc_completed_at?: string | null;
          created_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['purchase_orders']['Insert']>;
        Relationships: [];
      };
      sales_history: {
        Row: {
          id: number;
          recorded_date: string;
          commodity_id: string;
          sold_b2c_kg: number;
          sold_b2b_kg: number;
          total_demand_kg: number;
          weather_condition: string;
          is_weekend: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Insert: {
          id?: number;
          recorded_date: string;
          commodity_id: string;
          sold_b2c_kg: number;
          sold_b2b_kg: number;
          total_demand_kg: number;
          weather_condition: string;
          is_weekend?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['sales_history']['Insert']>;
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: number;
          product_id: string;
          delta: number;
          stock_before: number;
          stock_after: number;
          reason:
            | 'ORDER_CHECKOUT'
            | 'QC_GRADE_A'
            | 'QC_GRADE_B_PROCESSED'
            | 'MANUAL_ADJUSTMENT'
            | 'ORDER_CANCEL_RESTOCK';
          reference_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          product_id: string;
          delta: number;
          stock_before: number;
          stock_after: number;
          reason:
            | 'ORDER_CHECKOUT'
            | 'QC_GRADE_A'
            | 'QC_GRADE_B_PROCESSED'
            | 'MANUAL_ADJUSTMENT'
            | 'ORDER_CANCEL_RESTOCK';
          reference_id?: string | null;
          note?: string | null;
        };
        Update: Partial<Database['public']['Tables']['stock_movements']['Insert']>;
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['app_settings']['Insert']>;
        Relationships: [];
      };
      order_returns: {
        Row: {
          id: number;
          order_id: string;
          reason: string;
          status: 'OPEN' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
          created_at: string;
        };
        Insert: {
          order_id: string;
          reason: string;
          status?: 'OPEN' | 'APPROVED' | 'REJECTED' | 'RESOLVED';
        };
        Update: Partial<Database['public']['Tables']['order_returns']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      sync_bundle_stock: {
        Args: { p_bundle_id?: string };
        Returns: number;
      };
      adjust_product_stock: {
        Args: {
          p_product_id: string;
          p_new_stock: number;
          p_note?: string | null;
        };
        Returns: Json;
      };
      checkout_order: {
        Args: {
          p_order_id: string;
          p_buyer_mode: string;
          p_courier: string;
          p_qr_code_resi: string;
          p_payment_method: string;
          p_shipping_fee: number;
          p_cart: Json;
          p_recorded_date: string;
          p_is_weekend: boolean;
        };
        Returns: Json;
      };
      issue_purchase_order: {
        Args: {
          p_plan_id: string;
          p_po_number: string;
        };
        Returns: Json;
      };
      complete_qc_grading: {
        Args: {
          p_po_number: string;
          p_grade_a_kg: number;
          p_grade_b_kg: number;
          p_pouches_per_kg?: number;
          p_processed_product_id?: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
