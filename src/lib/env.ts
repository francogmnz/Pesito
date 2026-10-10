// Configuración. Sin las variables de Supabase la app corre en modo demo (datos de ejemplo en memoria).

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 20;
}

export function isAiExtractionEnabled(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? "").length > 10;
}
