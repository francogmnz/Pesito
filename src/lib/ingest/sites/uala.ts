import type { RawCandidate } from "../adapters";
import { capPeriodFrom, extractNextData, findCouponCode, parseDays, parseMoneyIn, parsePercent, parseSpanishDate, truncate } from "../html";

export const UALA_URL = "https://www.uala.com.ar/promociones";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;
const fieldsOf = (x: any): Any => (x && typeof x === "object" && "fields" in x ? x.fields : (x ?? {}));

const CATEGORY: Record<string, string> = {
  combustible: "combustible",
  delivery: "delivery",
  transporte: "transporte",
  entretenimiento: "entretenimiento",
  ecommerce: "tiendas-online",
  supermercados: "supermercados",
  farmacias: "farmacias",
  gastronomia: "gastronomia",
  indumentaria: "indumentaria",
  tecnologia: "tecnologia",
  educacion: "educacion",
};
const catSlug = (c: string | undefined) => (c ? (CATEGORY[c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")] ?? null) : null);

/**
 * Página de promociones de Ualá (Next.js + Contentful). Las promos vienen en
 * __NEXT_DATA__ → props.pageProps.page.components[*].promociones. Una promo puede
 * tener varias "specs" (variantes): cada una es un candidato.
 */
export function parseUala(html: string, today: string): RawCandidate[] {
  const data = extractNextData(html) as Any;
  const components: Any[] = data?.props?.pageProps?.page?.components ?? [];
  const promos: Any[] = components.flatMap((c) => (Array.isArray(c?.promociones) ? c.promociones : []));
  if (!promos.length) throw new Error("Ualá: no se encontraron promociones en la página");

  const out: RawCandidate[] = [];
  for (const entry of promos) {
    const f = fieldsOf(entry);
    const id: string = entry?.sys?.id ?? f.urlDeLaPromocion;
    const brand = String(f.brand ?? "").trim();
    if (!id || !brand) continue;
    const specs: Any[] = (f.PromotionSpecs ?? []).map(fieldsOf);
    specs.forEach((s, i) => {
      const headline = String(s.titularDescuento ?? f.previewTitle ?? "").trim();
      const detail = String(s.previewDescripcion ?? f.previewDescription ?? "").trim();
      const label = String((f.mobileLabel ?? [])[0] ?? f.promotionType?.[0] ?? "").toLowerCase();
      const pct = parsePercent(f.mobileDetail) ?? parsePercent(headline);
      const code = findCouponCode(`${detail} ${headline}`);
      const reintegro = /reintegro|reembolso/.test(label) || /reintegro/i.test(headline);
      const places: string[] = s.PromotionPlace ?? [];
      const online = places.some((p) => /online/i.test(p));
      const fisico = places.some((p) => /f[ií]sico|local/i.test(p));
      const cap = parseMoneyIn(s.PromotionCashback);
      const min = detail.match(/a partir de \$\s?[\d.]+/i) ? parseMoneyIn(detail.match(/a partir de (\$\s?[\d.]+)/i)![1]) : null;
      const generic = !headline || /^\d+%\s*de (reintegro|descuento)\s*$/i.test(headline);
      const mentionsBrand = headline.toLowerCase().includes(brand.toLowerCase());
      const title = generic ? `${headline || `${pct}%`} en ${brand}` : mentionsBrand ? headline : `${headline} · ${brand}`;
      out.push({
        externalId: `uala:${id}${specs.length > 1 ? `:${i}` : ""}`,
        kind: code ? "cupon" : reintegro ? "reintegro" : "descuento",
        audience: code && /primer|nuev/i.test(detail) ? "nuevos_clientes" : "todos",
        merchantName: brand,
        categorySlug: catSlug(fieldsOf(f.PromotionCategory?.[0]).Category),
        title: truncate(title.replace(/\s+/g, " "), 140) ?? undefined,
        summary: truncate(detail, 280),
        wallet: "Ualá",
        paymentMethodSlugs: ["uala"],
        discountKind: "porcentaje",
        discountValue: pct,
        capAmount: cap,
        capPeriod: cap ? capPeriodFrom(s.PromotionCashback) : "sin_tope",
        minPurchase: min,
        validUntil: parseSpanishDate(s.PromotionDate, today),
        daysOfWeek: parseDays(s.PromotionDays),
        channel: online && fisico ? "ambos" : online ? "online" : fisico ? "local" : "ambos",
        conditions: truncate(
          [
            (s.promotionPayment ?? []).length ? `Medios: ${(s.promotionPayment as string[]).join(", ")}.` : null,
            s.PromotionCashDate && !/^[-–\s]*$/.test(String(s.PromotionCashDate)) ? `Acreditación: ${String(s.PromotionCashDate).trim()}.` : null,
            s.promotionLegal ? String(s.promotionLegal) : null,
          ]
            .filter(Boolean)
            .join("\n\n"),
          3800,
        ),
        requirements: /app de /i.test(detail) ? ["solo_app"] : [],
        sourceUrl: f.urlDeLaPromocion ? `${UALA_URL}/${encodeURIComponent(f.urlDeLaPromocion)}` : UALA_URL,
        coupon: code ? { redemption: "codigo", code: code.toUpperCase(), newCustomersOnly: /primer|nuev/i.test(detail), requiresExternalSignup: false, externalPlatform: null } : null,
      });
    });
  }
  return out;
}
