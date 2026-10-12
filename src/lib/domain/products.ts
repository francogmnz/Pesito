/**
 * Productos y precios de «Comparar precios».
 * Un producto es el mismo en dos comercios solo si comparten código de barras (EAN/GTIN) válido.
 */

/** Publicación de un producto en un comercio, con su precio vigente. */
export interface Listing {
  merchantSlug: string;
  merchantName: string;
  url: string;
  title: string;
  price: number;
  /** Precio de lista (sin la oferta), si el comercio lo informa y es mayor al precio. */
  listPrice: number | null;
  inStock: boolean;
  /** Última vez que se leyó bien la página del comercio. */
  lastOkAt: string;
  priceChangedAt: string;
}

export interface Product {
  id: string;
  ean: string;
  brand: string | null;
  name: string;
  /** Rubro tal como lo nombra el comercio donde se vio primero ("Cuidado Personal / Cuidado de la Piel"). */
  category: string | null;
  /** Enlace a la foto en el sitio del comercio: nunca se guarda el archivo. */
  imageUrl: string | null;
}

export interface ProductSummary extends Product {
  /** En cuántos comercios está. */
  stores: number;
  minPrice: number;
  maxPrice: number;
}

/** Lo que se lee de la página de un comercio. */
export interface ListingInput {
  merchantSlug: string;
  merchantName: string;
  sourceId: string;
  /** Identificador de la página dentro del comercio (el slug del producto). */
  externalKey: string;
  url: string;
  ean: string;
  title: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  price: number;
  listPrice: number | null;
  inStock: boolean;
}

export type ListingChange = "nuevo" | "cambio" | "igual";

/** Deja solo los dígitos y saca los ceros de relleno ("08009533" es un código interno, no un EAN). */
export function normalizeGtin(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  return [8, 12, 13, 14].includes(d.length) ? d : null;
}

/** Código de barras con dígito verificador correcto (EAN-8, UPC-12, EAN-13, GTIN-14). */
export function isValidGtin(raw: string | null | undefined): boolean {
  const d = normalizeGtin(raw);
  if (!d || /^0+$/.test(d)) return false;
  const digits = d.split("").map(Number);
  const check = digits.pop()!;
  // Desde la derecha, los pesos alternan 3, 1, 3…
  const sum = digits.reverse().reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Hace cuánto se verificó un precio y si ya conviene desconfiar. */
export function priceAge(lastOkAt: string, now: Date = new Date()): { hours: number; stale: boolean; label: string } {
  const hours = Math.max(0, (now.getTime() - new Date(lastOkAt).getTime()) / 3_600_000);
  const stale = hours > 120;
  const label = hours < 1 ? "verificado hace menos de una hora" : hours < 24 ? `verificado hace ${Math.round(hours)} h` : `verificado hace ${Math.round(hours / 24)} ${Math.round(hours / 24) === 1 ? "día" : "días"}`;
  return { hours, stale, label: stale ? `${label}: puede estar desactualizado` : label };
}

export interface Comparison {
  /** Con stock, de menor a mayor precio. */
  available: Listing[];
  unavailable: Listing[];
  best: Listing | null;
  /** Diferencia entre el más barato y el más caro con stock. */
  spread: { amount: number; percent: number } | null;
}

/** Ordena las publicaciones de un producto y calcula cuánto se ahorra eligiendo la más barata. */
export function compareListings(listings: Listing[]): Comparison {
  const available = listings.filter((l) => l.inStock && l.price > 0).sort((a, b) => a.price - b.price);
  const unavailable = listings.filter((l) => !l.inStock || l.price <= 0);
  const best = available[0] ?? null;
  const worst = available[available.length - 1];
  const spread = best && worst && worst.price > best.price ? { amount: Math.round((worst.price - best.price) * 100) / 100, percent: Math.round(((worst.price - best.price) / worst.price) * 100) } : null;
  return { available, unavailable, best, spread };
}
