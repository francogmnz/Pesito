import { slugify } from "@/lib/domain/fingerprint";
import type { Source } from "@/lib/domain/types";
import type { RawCandidate } from "../adapters";
import { fetchPage } from "../fetch-page";
import { capPeriodFrom, decodeEntities, parseDays, parseMoneyIn, parsePercent, parseValidity, stripTags, truncate } from "../html";

export const BRUBANK_URL = "https://www.brubank.com/beneficios";

/** Cada plan tiene su tanda de promos: el color de la tarjeta dice de cuál es. */
const PLAN: Record<string, string> = { dark: "Plan Ultra", purple: "Plan Plus", white: "Plan One" };

export interface BrubankCard {
  plan: string;
  merchant: string;
  benefit: string;
  /** "Tope de reintegro: $6.000" o "Sin tope", si la tarjeta lo dice. */
  cap: string | null;
  days: string;
  /** Artículo del centro de ayuda con la vigencia y las condiciones. */
  articleUrl: string | null;
}

const lines = (html: string) =>
  decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .split("\n")
    .map((l) => l.replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

/**
 * Página de beneficios de Brubank (Webflow): un carrusel de tarjetas por plan, cada una con el beneficio,
 * el comercio, el tope y los días. La vigencia y los términos están en el artículo de ayuda que enlaza.
 * Las tarjetas de solo cuotas se saltean.
 */
export function parseBrubankList(html: string): BrubankCard[] {
  const parts = html.split(/class="special-card-carousel card-promo-/).slice(1);
  if (!parts.length) throw new Error("Brubank: no se encontraron promociones en la página");
  const out: BrubankCard[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const plan = PLAN[part.match(/^([a-z]+)/)?.[1] ?? ""];
    const h4 = part.match(/<h4[^>]*>([\s\S]*?)<\/h4>/)?.[1];
    // Todo lo que sigue al título dentro de la tarjeta: uno o dos párrafos con tope, días y el enlace.
    const p = part.slice(part.indexOf("</h4>"), part.indexOf("</h4>") + 1500);
    if (!plan || !h4) continue;
    const head = lines(h4);
    const benefit = head.filter((l) => /%|cuota|inter[eé]s|reintegro|descuento/i.test(l)).join(" ");
    const merchant = head.filter((l) => !/%|cuota|inter[eé]s|reintegro|descuento/i.test(l)).join(" ");
    if (!merchant || parsePercent(benefit) == null) continue;
    const info = lines(p.replace(/<a[\s\S]*?<\/a>/g, ""));
    // Algunas tarjetas enlazan con http: se pasa siempre a https.
    const path = p.match(/href="https?:\/\/help\.brubank\.com(\/[^"#?]+)/)?.[1];
    const articleUrl = path ? `https://help.brubank.com${path}` : null;
    const card: BrubankCard = { plan, merchant, benefit, cap: info.find((l) => /tope/i.test(l)) ?? null, days: info.find((l) => !/tope/i.test(l)) ?? "", articleUrl };
    const key = `${plan}|${merchant}|${benefit}`.toLowerCase();
    if (seen.has(key)) continue; // el carrusel repite tarjetas
    seen.add(key);
    out.push(card);
  }
  return out;
}

/** Texto del artículo de ayuda (Intercom): la bajada con la vigencia y el cuerpo con los términos. */
export function brubankArticleText(html: string): string {
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
  const body = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)?.[1] ?? "";
  return `${decodeEntities(description)}\n${stripTags(body.replace(/<\/(p|h\d|li|div)>/gi, "\n"))}`.replace(/[​-‍﻿]/g, "").trim();
}

export function brubankCandidate(card: BrubankCard, article: string | null, today: string): RawCandidate {
  const flags: string[] = [];
  const notes: string[] = [];
  const pct = parsePercent(card.benefit);
  if (/\bhasta\s+\d{1,3}\s*%/i.test(card.benefit)) flags.push("El porcentaje es «hasta»: puede ser menor según el producto.");
  const reintegro = /reintegro/i.test(`${card.benefit} ${card.cap ?? ""}`);

  const articleCap = article?.match(/tope[^$\n]{0,60}\$\s?[\d.]+(?:,\d+)?[^.\n]{0,80}/i)?.[0] ?? null;
  const cap = parseMoneyIn(card.cap) ?? parseMoneyIn(articleCap);
  const noCap = /sin tope/i.test(`${card.cap ?? ""} ${article ?? ""}`);
  const capHasPeriod = /seman|mensual|por mes|al mes|diari|por d[ií]a|por (viaje|compra|pedido|transacci)/i.test(articleCap ?? "");
  if (cap && !capHasPeriod) notes.push("El tope no aclara el período: se cargó como tope de toda la promo.");
  if (!cap && !noCap) notes.push("La página no menciona tope.");

  const { from, until } = parseValidity(article, today);
  if (!article) flags.push("La tarjeta no enlaza las condiciones: falta la vigencia.");
  else if (!until) flags.push("No se encontró hasta cuándo vale en las condiciones.");
  // El artículo es compartido por varios comercios: si no nombra a este, puede ser de otra promo.
  if (article && !article.toLowerCase().includes(card.merchant.toLowerCase().split(/\s+/)[0])) flags.push("Las condiciones enlazadas no nombran a este comercio: verificar.");

  const min = parseMoneyIn(article?.match(/(?:consumos?|compras?) (?:superiores|mayores|iguales)[^$\n]{0,40}\$\s?[\d.]+/i)?.[0]);
  const planNote = card.plan === "Plan One" ? null : `Solo para clientes con ${card.plan}.`;
  if (planNote) notes.push(`Solo para un plan (“${card.plan}”): quedó en el título y las condiciones`);

  return {
    externalId: `brubank:${slugify(card.plan)}:${slugify(card.merchant)}:${pct}`,
    ...(flags.length ? { flags } : {}),
    ...(notes.length ? { notes } : {}),
    kind: reintegro ? "reintegro" : "descuento",
    audience: "todos",
    merchantName: card.merchant,
    title: truncate(`${pct}% de ${reintegro ? "reintegro" : "descuento"} en ${card.merchant} con Brubank${planNote ? ` · ${card.plan}` : ""}`, 140) ?? undefined,
    summary: truncate(`${card.benefit} en ${card.merchant}. ${card.days}${card.cap ? `. ${card.cap}` : ""}.`.replace(/\.\./g, "."), 280),
    bank: "Brubank",
    paymentMethodSlugs: ["brubank"],
    discountKind: "porcentaje",
    discountValue: pct,
    capAmount: cap,
    capPeriod: !cap ? "sin_tope" : capHasPeriod ? capPeriodFrom(articleCap) : "vigencia",
    // Los "consumos superiores a $200" de los términos no son un mínimo que le importe a nadie.
    minPurchase: min && min >= 1000 ? min : null,
    validFrom: from,
    validUntil: until,
    daysOfWeek: parseDays(card.days.replace(/todos los/gi, "").split(/,|\sy\s/)),
    channel: "ambos",
    conditions: truncate([planNote, article].filter(Boolean).join("\n\n"), 3800),
    requirements: [],
    sourceUrl: card.articleUrl ?? BRUBANK_URL,
  };
}

/**
 * Lector de Brubank: la página de beneficios y después el artículo de cada promo (uno por pedido, con la
 * pausa que pide su robots.txt). Un artículo que falla no corta la corrida: esa promo va a revisión sin vigencia.
 */
export async function fetchBrubank(source: Source, fetcher: typeof fetch, today: string): Promise<RawCandidate[]> {
  const delayMs = Math.min(Math.max(Number(source.config.delayMs ?? 1100) || 0, 0), 10_000);
  const robotsCache = new Map<string, string | null>();
  const cards = parseBrubankList(await fetchPage(source.url || BRUBANK_URL, fetcher, { robotsCache })).slice(0, 150);
  const articles = new Map<string, string | null>();
  for (const url of [...new Set(cards.flatMap((c) => (c.articleUrl ? [c.articleUrl] : [])))].slice(0, 60)) {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    try {
      articles.set(url, brubankArticleText(await fetchPage(url, fetcher, { robotsCache })) || null);
    } catch (e) {
      if (e instanceof Error && /robots\.txt/.test(e.message)) throw e;
      articles.set(url, null);
    }
  }
  return cards.map((c) => brubankCandidate(c, c.articleUrl ? (articles.get(c.articleUrl) ?? null) : null, today));
}
