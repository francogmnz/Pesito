import type { Source } from "@/lib/domain/types";
import type { RawCandidate } from "../adapters";
import { fetchPage } from "../fetch-page";
import { capPeriodFrom, decodeEntities, findCouponCode, parseDays, parseMoneyIn, parsePercent, truncate } from "../html";

export const BELO_URL = "https://www.belo.app/ar/beneficios";

export interface BeloCard {
  slug: string;
  merchant: string;
  benefit: string;
  /** "31 oct 2026", tal como lo muestra la tarjeta. */
  until: string | null;
  category: string | null;
}

const MONTH: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const CATEGORY: Record<string, string> = { transporte: "transporte", gastronomia: "gastronomia", delivery: "delivery", supermercados: "supermercados", farmacias: "farmacias", combustible: "combustible", entretenimiento: "entretenimiento", indumentaria: "indumentaria", tecnologia: "tecnologia" };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** Textos del HTML, uno por elemento, sin etiquetas ni restos de estilos. */
const texts = (html: string) =>
  decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, "\n"))
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/** "31 oct 2026" → 2026-10-31. */
export function parseShortDate(s: string | null | undefined): string | null {
  const m = norm(s ?? "").match(/(\d{1,2})\s+([a-z]{3,4})\.?\s+(\d{4})/);
  const month = m ? MONTH[m[2]] : undefined;
  return m && month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/**
 * Página de beneficios de Belo (Framer): una tarjeta por beneficio con comercio, titular, vencimiento y rubro.
 * La misma tarjeta viene repetida para cada tamaño de pantalla: se deja una por enlace.
 * Tope, mínimo y días están en la página de cada beneficio.
 */
export function parseBeloList(html: string): BeloCard[] {
  const parts = html.split(/data-framer-name="Card beneficio ARG"/).slice(1);
  if (!parts.length) throw new Error("Belo: no se encontraron beneficios en la página");
  const out = new Map<string, BeloCard>();
  for (const part of parts) {
    const slug = part.match(/href="\.?\/?(?:ar\/)?beneficios\/([^"#?]+)"/)?.[1];
    if (!slug || out.has(slug)) continue;
    // El corte cae en medio de una etiqueta: se descarta el resto de la que abre y el comienzo de la siguiente.
    const field = (name: string) => {
      const piece = part.split(`data-framer-name="${name}"`)[1]?.split(/data-framer-name="/)[0] ?? "";
      return texts(piece.slice(piece.indexOf(">") + 1).replace(/<[^>]*$/, "")).join(" ");
    };
    const merchant = field("Empresa");
    const benefit = field("Intro");
    if (!merchant || parsePercent(benefit) == null) continue;
    const all = texts(part.slice(0, 9000));
    const at = all.findIndex((t) => /v[aá]lido hasta/i.test(t));
    out.set(slug, { slug: decodeURIComponent(slug), merchant, benefit, until: at >= 0 ? (parseShortDate(all[at]) ? all[at] : (all[at + 1] ?? null)) : null, category: field("Filtros") || null });
  }
  return [...out.values()];
}

/** Página de un beneficio: "Mecánica" (porcentaje, tope, mínimo), "Vigencia" (días) y "Productos" (con qué tarjeta). */
export function beloCandidate(card: BeloCard, detailHtml: string | null): RawCandidate {
  const flags: string[] = [];
  const notes: string[] = [];
  const all = detailHtml ? texts(detailHtml) : [];
  // Las promos de la tarjeta traen "Mecánica"; los descuentos de comercios aliados, un texto libre después del vencimiento.
  const mechanics = all.findIndex((t) => /^mec[aá]nica/i.test(t));
  const afterDate = all.findIndex((t) => /v[aá]lido hasta/i.test(t));
  const start = mechanics >= 0 ? mechanics : afterDate >= 0 ? afterDate + 2 : -1;
  const end = all.findIndex((t, i) => i > start && /^(quiero el beneficio|volver a beneficios)/i.test(t));
  const body = start >= 0 ? all.slice(start, end > start ? end : start + 25) : [];
  const text = body.join("\n");
  if (!detailHtml) flags.push("No se pudo leer la página del beneficio: faltan tope y condiciones.");
  else if (mechanics < 0) notes.push("La página del beneficio no detalla la mecánica: se cargó con el texto que trae.");

  const pct = parsePercent(card.benefit);
  if (/\bhasta\s+\d{1,3}\s*%/i.test(card.benefit)) flags.push("El porcentaje es «hasta»: puede ser menor según el producto.");
  const reintegro = /reintegro|cashback/i.test(`${card.benefit} ${text}`);
  const code = findCouponCode(text);
  const newOnly = /nuevos usuarios|usuarios nuevos|primer(a|os)? (compra|viaje|pedido)/i.test(`${card.merchant} ${card.benefit} ${text}`);

  const capText = text.match(/tope[^$\n]{0,40}\$\s?[\d.]+[^\n]{0,60}/i)?.[0] ?? null;
  const cap = parseMoneyIn(capText);
  const capHasPeriod = /seman|mensual|por mes|al mes|diari|por d[ií]a|por (viaje|compra|pedido|transacci)/i.test(capText ?? "");
  if (cap && !capHasPeriod) notes.push("El tope no aclara el período: se cargó como tope de toda la promo.");
  if (body.length && !cap && !/sin tope/i.test(text)) notes.push("La página no menciona tope.");
  const min = parseMoneyIn(text.match(/compra m[ií]nima[^$\n]{0,20}\$\s?[\d.]+/i)?.[0]);

  const merchantName = card.merchant.replace(/\s+(nuevos usuarios|x boca)$/i, "").trim();
  const until = parseShortDate(card.until);
  if (!until) flags.push("No se encontró hasta cuándo vale.");
  const at = body.findIndex((t) => /^vigencia/i.test(t));
  const when = at >= 0 ? `${body[at]} ${body[at + 1] ?? ""}` : "";
  const cat = card.category ? CATEGORY[norm(card.category)] : undefined;

  return {
    externalId: `belo:${card.slug}`.slice(0, 120),
    ...(flags.length ? { flags } : {}),
    ...(notes.length ? { notes } : {}),
    kind: code ? "cupon" : reintegro ? "reintegro" : "descuento",
    audience: newOnly ? "nuevos_clientes" : "todos",
    merchantName,
    categorySlug: cat ?? null,
    title: truncate(`${pct}% de ${reintegro ? "reintegro" : "descuento"} en ${merchantName} con Belo`, 140) ?? undefined,
    summary: truncate(card.benefit, 280),
    wallet: "Belo",
    paymentMethodSlugs: ["belo"],
    discountKind: "porcentaje",
    discountValue: pct,
    capAmount: cap,
    capPeriod: !cap ? "sin_tope" : capHasPeriod ? capPeriodFrom(capText) : "vigencia",
    minPurchase: min,
    validFrom: null,
    validUntil: until,
    daysOfWeek: /lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo/i.test(when) ? parseDays(when.replace(/todos los/gi, "").split(/,|\sy\s/)) : null,
    channel: "ambos",
    conditions: truncate(text.replace(/\n:/g, ":"), 3800),
    requirements: [],
    sourceUrl: `${BELO_URL}/${encodeURIComponent(card.slug)}`,
    coupon: code ? { redemption: "codigo", code: code.toUpperCase(), newCustomersOnly: newOnly, requiresExternalSignup: false, externalPlatform: null } : null,
  };

}

/** Lector de Belo: el listado y la página de cada beneficio, con pausa. Una página que falla manda esa promo a revisión. */
export async function fetchBelo(source: Source, fetcher: typeof fetch): Promise<RawCandidate[]> {
  const delayMs = Math.min(Math.max(Number(source.config.delayMs ?? 800) || 0, 0), 10_000);
  const robotsCache = new Map<string, string | null>();
  const base = (source.url || BELO_URL).replace(/\/+$/, "");
  const cards = parseBeloList(await fetchPage(base, fetcher, { robotsCache })).slice(0, 80);
  const out: RawCandidate[] = [];
  for (const card of cards) {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    let detail: string | null = null;
    try {
      detail = await fetchPage(`${base}/${encodeURIComponent(card.slug)}`, fetcher, { robotsCache });
    } catch (e) {
      if (e instanceof Error && /robots\.txt/.test(e.message)) throw e;
    }
    // Beneficios sin fecha ni mecánica (herramientas para empresas, convenios permanentes): no son una promo que se pueda verificar.
    if (!card.until && detail && !/mec[aá]nica/i.test(detail)) continue;
    out.push(beloCandidate(card, detail));
  }
  return out;
}
