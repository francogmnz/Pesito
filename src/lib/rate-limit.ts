import "server-only";

/**
 * Límite simple en memoria por clave (ventana deslizante). Alcanza para una instancia;
 * con varias instancias conviene moverlo a Redis/Upstash. Las sugerencias además
 * tienen límite en la base de datos (trigger), que es el que manda.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - list[0])) / 1000) };
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 10_000) hits.delete(hits.keys().next().value as string);
  return { ok: true, retryAfterSec: 0 };
}
