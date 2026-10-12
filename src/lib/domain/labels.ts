import { formatARS, formatPercent } from "./money";
import type { BirthdayDetails, CapPeriod, PromoKind, Promotion, Requirement, SalesChannel } from "./types";

export const KIND_LABEL: Record<PromoKind, string> = {
  reintegro: "Reintegro",
  descuento: "Descuento",
  cupon: "Cupón",
  cumple: "Cumpleaños",
};

export const REQUIREMENT_LABEL: Record<Requirement, string> = {
  registro_previo: "Requiere registrarse antes",
  presentar_dni: "Requiere presentar DNI",
  programa_fidelizacion: "Requiere ser parte del programa de beneficios",
  primera_compra: "Solo en la primera compra",
  solo_app: "Solo comprando desde la app",
  cuenta_nueva: "Solo con cuenta nueva",
};

export const CAP_PERIOD_LABEL: Record<CapPeriod, string> = {
  compra: "por compra",
  dia: "por día",
  semana: "por semana",
  mes: "por mes",
  vigencia: "en toda la promo",
  sin_tope: "",
};

export const CHANNEL_LABEL: Record<SalesChannel, string> = {
  online: "Solo online",
  local: "Solo en locales",
  ambos: "Locales y online",
};

export const BENEFIT_LABEL: Record<BirthdayDetails["benefit"], string> = {
  descuento: "Descuento",
  regalo: "Regalo",
  cupon: "Cupón",
  experiencia: "Experiencia",
};

/** Número grande de la tarjeta: "25%", "$ 5.000", "Regalo". */
export function headline(p: Pick<Promotion, "discountKind" | "discountValue">): string {
  if (p.discountKind === "regalo") return "Regalo";
  if (p.discountValue == null) return "—";
  return p.discountKind === "porcentaje" ? formatPercent(p.discountValue) : formatARS(p.discountValue);
}

/** Texto que acompaña al número: "de reintegro", "de descuento", "off". */
export function headlineSuffix(p: Pick<Promotion, "kind" | "discountKind">): string {
  if (p.discountKind === "regalo") return "de cumpleaños";
  if (p.kind === "reintegro") return "de reintegro";
  return "de descuento";
}

export function capLabel(p: Pick<Promotion, "capAmount" | "capPeriod">): string {
  if (!p.capAmount) return "Sin tope informado";
  const per = CAP_PERIOD_LABEL[p.capPeriod];
  return `${formatARS(p.capAmount)}${per ? ` ${per}` : ""}`;
}

/**
 * Compra con la que se aprovecha la promo al máximo: la que llega justo al tope
 * (o la compra mínima, si es mayor). Solo para porcentajes con tope.
 */
export function sweetSpot(p: Pick<Promotion, "discountKind" | "discountValue" | "capAmount" | "capPeriod" | "minPurchase">): { amount: number; saving: number; period: string } | null {
  if (p.discountKind !== "porcentaje" || !p.discountValue || !p.capAmount) return null;
  const toCap = Math.ceil(p.capAmount / (p.discountValue / 100));
  const amount = Math.max(toCap, p.minPurchase ?? 0);
  return { amount, saving: p.capAmount, period: CAP_PERIOD_LABEL[p.capPeriod] };
}

export function paymentLabel(p: Pick<Promotion, "paymentMethods">): string {
  const names = p.paymentMethods.map((m) => m.name);
  if (names.length === 0) return "Cualquier medio de pago";
  if (names.length <= 2) return `Con ${names.join(" o ")}`;
  return `Con ${names.slice(0, 2).join(", ")} y ${names.length - 2} más`;
}

export const CATEGORY_ICON: Record<string, string> = {
  supermercados: "cart",
  farmacias: "pill",
  gastronomia: "fork",
  delivery: "bike",
  combustible: "fuel",
  indumentaria: "shirt",
  tecnologia: "device",
  "tiendas-online": "bag",
  belleza: "sparkle",
  entretenimiento: "ticket",
  transporte: "bus",
  educacion: "book",
};

/**
 * Rubros donde el "comercio" no es una marca sino un servicio (colectivos, subte,
 * peajes…). Ahí el ícono del rubro dice más que las iniciales, y "local" no
 * significa "en locales".
 */
const GENERIC_PLACES: [RegExp, string, string][] = [
  [/colectivo|\bsube\b|bondi/i, "En colectivos", "bus"],
  [/\bsubte/i, "En el subte", "bus"],
  [/\btren(es)?\b/i, "En trenes", "bus"],
  [/peaje/i, "En peajes", "bus"],
  [/\btaxi|remis/i, "En taxis", "bus"],
];

function genericPlace(name: string) {
  return GENERIC_PLACES.find(([re]) => re.test(name));
}

/** Ícono para mostrar en lugar de iniciales, si el comercio es un servicio genérico. */
export function genericMerchantIcon(m: { name: string; categorySlug?: string | null }): string | null {
  const g = genericPlace(m.name);
  if (g) return g[2];
  return m.categorySlug === "transporte" ? (CATEGORY_ICON.transporte ?? null) : null;
}

/** Texto de "Dónde aplica" según el rubro, no solo el canal. */
export function whereLabel(p: Pick<Promotion, "channel"> & { merchant: { name: string; categorySlug: string | null } }): string {
  const g = genericPlace(p.merchant.name);
  if (g) return p.channel === "online" ? `${g[1]}, pagando desde la app` : g[1];
  switch (p.merchant.categorySlug) {
    case "transporte":
      return p.channel === "online" ? "En la app de viajes" : "Al pagar el viaje";
    case "combustible":
      return p.channel === "online" ? "Pagando desde la app" : p.channel === "local" ? "En estaciones de servicio" : "En estaciones y en la app";
    case "delivery":
      return "En la app";
    default:
      return CHANNEL_LABEL[p.channel];
  }
}
