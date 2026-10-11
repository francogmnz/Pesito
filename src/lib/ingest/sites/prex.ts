import { MONTHS } from "@/lib/domain/dates";
import type { Source } from "@/lib/domain/types";
import type { RawCandidate } from "../adapters";
import { fetchPage } from "../fetch-page";
import { capPeriodFrom, extractNextData, findCouponCode, parseDateRange, parseDays, parseMoneyIn, parsePercent, parseSpanishDate, stripTags, truncate } from "../html";

export const PREX_URL = "https://www.prexcard.com.ar/promociones";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

export interface PrexItem {
  id: number;
  /** Slug de la página de la promo: /promociones/{slug}. */
  slug: string;
  title: string;
  /** Texto corto del listado: casi siempre los días ("Lunes", "Todos los días"). */
  days: string;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const oneLine = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Listado de Prex (Next.js): __NEXT_DATA__ → props.pageProps.promotionsData.
 * Solo trae título y días; tope, mínimo, vigencia y legales están en la página de cada promo.
 * Lo que no tiene porcentaje (transferencias sin comisión, asistencia sin costo) no es una promo de compra y se saltea.
 */
export function parsePrexList(html: string): PrexItem[] {
  const data = extractNextData(html) as Any;
  const list: Any[] | undefined = data?.props?.pageProps?.promotionsData;
  if (!Array.isArray(list) || !list.length) throw new Error("Prex: no se encontraron promociones en la página");
  return list.flatMap((p) => {
    const slug = oneLine(p?.name);
    const title = oneLine(p?.promotion_title);
    if (!p?.id || !/^[a-z0-9-]+$/i.test(slug) || parsePercent(title) == null || p.approved === 0) return [];
    return [{ id: Number(p.id), slug, title, days: oneLine(p.promotion_description) }];
  });
}

/** El comercio no viene como dato: se saca del título ("… en Sony Store") o, si no, del slug. */
function merchantOf(item: PrexItem): { name: string; guessed: boolean } {
  const word = item.slug.split("-")[0].replace(/\d+$/, "");
  const tail = item.title
    .replace(/\s+(pagando|abonando)\s.*$/i, "")
    .replace(/\s+con\s+(tu\s+)?prex.*$/i, "")
    .match(/\s(?:en|con)\s+(?!tu\b|tus\b|el\b|la\b|los\b|las\b)(\p{Lu}[^,.]*)$/u);
  if (tail && tail[1].split(" ").length <= 5) return { name: tail[1].trim(), guessed: false };
  // El slug aparece en el título ("App YPF"): se usa como está escrito ahí.
  const inTitle = item.title.split(/\s+/).find((w) => norm(w).replace(/[^a-z0-9]/g, "") === word.toLowerCase());
  if (inTitle) return { name: inTitle.replace(/[^\p{L}\p{N}]/gu, ""), guessed: false };
  return { name: word.length <= 4 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1), guessed: true };
}

const MONTH_NAMES = MONTHS.map(norm);
const VALIDITY = /v[aá]lid[ao]s?\s+(?:exclusivamente\s+|todos los d[ií]as,?\s+)?(?:desde|del|hasta|para)|promoci[oó]n vigente|vigencia de la promoci[oó]n/gi;

/** Vigencia según los términos: "desde el 28/09/2026 hasta el 31/10/2026", "del 1° al 31 de octubre de 2026", "de octubre 2026". */
function validity(legal: string, today: string): { from: string | null; until: string | null } {
  for (const hit of legal.matchAll(VALIDITY)) {
    const seg = legal.slice(hit.index, hit.index + 200).replace(/[°º]/g, "");
    const slashed = [...seg.matchAll(/\d{1,2}\/\d{1,2}\/\d{2,4}/g)].map((m) => parseSpanishDate(m[0], today));
    if (slashed.length >= 2) return { from: slashed[0], until: slashed[1] };
    if (slashed.length === 1) return { from: null, until: slashed[0] };
    const range = parseDateRange(seg, today);
    if (range.until) return range;
    // Mes entero: "los viernes, sábados y domingos de octubre 2026".
    const m = norm(seg).match(new RegExp(`(?:de|del mes de)\\s+(${MONTH_NAMES.join("|")})\\s+(?:de\\s+|del\\s+)?(\\d{4})`));
    if (m) {
      const month = MONTH_NAMES.indexOf(m[1]) + 1;
      const y = Number(m[2]);
      return { from: `${y}-${pad(month)}-01`, until: `${y}-${pad(month)}-${pad(new Date(Date.UTC(y, month, 0)).getUTCDate())}` };
    }
  }
  return { from: null, until: null };
}

/**
 * Página de una promo de Prex: __NEXT_DATA__ → props.pageProps.currentBenefit.description
 * (HTML con la bajada y los términos). De ahí salen tope, mínimo, vigencia y código.
 */
