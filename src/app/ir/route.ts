import { NextResponse, type NextRequest } from "next/server";
import { getRepo } from "@/lib/data";
import { isSafePublicUrl } from "@/lib/domain/validation";

/**
 * Salida hacia un comercio: `/ir?k=producto|promo&u=<enlace>`.
 * Solo redirige a enlaces que Pesito tiene cargados (el de una publicación o la fuente de una promo publicada),
 * así no sirve para mandar a alguien a cualquier lado. De paso cuenta el clic y agrega de dónde viene la visita.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const target = url.searchParams.get("u") ?? "";
  const kind = url.searchParams.get("k") === "promo" ? "promo" : "producto";
  const home = NextResponse.redirect(new URL(kind === "promo" ? "/promos" : "/conviene", url.origin));
  if (target.length > 600 || !isSafePublicUrl(target)) return home;
  const out = await (await getRepo()).resolveOutbound(target, kind);
  if (!out) return home;
  const res = NextResponse.redirect(out, 302);
  // Que los buscadores no sigan ni indexen estas salidas.
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
