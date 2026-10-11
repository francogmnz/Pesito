import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

/** IP anonimizada (hash con sal) para límites antispam. Nunca guardamos la IP en claro. */
export async function ipHash(): Promise<string | null> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT ?? "pesito-dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Rutas internas válidas para "volver a" (evita redirecciones abiertas). */
export function safeNext(next: unknown, fallback = "/"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : fallback;
}
