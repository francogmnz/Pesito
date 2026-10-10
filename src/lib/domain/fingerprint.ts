import type { PromoPayload } from "./types";

/** Minúsculas, sin tildes, sin signos ni palabras de relleno. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(s ?a|srl|sa|la|el|los|las|de|del|y)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Hash no criptográfico, estable y con 53 bits (cyrb53). Corre igual en servidor y navegador. */
export function hash53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Huella de una promo: identifica "la misma promo" aunque cambie la redacción.
 * Usa comercio, tipo, beneficio, tope, medios de pago, días, vencimiento y código.
 */
export function fingerprint(
  p: Pick<PromoPayload, "kind" | "merchantName" | "discountKind" | "discountValue" | "capAmount" | "paymentMethodSlugs" | "daysOfWeek" | "validUntil" | "coupon" | "bank" | "wallet">,
): string {
  const pms = [...(p.paymentMethodSlugs ?? [])];
  if (pms.length === 0) {
    if (p.bank) pms.push(slugify(p.bank));
    if (p.wallet) pms.push(slugify(p.wallet));
  }
  const parts = [
    p.kind,
    slugify(normalizeText(p.merchantName)),
    p.discountKind,
    p.discountValue ?? "",
    p.capAmount ?? "",
    pms.sort().join(","),
    (p.daysOfWeek ?? []).slice().sort().join(","),
    p.validUntil ?? "",
    (p.coupon?.code ?? "").toUpperCase(),
  ];
  return `fp_${hash53(parts.join("|"))}`;
}

/** Búsqueda por palabras: cada palabra buscada tiene que ser el comienzo de alguna palabra del texto. */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = normalizeText(haystack).split(" ");
  const terms = normalizeText(query).split(" ").filter(Boolean);
  return terms.every((t) => words.some((w) => w.startsWith(t)));
}
