import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo, resetDemoStore } from "@/lib/data/memory";
import { compareListings, isValidGtin, normalizeGtin, priceAge, type Listing } from "@/lib/domain/products";
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

  it("no lee lo que robots.txt prohíbe", async () => {
    const repo = createMemoryRepo();
    const blocked = site("tienda-a", 1, "User-agent: *\nDisallow: /\n");
    await expect(crawlPrices({ repo, source: store("tienda-a"), fetcher: blocked.fetcher, now })).rejects.toThrow(/robots/);
    expect(blocked.calls.filter((c) => c.endsWith("/p"))).toEqual([]);
  });
});
