import { daysBetween } from "./dates";
import type { Promotion } from "./types";

export const EXPIRING_SOON_DAYS = 7;

export function daysLeft(p: Pick<Promotion, "validUntil">, today: string): number | null {
  return p.validUntil ? daysBetween(today, p.validUntil) : null;
}

export function isExpired(p: Pick<Promotion, "validUntil" | "status">, today: string): boolean {
  return p.status === "vencida" || (p.validUntil != null && p.validUntil < today);
}

export function isExpiringSoon(p: Pick<Promotion, "validUntil" | "status">, today: string, within = EXPIRING_SOON_DAYS): boolean {
  if (isExpired(p, today) || !p.validUntil) return false;
  return daysBetween(today, p.validUntil) <= within;
}

export function expiryLabel(p: Pick<Promotion, "validUntil" | "status">, today: string): string {
  if (isExpired(p, today)) return "Vencido";
  const d = daysLeft(p, today);
  if (d == null) return "Sin vencimiento informado";
  if (d === 0) return "Vence hoy";
  if (d === 1) return "Vence mañana";
  return `Vence en ${d} días`;
}

/** Orden del catálogo: primero los que vencen antes; los sin fecha al final. */
export function byExpiry(a: Pick<Promotion, "validUntil">, b: Pick<Promotion, "validUntil">): number {
  if (a.validUntil === b.validUntil) return 0;
  if (!a.validUntil) return 1;
  if (!b.validUntil) return -1;
  return a.validUntil < b.validUntil ? -1 : 1;
}
