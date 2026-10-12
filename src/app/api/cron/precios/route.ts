import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServiceRepo } from "@/lib/data";
import { runPriceSources } from "@/lib/prices/crawl";

export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secret.length < 16 || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/**
 * Precios de «Comparar precios»: lee una tanda de páginas de producto de cada comercio y guarda
 * el precio vigente. Va aparte de la actualización de promos para no competir por el tiempo de la función.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await runPriceSources(await getServiceRepo()));
  } catch (e) {
    console.error("cron precios", e);
    return NextResponse.json({ error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 500 });
  }
}
