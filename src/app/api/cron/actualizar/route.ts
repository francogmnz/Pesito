import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceRepo } from "@/lib/data";
import { todayAR } from "@/lib/domain/dates";
import { runAllSources } from "@/lib/ingest/run";

export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secret.length < 16 || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/**
 * Actualización automática: lee las fuentes autorizadas, detecta promos nuevas y cambios,
 * manda lo dudoso a revisión y vence lo terminado. Programalo cada pocas horas
 * (Vercel Cron, Supabase pg_cron + pg_net, o cualquier cron con el header Authorization).
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const summary = await runAllSources(await getServiceRepo(), { today: todayAR() });
    return NextResponse.json(summary);
  } catch (e) {
    // Quien llama ya mostró la clave: puede ver el motivo real para arreglarlo (por ejemplo, una variable que falta).
    console.error("cron actualizar", e);
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 500 });
  }
}
