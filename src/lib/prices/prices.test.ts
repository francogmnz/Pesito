import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo, resetDemoStore } from "@/lib/data/memory";
import { compareListings, isValidGtin, normalizeGtin, priceAge, priceTrend, type Listing } from "@/lib/domain/products";
import type { Source } from "@/lib/domain/types";
import { crawlPrices } from "./crawl";
import { parseVtexProduct, parseVtexProductSitemap, parseVtexSitemapIndex } from "./vtex";

const fixture = (n: string) => readFileSync(path.resolve(import.meta.dirname, "../../../tests/fixtures", `${n}.html`), "utf8");

describe("códigos de barras", () => {
  it("valida el dígito verificador y descarta códigos internos", () => {
    expect(isValidGtin("7790375267285")).toBe(true);
    expect(isValidGtin("77972279")).toBe(true); // EAN-8
    expect(isValidGtin("7790375267286")).toBe(false);
    expect(isValidGtin("08009533")).toBe(false); // el "gtin" que publica la tienda es su código interno
    expect(isValidGtin("0000000000000")).toBe(false);
    expect(normalizeGtin(" 7790375-267285 ")).toBe("7790375267285");
    expect(normalizeGtin("12345")).toBeNull();
  });
});

describe("página de producto VTEX", () => {
  it("lee código de barras, precio, precio de lista, stock, rubro y foto", () => {
    const p = parseVtexProduct(fixture("vtex-farmaonline-producto"))!;
    expect(p).toMatchObject({ slug: "bagovit-emulsin-nutritiva-humectante-350-gr-8009533", name: "Emulsión nutritiva humectante 350 gr", brand: "bagovit", category: "Cuidado Personal / Cuidado de la Piel / Corporales" });
    expect(p.items).toEqual([{ ean: "7790375267285", name: "Emulsión nutritiva humectante 350 gr", price: 13609.58, listPrice: 27219.16, inStock: true }]);
    expect(p.imageUrl).toMatch(/^https:\/\/farmaonline\.vtexassets\.com\/.+\.jpg$/);
  });

  it("una página que no es de producto no rompe", () => {
    expect(parseVtexProduct("<html><body>Promociones</body></html>")).toBeNull();
  });

  it("saca las páginas de producto del sitemap", () => {
    expect(parseVtexSitemapIndex("<sitemapindex><sitemap><loc>https://t.example/sitemap/brand-0.xml</loc></sitemap><sitemap><loc>https://t.example/sitemap/product-0.xml</loc></sitemap></sitemapindex>")).toEqual(["https://t.example/sitemap/product-0.xml"]);
    expect(parseVtexProductSitemap("<urlset><url><loc>https://t.example/crema-x-200-ml-123/p</loc></url><url><loc>https://t.example/marca/algo</loc></url></urlset>")).toEqual(["crema-x-200-ml-123"]);
  });
});

describe("comparación entre comercios", () => {
  const l = (merchantName: string, price: number, inStock = true): Listing => ({ merchantSlug: merchantName.toLowerCase(), merchantName, url: "https://x.example/p", title: "Crema", price, listPrice: null, inStock, lastOkAt: "2026-10-11T12:00:00Z", priceChangedAt: "2026-10-11T12:00:00Z" });

  it("ordena por precio, deja afuera lo sin stock y calcula la diferencia", () => {
    const c = compareListings([l("A", 50000), l("B", 30000), l("C", 20000, false)]);
    expect(c.best?.merchantName).toBe("B");
    expect(c.available.map((x) => x.merchantName)).toEqual(["B", "A"]);
    expect(c.unavailable.map((x) => x.merchantName)).toEqual(["C"]);
    expect(c.spread).toEqual({ amount: 20000, percent: 40 });
  });

  it("dice si la oferta es de verdad mirando el historial", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    const at = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
    const withHistory = (price: number, history: [number, number][], listPrice: number | null = null): Listing => ({ ...l("A", price), listPrice, history: history.map(([p, d]) => ({ price: p, at: at(d) })) });
    expect(priceTrend(withHistory(8000, [[10000, 20], [8000, 1]]), now)).toEqual({ tone: "bueno", text: "Es el precio más bajo desde que lo seguimos (20 días). Antes estaba 20% más caro." });
    expect(priceTrend(withHistory(9000, [[8000, 20], [10000, 10], [9000, 1]]), now)).toMatchObject({ tone: "bueno", text: "Bajó 10% respecto del precio anterior, pero ya estuvo más barato." });
    expect(priceTrend(withHistory(12000, [[10000, 20], [12000, 1]]), now)).toMatchObject({ tone: "malo", text: "Subió 20% respecto del precio anterior." });
    // Precio tachado que nunca vimos cobrar: la «oferta» lleva semanas.
    expect(priceTrend(withHistory(8000, [[8000, 20]], 16000), now)).toMatchObject({ tone: "neutro" });
    // Recién cargado o sin precio tachado: no se afirma nada.
    expect(priceTrend(withHistory(8000, [[8000, 2]], 16000), now)).toBeNull();
    expect(priceTrend(withHistory(8000, [[8000, 20]]), now)).toBeNull();
    expect(priceTrend(l("A", 8000), now)).toBeNull();
  });

  it("nunca presenta un precio viejo como recién verificado", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    expect(priceAge("2026-10-11T11:40:00Z", now)).toMatchObject({ stale: false, label: "verificado hace menos de una hora" });
    expect(priceAge("2026-10-10T12:00:00Z", now)).toMatchObject({ stale: false, label: "verificado hace 1 día" });
    expect(priceAge("2026-10-04T12:00:00Z", now)).toMatchObject({ stale: true, label: "verificado hace 7 días: puede estar desactualizado" });
  });
});

