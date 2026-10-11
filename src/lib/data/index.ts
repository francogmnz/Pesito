import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import type { UserProfile } from "@/lib/domain/types";
import { DEMO_ADMIN_ID, DEMO_USER_ID } from "./demo-seed";
import { createMemoryRepo } from "./memory";
import type { Repo } from "./repo";

export const DEMO_COOKIE = "pesito_demo";
export type DemoIdentity = "usuario" | "admin" | "anonimo";

/** Repo para el request actual (con la sesión de la persona). */
export const getRepo = cache(async (): Promise<Repo> => {
  if (!isSupabaseConfigured()) return createMemoryRepo();
  const [{ createUserClient }, { createSupabaseRepo }] = await Promise.all([import("@/lib/supabase/server"), import("./supabase")]);
  return createSupabaseRepo(await createUserClient());
});

/** Repo con permisos completos para tareas automáticas (cron). */
export async function getServiceRepo(): Promise<Repo> {
  if (!isSupabaseConfigured()) return createMemoryRepo();
  const [{ createServiceClient }, { createSupabaseRepo }] = await Promise.all([import("@/lib/supabase/server"), import("./supabase")]);
  return createSupabaseRepo(createServiceClient());
}

/** Persona logueada, o null. */
export const getCurrentUser = cache(async (): Promise<UserProfile | null> => {
  const repo = await getRepo();
  if (repo.mode === "demo") {
    const who = ((await cookies()).get(DEMO_COOKIE)?.value ?? "usuario") as DemoIdentity;
    if (who === "anonimo") return null;
    return repo.getProfile(who === "admin" ? DEMO_ADMIN_ID : DEMO_USER_ID);
  }
  const { createUserClient } = await import("@/lib/supabase/server");
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const profile = await repo.getProfile(data.user.id);
  return profile ? { ...profile, email: data.user.email ?? null } : null;
});
