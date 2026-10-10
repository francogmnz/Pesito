import { dayOfWeek, daysBetween, formatDays } from "./dates";
import { formatARS } from "./money";
import type { DiscountKind, PaymentMethod, Promotion } from "./types";

export interface CalcInput {
  amount: number;
  discountKind: DiscountKind;
  discountValue: number | null;
  capAmount: number | null;
  minPurchase: number | null;
  /** Parte del tope que ya usaste en el período. */
  capUsed?: number;
}

export interface CalcResult {
  eligible: boolean;
  reason: string | null;
  saving: number;
  finalCost: number;
  capRemaining: number | null;
  capReached: boolean;
  /** 0..1 del tope consumido después de esta compra. */
  capProgress: number | null;
  /** Monto de compra con el que se alcanza el tope (solo porcentaje con tope). */
  amountForFullCap: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calcSaving(input: CalcInput): CalcResult {
  const amount = Math.max(0, input.amount || 0);
  const used = Math.max(0, input.capUsed ?? 0);
  const cap = input.capAmount && input.capAmount > 0 ? input.capAmount : null;
  const capRemaining = cap != null ? Math.max(0, cap - used) : null;
  const value = input.discountValue ?? 0;
  const base: CalcResult = {
    eligible: true,
    reason: null,
    saving: 0,
    finalCost: amount,
    capRemaining,
    capReached: capRemaining === 0,
    capProgress: cap ? Math.min(1, used / cap) : null,
    amountForFullCap: input.discountKind === "porcentaje" && cap && value > 0 ? round2(cap / (value / 100)) : null,
  };

  if (input.discountKind === "regalo") {
    return { ...base, reason: "El beneficio es un regalo: no se calcula en pesos." };
  }
  if (input.minPurchase && amount < input.minPurchase) {
    return { ...base, eligible: false, reason: `La compra mínima es de ${formatARS(input.minPurchase)}.` };
  }
  if (amount === 0) return base;

  let raw = input.discountKind === "porcentaje" ? (amount * value) / 100 : Math.min(value, amount);
  if (capRemaining != null) raw = Math.min(raw, capRemaining);
  const saving = round2(Math.max(0, raw));
  return {
    ...base,
    saving,
    finalCost: round2(amount - saving),
    capReached: capRemaining != null && saving >= capRemaining,
    capProgress: cap ? Math.min(1, (used + saving) / cap) : null,
  };
}

export function calcForPromo(p: Promotion, amount: number, capUsed = 0): CalcResult {
  return calcSaving({
    amount,
    discountKind: p.discountKind,
    discountValue: p.discountValue,
    capAmount: p.capAmount,
    minPurchase: p.minPurchase,
    capUsed,
  });
}

export type Availability =
  | { state: "activa"; label: string }
  | { state: "hoy_no"; label: string }
  | { state: "proxima"; label: string }
  | { state: "vencida"; label: string };

export function availability(p: Pick<Promotion, "validFrom" | "validUntil" | "daysOfWeek" | "status">, today: string): Availability {
  if (p.status === "vencida" || (p.validUntil && p.validUntil < today)) return { state: "vencida", label: "Vencida" };
  if (p.validFrom && p.validFrom > today) {
    const d = daysBetween(today, p.validFrom);
    return { state: "proxima", label: d === 1 ? "Empieza mañana" : `Empieza en ${d} días` };
  }
  if (p.daysOfWeek && p.daysOfWeek.length > 0 && p.daysOfWeek.length < 7 && !p.daysOfWeek.includes(dayOfWeek(today))) {
    return { state: "hoy_no", label: `Hoy no aplica · ${formatDays(p.daysOfWeek)}` };
  }
  return { state: "activa", label: "Aplica hoy" };
}

export interface CompareRow {
  paymentMethod: PaymentMethod;
  promotion: Promotion | null;
  result: CalcResult | null;
  appliesToday: boolean;
  userHasIt: boolean;
}

/**
 * Compara, para un comercio y un monto, qué medio de pago conviene.
 * Por cada medio se queda con la promo que más ahorra hoy. Los medios sin promo
 * aparecen al final para que la persona sepa que los consideramos.
 */
export function compareForMerchant(
  promos: Promotion[],
  amount: number,
  today: string,
  paymentMethods: PaymentMethod[],
  userPaymentMethodIds: string[] = [],
): CompareRow[] {
  const best = new Map<string, CompareRow>();
  for (const p of promos) {
    if (p.kind !== "reintegro" && p.kind !== "descuento") continue;
    const av = availability(p, today);
    if (av.state === "vencida" || av.state === "proxima") continue;
    const appliesToday = av.state === "activa";
    const result = calcForPromo(p, amount);
    for (const pm of p.paymentMethods) {
      const prev = best.get(pm.id);
      const better =
        !prev ||
        (appliesToday && !prev.appliesToday) ||
        (appliesToday === prev.appliesToday && (result.saving > (prev.result?.saving ?? 0)));
      if (better) best.set(pm.id, { paymentMethod: pm, promotion: p, result, appliesToday, userHasIt: userPaymentMethodIds.includes(pm.id) });
    }
  }
  const rows = [...best.values()].sort((a, b) => {
    if (a.appliesToday !== b.appliesToday) return a.appliesToday ? -1 : 1;
    const s = (b.result?.saving ?? 0) - (a.result?.saving ?? 0);
    if (s !== 0) return s;
    if (a.userHasIt !== b.userHasIt) return a.userHasIt ? -1 : 1;
    return a.paymentMethod.name.localeCompare(b.paymentMethod.name, "es");
  });
  return rows;
}
