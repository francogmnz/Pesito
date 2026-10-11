import { isValidGtin, normalizeGtin } from "@/lib/domain/products";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

export interface VtexItem {
  ean: string | null;
  name: string;
  price: number | null;
  listPrice: number | null;
  inStock: boolean;
}

export interface VtexProduct {
  slug: string;
  name: string;
  brand: string | null;
  /** Rama más específica del rubro, sin barras: "Cuidado Personal / Cuidado de la Piel / Corporales". */
  category: string | null;
  imageUrl: string | null;
  items: VtexItem[];
}

/** Páginas de producto listadas en el sitemap de una tienda VTEX (`…/slug/p`). Devuelve los slugs. */
export function parseVtexProductSitemap(xml: string): string[] {
  const out = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*https?:\/\/[^/<\s]+\/([^<\s/?#]+)\/p\s*<\/loc>/g)) {
    if (/^[A-Za-z0-9._~%-]{1,200}$/.test(m[1])) out.add(m[1]);
  }
  return [...out];
}

/** Sitemaps de productos que lista el índice (`/sitemap/product-0.xml`, …). */
export function parseVtexSitemapIndex(xml: string): string[] {
  return [...new Set([...xml.matchAll(/<loc>\s*(https:\/\/[^<\s]+\/sitemap\/product-\d+\.xml)\s*<\/loc>/g)].map((m) => m[1]))];
}

const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);

/**
 * Página de producto de una tienda VTEX (Farmaonline, Farmacity): los datos vienen en
 * `<template data-varname="__STATE__">`, con una entrada por producto, por presentación (item) y por oferta.
 * Devuelve null si la página no es de producto.
 */
export function parseVtexProduct(html: string): VtexProduct | null {
  const m = html.match(/<template data-type="json" data-varname="__STATE__">\s*<script>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let state: Any;
  try {
    state = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const key = Object.keys(state).find((k) => /^Product:[^.]+$/.test(k));
  if (!key) return null;
  const p = state[key] as Any;
  const items: VtexItem[] = [];
  for (let i = 0; state[`${key}.items.${i}`]; i++) {
    const it = state[`${key}.items.${i}`] as Any;
    const offer = (state[`$${key}.items.${i}.sellers.0.commertialOffer`] ?? {}) as Any;
    const price = money(offer.Price);
    const list = money(offer.ListPrice);
    const ean = normalizeGtin(it.ean);
    items.push({
      ean: ean && isValidGtin(ean) ? ean : null,
      name: String(it.nameComplete ?? it.name ?? "").trim(),
      price,
      listPrice: list && price && list > price ? list : null,
      inStock: Number(offer.AvailableQuantity ?? 0) > 0 && price != null,
    });
  }
  const paths: string[] = Array.isArray(p.categories?.json) ? p.categories.json : [];
  const deepest = paths.slice().sort((a, b) => b.length - a.length)[0];
  const firstImage = state[Object.keys(state).find((k) => /^Image:/.test(k)) ?? ""] as Any | undefined;
  const image = typeof firstImage?.imageUrl === "string" && /^https:\/\//.test(firstImage.imageUrl) ? firstImage.imageUrl.split("?")[0] : null;
  return {
    slug: String(p.linkText ?? key.slice("Product:".length)),
    name: String(p.productName ?? "").trim(),
    brand: String(p.brand ?? "").trim() || null,
    category: deepest ? deepest.split("/").filter(Boolean).join(" / ") : null,
    imageUrl: image,
    items,
  };
}
