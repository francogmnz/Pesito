import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/** Cliente con la sesión de la persona: respeta RLS. */
export async function createUserClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // En Server Components no se pueden escribir cookies; el proxy refresca la sesión.
        }
      },
    },
  });
}

/** Cliente con service role, solo para tareas automáticas del servidor (ingesta, vencimientos). */
export function createServiceClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY para las tareas automáticas.");
  if (key.startsWith("sb_publishable_")) throw new Error("SUPABASE_SERVICE_ROLE_KEY tiene la clave publishable: tiene que ser la secreta (sb_secret_... o la service_role legacy).");
  if (key.startsWith("eyJ")) {
    // Clave legacy: es un JWT. Si su rol no es service_role, es la anon y no ve las tablas internas.
    try {
      const role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")).role;
      if (role !== "service_role") throw new Error(`SUPABASE_SERVICE_ROLE_KEY tiene la clave "${role}": tiene que ser la service_role (la de abajo, en Legacy API Keys).`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("SUPABASE_SERVICE_ROLE_KEY")) throw e;
    }
  }
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
