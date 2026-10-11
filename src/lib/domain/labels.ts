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
};
