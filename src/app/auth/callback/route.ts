import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { safeNext } from "@/lib/request";

/** Vuelta del enlace mágico de Supabase: canjea el código por una sesión. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("volver"));
  const code = url.searchParams.get("code");
  if (code && isSupabaseConfigured()) {
    const { createUserClient } = await import("@/lib/supabase/server");
    const supabase = await createUserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/ingresar?error=enlace", url.origin));
}
