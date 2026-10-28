import { createClient } from '@supabase/supabase-js'

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    return url
  }
  return 'https://placeholder.supabase.co'
}

function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
}

export const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey())

export const UPLOAD_BUCKET = 'order-uploads'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      packages: {
        Row: {
          id: string
          name: string
          price: number
          description: string | null
          items?: string[] | null
          included_charms?: number | null
          included_custom_charms?: number | null
          bracelet_count?: number | null
          included_keychains?: number | null
          sort_order?: number | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          price: number
          description?: string | null
          items?: string[] | null
          included_charms?: number | null
          included_custom_charms?: number | null
          bracelet_count?: number | null
          included_keychains?: number | null
          sort_order?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          price?: number
          description?: string | null
          items?: string[] | null
          included_charms?: number | null
          included_custom_charms?: number | null
          bracelet_count?: number | null
          included_keychains?: number | null
          sort_order?: number | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      charms: {
        Row: {
          id: string
          emoji: string
          name: string | null
          image_url?: string | null
          catalog_index?: number | null
          price?: number | null
          is_active: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          emoji: string
          name?: string | null
          image_url?: string | null
          catalog_index?: number | null
          price?: number | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          emoji?: string
          name?: string | null
          image_url?: string | null
          catalog_index?: number | null
          price?: number | null
          is_active?: boolean
          sort_order?: number
          created_at?: string
        }
      }
      settings: {
        Row: {
          id: number
          slot_count: number
          admin_password: string
          whatsapp_number: string | null
          batch_label?: string | null
          charm_price?: number | null
          custom_charm_price?: number | null
          keychain_price?: number | null
          keychain_double_price?: number | null
          pickup_options?: string[] | null
          qris_image_url?: string | null
          keychain_shapes?: string[] | null
          instagram_username?: string | null
          tiktok_username?: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          slot_count?: number
          admin_password?: string
          whatsapp_number?: string | null
          batch_label?: string | null
          charm_price?: number | null
          custom_charm_price?: number | null
          keychain_price?: number | null
          keychain_double_price?: number | null
          pickup_options?: string[] | null
          qris_image_url?: string | null
          keychain_shapes?: string[] | null
          instagram_username?: string | null
          tiktok_username?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          slot_count?: number
          admin_password?: string
          whatsapp_number?: string | null
          batch_label?: string | null
          charm_price?: number | null
          custom_charm_price?: number | null
          keychain_price?: number | null
          keychain_double_price?: number | null
          pickup_options?: string[] | null
          qris_image_url?: string | null
          keychain_shapes?: string[] | null
          instagram_username?: string | null
          tiktok_username?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      orders: {
        Row: {
          id: string
          order_code?: string | null
          package_id: string | null
          package_name: string
          package_price: number
          charms: string[]
          slot_count: number
          photo_url: string | null
          zoom_level: number
          quantity: number
          total_price: number
          items?: Json | null
          customer_name: string
          customer_whatsapp: string
          customer_email?: string | null
          customer_instagram?: string | null
          customer_address: string
          pickup_method?: string | null
          payment_proof_url?: string | null
          status: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_code?: string | null
          package_id?: string | null
          package_name: string
          package_price: number
          charms?: string[]
          slot_count?: number
          photo_url?: string | null
          zoom_level?: number
          quantity?: number
          total_price: number
          items?: Json | null
          customer_name: string
          customer_whatsapp: string
          customer_email?: string | null
          customer_instagram?: string | null
          customer_address: string
          pickup_method?: string | null
          payment_proof_url?: string | null
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_code?: string | null
          package_id?: string | null
          package_name?: string
          package_price?: number
          charms?: string[]
          slot_count?: number
          photo_url?: string | null
          zoom_level?: number
          quantity?: number
          total_price?: number
          items?: Json | null
          customer_name?: string
          customer_whatsapp?: string
          customer_email?: string | null
          customer_instagram?: string | null
          customer_address?: string
          pickup_method?: string | null
          payment_proof_url?: string | null
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

export type Package = Database['public']['Tables']['packages']['Row']
export type Charm = Database['public']['Tables']['charms']['Row']
export type Settings = Database['public']['Tables']['settings']['Row']
export type Order = Database['public']['Tables']['orders']['Row']
export type OrderInsert = Database['public']['Tables']['orders']['Insert']
