import { isValidISODate, todayAR } from "@/lib/domain/dates";
import type { PromoPayload, Source } from "@/lib/domain/types";
import { isSafePublicUrl } from "@/lib/domain/validation";
import { fetchPage } from "./fetch-page";
import { MERCADOPAGO_URL, parseMercadoPago } from "./sites/mercadopago";
import { parsePedidosYa, PEDIDOSYA_URL } from "./sites/pedidosya";
import { parseUala, UALA_URL } from "./sites/uala";

/** Candidato tal como sale de una fuente: parcial, con un identificador estable en esa fuente. */
export type RawCandidate = Partial<PromoPayload> & { externalId: string };

export interface Adapter {
  readonly name: string;
  fetchCandidates(source: Source, fetcher?: typeof fetch): Promise<RawCandidate[]>;
}

const MAX_FEED_BYTES = 2 * 1024 * 1024;

/**
 * Feed JSON autorizado: un array de promos (o { promos: [...] }) publicado por un
 * comercio, banco o socio que nos dio permiso. Se puede mapear el nombre de cada
 * campo con source.config.fieldMap, por ejemplo { "merchantName": "comercio" }.
 * No hace scraping de sitios: solo lee feeds pensados para ser consumidos.
 */
export const jsonFeedAdapter: Adapter = {
  name: "json-feed",
  async fetchCandidates(source, fetcher = fetch) {
    if (!isSafePublicUrl(source.url)) throw new Error(`URL de fuente no permitida: ${source.url}`);
    const res = await fetcher(source.url, { headers: { accept: "application/json", "user-agent": "PesitoBot/1.0 (+https://pesito.app)" }, signal: AbortSignal.timeout(15_000), redirect: "error" });
    if (!res.ok) throw new Error(`La fuente respondió ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_FEED_BYTES) throw new Error("El feed es demasiado grande");
    const json = JSON.parse(text) as unknown;
    const list = Array.isArray(json) ? json : Array.isArray((json as { promos?: unknown }).promos) ? (json as { promos: unknown[] }).promos : [];
    const map = (source.config.fieldMap ?? {}) as Record<string, string>;
    const defaults = (source.config.defaults ?? {}) as Partial<PromoPayload>;
    return list.slice(0, 2000).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const o = item as Record<string, unknown>;
      const pick = (k: keyof PromoPayload | "externalId") => o[map[k] ?? k];
      const externalId = String(pick("externalId") ?? pick("title") ?? "").slice(0, 120);
      if (!externalId) return [];
      return [normalizeRaw({ ...defaults, ...Object.fromEntries(FIELDS.map((k) => [k, pick(k)]).filter(([, v]) => v !== undefined)), externalId })];
    });
  },
};

const FIELDS: (keyof PromoPayload)[] = [
  "kind", "audience", "merchantName", "categorySlug", "title", "summary", "bank", "wallet", "paymentMethodSlugs",
  "discountKind", "discountValue", "capAmount", "capPeriod", "minPurchase", "validFrom", "validUntil", "daysOfWeek",
  "channel", "conditions", "requirements", "sourceUrl", "coupon", "birthday",
];

const numOrNull = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".")) : Number(v);
  return v == null || v === "" || !Number.isFinite(n) ? null : n;
};
const strOrNull = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Limpia tipos y valores sueltos que vienen de afuera. Lo que no se entiende queda null. */
export function normalizeRaw(o: Record<string, unknown> & { externalId: string }): RawCandidate {
  const date = (v: unknown) => (typeof v === "string" && isValidISODate(v.slice(0, 10)) ? v.slice(0, 10) : null);
  const days = Array.isArray(o.daysOfWeek) ? o.daysOfWeek.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : null;
  return {
    externalId: o.externalId,
    kind: (["reintegro", "descuento", "cupon", "cumple"].includes(o.kind as string) ? o.kind : undefined) as PromoPayload["kind"] | undefined,
    audience: (["todos", "nuevos_clientes", "cumpleanieros", "miembros"].includes(o.audience as string) ? o.audience : undefined) as PromoPayload["audience"] | undefined,
    merchantName: strOrNull(o.merchantName, 80) ?? undefined,
    categorySlug: strOrNull(o.categorySlug, 40),
    title: strOrNull(o.title, 140) ?? undefined,
    summary: strOrNull(o.summary, 280),
    bank: strOrNull(o.bank, 60),
    wallet: strOrNull(o.wallet, 60),
    paymentMethodSlugs: Array.isArray(o.paymentMethodSlugs) ? o.paymentMethodSlugs.map(String).slice(0, 20) : [],
    discountKind: (["porcentaje", "monto_fijo", "regalo"].includes(o.discountKind as string) ? o.discountKind : undefined) as PromoPayload["discountKind"] | undefined,
    discountValue: numOrNull(o.discountValue),
    capAmount: numOrNull(o.capAmount),
    capPeriod: (["compra", "dia", "semana", "mes", "vigencia", "sin_tope"].includes(o.capPeriod as string) ? o.capPeriod : undefined) as PromoPayload["capPeriod"] | undefined,
    minPurchase: numOrNull(o.minPurchase),
    validFrom: date(o.validFrom),
    validUntil: date(o.validUntil),
    daysOfWeek: days && days.length && days.length < 7 ? [...new Set(days)].sort() : null,
    channel: (["online", "local", "ambos"].includes(o.channel as string) ? o.channel : undefined) as PromoPayload["channel"] | undefined,
    conditions: strOrNull(o.conditions, 4000),
    requirements: Array.isArray(o.requirements) ? (o.requirements.map(String) as PromoPayload["requirements"]) : [],
    sourceUrl: typeof o.sourceUrl === "string" && isSafePublicUrl(o.sourceUrl) ? o.sourceUrl : null,
    coupon: (o.coupon && typeof o.coupon === "object" ? o.coupon : null) as PromoPayload["coupon"],
    birthday: (o.birthday && typeof o.birthday === "object" ? o.birthday : null) as PromoPayload["birthday"],
  };
}

/** Páginas públicas de promociones: cada sitio tiene su lector. Todo lo que leen va a revisión. */
const pageAdapter = (name: string, defaultUrl: string, parse: (html: string, today: string) => RawCandidate[]): Adapter => ({
  name,
  async fetchCandidates(source, fetcher = fetch) {
    const html = await fetchPage(source.url || defaultUrl, fetcher);
    return parse(html, todayAR()).map((c) => normalizeRaw(c as Record<string, unknown> & { externalId: string }));
  },
});

export const ADAPTERS: Record<string, Adapter> = {
  [jsonFeedAdapter.name]: jsonFeedAdapter,
  uala: pageAdapter("uala", UALA_URL, parseUala),
  pedidosya: pageAdapter("pedidosya", PEDIDOSYA_URL, (html) => parsePedidosYa(html)),
  mercadopago: pageAdapter("mercadopago", MERCADOPAGO_URL, parseMercadoPago),
};
