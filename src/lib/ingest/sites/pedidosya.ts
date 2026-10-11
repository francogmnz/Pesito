import type { RawCandidate } from "../adapters";
import { extractNextData, parseDays } from "../html";

export const PEDIDOSYA_URL = "https://www.pedidosya.com.ar/promotions-section/promotions";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

const BUSINESS: Record<string, string> = {
  RESTAURANT: "restaurantes",
  SHOP: "tiendas",
  PHARMACY: "farmacias",
  COFFEE: "cafeterías",
  FLOWERS: "florerías",
  KIOSKS: "kioscos",
  GROCERIES: "mercados",
  PETS: "mascotas",
  DRINKS: "bebidas",
};

/** Nombres de PedidosYa que no coinciden con los del catálogo de Pesito. */
const ISSUER_ALIAS: Record<string, string> = {
  "banco provincia de buenos aires": "Banco Provincia",
  "banco santander": "Santander",
  "banco galicia": "Galicia",
  "banco macro": "Macro",
};

/**
 * Sección de promociones bancarias de PedidosYa (Next.js). Los descuentos con
 * bancos y tarjetas vienen en __NEXT_DATA__ → props.pageProps.initialState.promotion
 * (todayIncentives y weekIncentives). No traen tope ni vigencia: van a revisión.
 */
export function parsePedidosYa(html: string): RawCandidate[] {
  const data = extractNextData(html) as Any;
  const p: Any = data?.props?.pageProps?.initialState?.promotion ?? {};
  const list: Any[] = [...(p.todayIncentives ?? []), ...(p.weekIncentives ?? [])];
  if (!list.length) throw new Error("PedidosYa: no se encontraron promociones en la página");

  const seen = new Set<string>();
  const out: RawCandidate[] = [];
  for (const x of list) {
    const id = String(x?.id ?? "");
    if (!id || seen.has(id) || x?.type !== "PAYMENT_METHOD") continue;
    seen.add(id);
    const d: Any = x.discount ?? {};
    const amount = Number(d.amount);
    if (!(amount > 0)) continue;
    const pct = d.calculationType === "PERCENTAGE";
    if (pct && amount > 100) continue;
    const issuerRaw = String(x.paymentMethods?.issuer?.name ?? "").trim();
    if (!issuerRaw) continue;
    const issuer = ISSUER_ALIAS[issuerRaw.toLowerCase()] ?? issuerRaw;
    const labels: string[] = x.paymentMethods?.labels ?? [];
    const reintegro = d.subtype === "REIMBURSEMENT";
    const where = (x.businessType ?? []).map((b: string) => BUSINESS[b] ?? b.toLowerCase());
    const benefit = pct ? `${amount}% de ${reintegro ? "reintegro" : "descuento"}` : `$${amount} de descuento`;
    out.push({
      externalId: `pedidosya:${id}`,
      kind: reintegro ? "reintegro" : "descuento",
      audience: x.isLoyaltyIncentive ? "miembros" : "todos",
      merchantName: "PedidosYa",
      categorySlug: "delivery",
      title: `${benefit} en PedidosYa con ${issuer}`,
      summary: labels.length ? `Pagando con ${labels.join(" o ").toLowerCase()} de ${issuer}.` : null,
      bank: issuer,
      discountKind: pct ? "porcentaje" : "monto_fijo",
      discountValue: amount,
      capAmount: null,
      daysOfWeek: parseDays(x.daysOfWeek),
      channel: "online",
      conditions: [where.length ? `Aplica en: ${where.join(", ")}.` : null, x.isLoyaltyIncentive ? "Solo para suscriptores de PedidosYa Plus." : null, "Consultá tope y vigencia en la app de PedidosYa o de tu banco."]
        .filter(Boolean)
        .join(" "),
      requirements: x.isLoyaltyIncentive ? ["programa_fidelizacion", "solo_app"] : ["solo_app"],
      sourceUrl: PEDIDOSYA_URL,
    });
  }
  return out;
}