export function parsePrexPromo(item: PrexItem, html: string, today: string): RawCandidate {
  const data = extractNextData(html) as Any;
  const benefit: Any | undefined = data?.props?.pageProps?.currentBenefit;
  if (!benefit?.description) throw new Error(`Prex: la página de «${item.slug}» no trae el detalle de la promo`);
  const text = stripTags(String(benefit.description).replace(/<\/(p|h\d|li)>/gi, "\n"));
  const cut = text.search(/t[eé]rminos y condiciones/i);
  const intro = oneLine(cut < 0 ? text.slice(0, 400) : text.slice(0, cut));
  const legal = cut < 0 ? text : text.slice(cut).replace(/^t[eé]rminos y condiciones\s*/i, "");
  const all = `${intro}\n${legal}`;
  const flags: string[] = [];

  const title = oneLine(benefit.promotion_title) || item.title;
  const merchant = merchantOf({ ...item, title });
  if (merchant.guessed) flags.push("El comercio se dedujo de la dirección de la página: revisar el nombre.");
  if (/\bhasta\s+\d{1,3}\s*%/i.test(title)) flags.push("El porcentaje es «hasta»: puede ser menor según el producto.");

  const code = findCouponCode(intro) ?? findCouponCode(legal);
  const newOnly = /primera compra|nuevos? usuarios?|usuarios? nuevos?/i.test(`${item.days} ${intro}`);

  const capText = all.match(/tope[^$\n]{0,80}\$\s?[\d.]+[^.\n]{0,80}/i)?.[0] ?? null;
  const cap = parseMoneyIn(capText);
  // "Tope: $15.000 por usuario" no dice cada cuánto: se toma como tope de toda la promo.
  const capHasPeriod = /seman|mensual|por mes|al mes|diari|por d[ií]a|por (viaje|compra|pedido|transacci)/i.test(capText ?? "");
  if (cap && !capHasPeriod) flags.push("El tope no aclara el período: se cargó como tope de toda la promo.");
  if (!cap && !/sin tope/i.test(all)) flags.push("La página no menciona tope: confirmar que no tiene.");
  const minText = all.match(/(?:m[ií]nimo de compra|compra m[ií]nima|a partir de)[^$\n]{0,60}\$\s?[\d.]+/i)?.[0] ?? null;

  const { from, until } = validity(legal, today);
  if (!until) flags.push("No se encontró la vigencia en los términos.");

  const local = /sucursales|presencial|\bQR\b|\bNFC\b/i.test(all);
  const online = !!code || /\b(web|online|sitio|tienda online)\b/i.test(all);

  return {
    externalId: `prex:${item.id}`,
    ...(flags.length ? { flags } : {}),
    kind: code ? "cupon" : /reintegro/i.test(`${title} ${intro}`) ? "reintegro" : "descuento",
    audience: newOnly ? "nuevos_clientes" : "todos",
    merchantName: merchant.name,
    title: truncate(title, 140) ?? undefined,
    summary: truncate(intro, 280),
    wallet: "Prex",
    paymentMethodSlugs: ["prex"],
    discountKind: "porcentaje",
    discountValue: parsePercent(title),
    capAmount: cap,
    capPeriod: !cap ? "sin_tope" : capHasPeriod ? capPeriodFrom(capText) : "vigencia",
    minPurchase: parseMoneyIn(minText),
    validFrom: from,
    validUntil: until,
    daysOfWeek: parseDays(item.days.split(/,|\sy\s/)),
    channel: local && !online ? "local" : online && !local ? "online" : "ambos",
    conditions: truncate(legal, 3800),
    requirements: [],
    sourceUrl: `${PREX_URL}/${item.slug}`,
    coupon: code ? { redemption: "codigo", code: code.toUpperCase(), newCustomersOnly: newOnly, requiresExternalSignup: false, externalPlatform: null } : null,
  };
}

/**
 * Lector de Prex: el listado y después la página de cada promo (unas 15), con pausa entre pedidos.
 * Si alguna página falla se corta la corrida entera: una lista incompleta se leería como bajas.
 */
export async function fetchPrex(source: Source, fetcher: typeof fetch, today: string): Promise<RawCandidate[]> {
  const delayMs = Math.min(Math.max(Number(source.config.delayMs ?? 500) || 0, 0), 10_000);
  const robotsCache = new Map<string, string | null>();
  const base = (source.url || PREX_URL).replace(/\/+$/, "");
  const items = parsePrexList(await fetchPage(base, fetcher, { robotsCache })).slice(0, 60);
  const out: RawCandidate[] = [];
  for (const item of items) {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    out.push(parsePrexPromo(item, await fetchPage(`${base}/${item.slug}`, fetcher, { robotsCache }), today));
  }
  return out;
}