describe("lectura de precios por tandas", () => {
  beforeEach(() => resetDemoStore());
  const store = (name: string, config: Record<string, unknown> = {}): Source => ({
    id: `src-${name}`, name: `${name} · Precios`, url: `https://www.${name}.example/`, kind: "oficial", active: true, adapter: "vtex-precios",
    config: { merchantSlug: name, merchantName: name === "tienda-a" ? "Tienda A" : "Tienda B", delayMs: 0, ...config }, autoPublish: false, lastRunAt: null,
  });
  /** Tienda de mentira: un producto en alcance (misma crema), una golosina fuera de alcance y una página que ya no existe. */
  const site = (name: string, price: number, robots = "User-agent: *\nDisallow: /checkout\n") => {
    const calls: string[] = [];
    const page = fixture("vtex-farmaonline-producto").replace('"Price":13609.58', `"Price":${price}`);
    const fetcher = (async (u: string) => {
      const p = String(u).replace(`https://www.${name}.example`, "");
      calls.push(p);
      if (p === "/robots.txt") return new Response(robots);
      if (p === "/sitemap.xml") return new Response("<sitemapindex><sitemap><loc>https://www." + name + ".example/sitemap/product-0.xml</loc></sitemap></sitemapindex>");
      if (p === "/sitemap/product-0.xml") return new Response(["crema", "golosina", "ya-no-esta"].map((s) => `<url><loc>https://www.${name}.example/${s}/p</loc></url>`).join(""));
      if (p === "/crema/p") return new Response(page);
      if (p === "/golosina/p") return new Response(fixture("vtex-farmacity-golosina"));
      return new Response("no", { status: 404 });
    }) as unknown as typeof fetch;
    return { calls, fetcher };
  };
  const now = new Date("2026-10-11T13:00:00Z");

  it("guarda solo lo que está en alcance y une el mismo producto de dos comercios por código de barras", async () => {
    const repo = createMemoryRepo();
    const a = site("tienda-a", 13609.58);
    expect(await crawlPrices({ repo, source: store("tienda-a"), fetcher: a.fetcher, now })).toMatchObject({ checked: 3, created: 1, skipped: 2, errors: 0 });
    expect(a.calls.filter((c) => c === "/robots.txt")).toHaveLength(1);
    expect(await repo.sourceRecordStats("src-tienda-a")).toEqual({ vigente: 1, omitida: 1, sin_datos: 1 });
    await crawlPrices({ repo, source: store("tienda-b"), fetcher: site("tienda-b", 11990).fetcher, now });

    expect(await repo.priceStats()).toEqual({ products: 1, listings: 2, comparable: 1 });
    const [found] = await repo.searchProducts("bagovit emulsion");
    expect(found).toMatchObject({ ean: "7790375267285", stores: 2, minPrice: 11990, maxPrice: 13609.58 });
    const { listings } = (await repo.getProduct(found.id))!;
    expect(compareListings(listings).best).toMatchObject({ merchantName: "Tienda B", price: 11990 });
  });

  it("no relee lo que no corresponde; a los tres días revisa el precio y registra el cambio", async () => {
    const repo = createMemoryRepo();
    await crawlPrices({ repo, source: store("tienda-a"), fetcher: site("tienda-a", 13609.58).fetcher, now });
    const synced = store("tienda-a", { sitemapSyncedAt: now.toISOString() });

    const sameDay = site("tienda-a", 13609.58);
    expect((await crawlPrices({ repo, source: synced, fetcher: sameDay.fetcher, now })).checked).toBe(0);
    expect(sameDay.calls).toEqual([]);

    const later = site("tienda-a", 14990);
    const r = await crawlPrices({ repo, source: synced, fetcher: later.fetcher, now: new Date(now.getTime() + 73 * 3_600_000) });
    expect(r).toMatchObject({ checked: 1, changed: 1, created: 0 });
    expect(later.calls).toEqual(["/robots.txt", "/crema/p"]);
    expect((await repo.searchProducts("bagovit"))[0].minPrice).toBe(14990);
  });

  it("el buscador ordena por precio, filtra por rango y por comparables, y pagina", async () => {
    const repo = createMemoryRepo();
    const add = (merchantSlug: string, ean: string, title: string, price: number) => repo.upsertListing({ merchantSlug, merchantName: merchantSlug, sourceId: "s", externalKey: `${ean}-${merchantSlug}`, url: "https://x.example/p", ean, title, brand: "Marca", category: null, imageUrl: null, price, listPrice: null, inStock: true });
    await add("a", "7790375267285", "Serum uno", 30000);
    await add("b", "7790375267285", "Serum uno", 25000);
    await add("a", "77972279", "Serum dos", 9000);
    await add("a", "7797811099516", "Crema tres", 15000);
    const names = async (o: Parameters<typeof repo.searchProducts>[1], q = "") => (await repo.searchProducts(q, o)).map((p) => p.name);
    expect(await names({ sort: "menor" })).toEqual(["Serum dos", "Crema tres", "Serum uno"]);
    expect(await names({ sort: "mayor" })).toEqual(["Serum uno", "Crema tres", "Serum dos"]);
    expect(await names({ sort: "menor" }, "serum")).toEqual(["Serum dos", "Serum uno"]);
    expect(await names({ comparable: true })).toEqual(["Serum uno"]);
    expect(await names({ minPrice: 10000, maxPrice: 20000 })).toEqual(["Crema tres"]);
    expect(await names({ sort: "menor", limit: 2, offset: 2 })).toEqual(["Serum uno"]);
    expect(await names({ merchantSlug: "b" })).toEqual(["Serum uno"]);
    expect(await repo.priceMerchants()).toEqual([{ slug: "a", name: "a", products: 3 }, { slug: "b", name: "b", products: 1 }]);
  });

  it("una página con varias presentaciones carga cada una por su código de barras", async () => {
    const repo = createMemoryRepo();
    const key = "Product:labial-mate";
    const state = {
      [key]: { productName: "Labial Mate", linkText: "labial-mate", brand: "Marca", categories: { type: "json", json: ["/Maquillaje/Labios/"] } },
      [`${key}.items.0`]: { name: "Rojo 05", nameComplete: "Rojo 05", ean: "7790375267285" },
      [`$${key}.items.0.sellers.0.commertialOffer`]: { Price: 9000, ListPrice: 9000, AvailableQuantity: 5 },
      [`${key}.items.1`]: { name: "Labial Mate Nude 02", nameComplete: "Labial Mate Nude 02", ean: "7797811099516" },
      [`$${key}.items.1.sellers.0.commertialOffer`]: { Price: 9500, ListPrice: 12000, AvailableQuantity: 0 },
      [`${key}.items.2`]: { name: "Sin código", nameComplete: "Sin código", ean: "" },
      [`$${key}.items.2.sellers.0.commertialOffer`]: { Price: 9000, ListPrice: 9000, AvailableQuantity: 5 },
    };
    const page = `<template data-type="json" data-varname="__STATE__"><script>${JSON.stringify(state)}</script></template>`;
    const fetcher = (async (u: string) => {
      const p = String(u).replace("https://www.tienda-a.example", "");
      if (p === "/robots.txt") return new Response("User-agent: *\nDisallow:\n");
      if (p === "/sitemap.xml") return new Response("<sitemapindex><sitemap><loc>https://www.tienda-a.example/sitemap/product-0.xml</loc></sitemap></sitemapindex>");
      if (p === "/sitemap/product-0.xml") return new Response("<url><loc>https://www.tienda-a.example/labial-mate/p</loc></url>");
      return new Response(page);
    }) as unknown as typeof fetch;
    expect(await crawlPrices({ repo, source: store("tienda-a", { scope: "." }), fetcher, now })).toMatchObject({ checked: 1, created: 2, skipped: 0 });
    const all = await repo.searchProducts("labial", { sort: "menor" });
    expect(all.map((p) => p.name)).toEqual(["Labial Mate - Rojo 05"]); // la otra presentación está sin stock
    expect(await repo.priceStats()).toMatchObject({ products: 2, listings: 2 });
  });

  it("no lee lo que robots.txt prohíbe", async () => {
    const repo = createMemoryRepo();
    const blocked = site("tienda-a", 1, "User-agent: *\nDisallow: /\n");
    await expect(crawlPrices({ repo, source: store("tienda-a"), fetcher: blocked.fetcher, now })).rejects.toThrow(/robots/);
    expect(blocked.calls.filter((c) => c.endsWith("/p"))).toEqual([]);
  });
});
