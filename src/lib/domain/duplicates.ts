import { normalizeText } from "./fingerprint";
import type { PromoPayload, Promotion } from "./types";

/** Similitud 0..1 entre dos nombres (Dice sobre bigramas). */
export function similarity(a: string, b: string): number {
  const x = normalizeText(a).replace(/ /g, "");
  const y = normalizeText(b).replace(/ /g, "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let inter = 0;
  for (const [g, n] of gx) inter += Math.min(n, gy.get(g) ?? 0);
  return (2 * inter) / (x.length - 1 + (y.length - 1));
}

function rangesOverlap(aFrom: string | null, aTo: string | null, bFrom: string | null, bTo: string | null): boolean {
  const s1 = aFrom ?? "0000-01-01";
  const e1 = aTo ?? "9999-12-31";
  const s2 = bFrom ?? "0000-01-01";
  const e2 = bTo ?? "9999-12-31";
  return s1 <= e2 && s2 <= e1;
}

export interface DuplicateCandidate {
  promotion: Promotion;
  score: number;
  reasons: string[];
}

/**
 * Busca promos existentes que podrían ser la misma que el candidato.
 * Huella exacta = duplicado seguro. Si no, suma señales: comercio parecido,
 * mismo tipo, vigencias que se superponen, mismo beneficio y medios de pago en común.
 */
export function findDuplicates(candidate: PromoPayload & { fingerprint?: string | null }, existing: Promotion[], threshold = 0.6): DuplicateCandidate[] {
  const out: DuplicateCandidate[] = [];
  const candPms = new Set(candidate.paymentMethodSlugs);
  const candBank = normalizeText(candidate.bank);
  const candWallet = normalizeText(candidate.wallet);
  for (const p of existing) {
    if (p.status === "archivada") continue;
    if (candidate.fingerprint && p.fingerprint === candidate.fingerprint) {
      out.push({ promotion: p, score: 1, reasons: ["Misma huella: es la misma promo"] });
      continue;
    }
    const nameSim = similarity(candidate.merchantName, p.merchant.name);
    if (nameSim < 0.7) continue;
    let score = 0.35 * nameSim;
    const reasons = [`Comercio parecido (${Math.round(nameSim * 100)}%)`];
    if (candidate.kind === p.kind) {
      score += 0.15;
      reasons.push("Mismo tipo");
    }
    if (rangesOverlap(candidate.validFrom, candidate.validUntil, p.validFrom, p.validUntil)) {
      score += 0.15;
      reasons.push("Vigencias superpuestas");
    }
    if (candidate.discountKind === p.discountKind && candidate.discountValue != null && p.discountValue != null && Math.abs(candidate.discountValue - p.discountValue) <= 1) {
      score += 0.2;
      reasons.push("Mismo beneficio");
    }
    const pmMatch = p.paymentMethods.some(
      (pm) => candPms.has(pm.slug) || (candBank && normalizeText(pm.name) === candBank) || (candWallet && normalizeText(pm.name) === candWallet),
    );
    if (pmMatch) {
      score += 0.15;
      reasons.push("Medio de pago en común");
    }
    if (candidate.coupon?.code && p.coupon?.code && candidate.coupon.code.toUpperCase() === p.coupon.code.toUpperCase()) {
      score = Math.max(score, 0.95);
      reasons.push("Mismo código");
    }
    if (score >= threshold) out.push({ promotion: p, score: Math.min(0.99, Math.round(score * 100) / 100), reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}
