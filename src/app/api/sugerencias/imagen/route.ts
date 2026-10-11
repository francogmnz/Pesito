import { NextResponse } from "next/server";
import { getCurrentUser, getRepo } from "@/lib/data";

/**
 * Sirve capturas en modo demo (en Supabase se usan URLs firmadas del bucket privado).
 * Solo el admin o la persona que la subió pueden verla.
 */
export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && !path.startsWith(`${user.id}/`))) return new NextResponse("No autorizado", { status: 403 });
  const repo = await getRepo();
  if (repo.mode !== "demo") return new NextResponse("No disponible", { status: 404 });
  const { getDemoImage } = await import("@/lib/data/memory");
  const img = getDemoImage(path);
  if (!img) return new NextResponse("No encontrada", { status: 404 });
  return new NextResponse(Buffer.from(img.bytes), {
    headers: { "content-type": img.type, "cache-control": "private, max-age=300", "content-security-policy": "default-src 'none'", "x-content-type-options": "nosniff" },
  });
}
