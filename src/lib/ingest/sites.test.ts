import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo, resetDemoStore } from "@/lib/data/memory";
import type { Source } from "@/lib/domain/types";
import { ADAPTERS } from "./adapters";
import { robotsDisallows } from "./fetch-page";
import { findCouponCode, parseDateRange, parseDays, parseSpanishDate } from "./html";
import { processCandidates } from "./process";
import { parseMercadoPago } from "./sites/mercadopago";
import { parsePedidosYa } from "./sites/pedidosya";
import { parseUala } from "./sites/uala";

const fixture = (n: string) => readFileSync(path.resolve(import.meta.dirname, "../../../tests/fixtures", `${n}.html`), "utf8");
const TODAY = "2026-10-11";

describe("lectura de textos", () => {
  it("entiende fechas en castellano", () => {
    expect(parseSpanishDate("31 de octubre de 2026", TODAY)).toBe("2026-10-31");
    expect(parseSpanishDate("Hasta el 31 de julio 2027", TODAY)).toBe("2027-07-31");
    expect(parseSpanishDate("30 de julio del 2027", TODAY)).toBe("2027-07-30");
    // Sin año: el más cercano a hoy (en octubre, "15 de enero" es el que viene).
    expect(parseSpanishDate("15 de enero", TODAY)).toBe("2027-01-15");
    expect(parseDateRange("Válido del 11 al 17 de mayo", TODAY)).toEqual({ from: "2026-05-11", until: "2026-05-17" });
    expect(parseDateRange("del 28 de septiembre al 5 de octubre", TODAY)).toEqual({ from: "2026-09-28", until: "2026-10-05" });
  });
  it("entiende días y códigos", () => {
    expect(parseDays(["Lunes", "Miércoles"])).toEqual([1, 3]);
    expect(parseDays(["Todos los días"])).toBeNull();
    expect(findCouponCode("ingresando el cupón “RappiProUala”")).toBe("RappiProUala");
    expect(findCouponCode("recibí un cupón del 100% de descuento")).toBeNull();
  });
  it("respeta robots.txt", () => {
    const robots = "User-agent: *\nDisallow: /api/\nDisallow: /*?\nAllow: /blog?category=\n";
    expect(robotsDisallows(robots, "/promos")).toBe(false);
    expect(robotsDisallows(robots, "/api/promos")).toBe(true);
    expect(robotsDisallows(robots, "/promociones?page=2")).toBe(true);
    expect(robotsDisallows(robots, "/blog?category=x")).toBe(false);
  });
});

describe("Ualá", () => {
  const list = parseUala(fixture("uala"), TODAY);
  it("lee todas las promos con sus datos", () => {
    expect(list).toHaveLength(12);
    const ypf = list.find((c) => c.merchantName === "YPF")!;
    expect(ypf).toMatchObject({
      kind: "reintegro",
      discountValue: 10,
      capAmount: 6000,
      capPeriod: "semana",
      minPurchase: 35000,
      validUntil: "2026-10-31",
      daysOfWeek: [1],
      channel: "local",
      categorySlug: "combustible",
      paymentMethodSlugs: ["uala"],
      sourceUrl: "https://www.uala.com.ar/promociones/ypf",
    });
  });
  it("detecta cupones con código", () => {
    const cabify = list.find((c) => c.coupon?.code === "5MASTER")!;
    expect(cabify.kind).toBe("cupon");
    expect(cabify.title).toBe("50% de descuento en Cabify");
    expect(list.filter((c) => c.kind === "cupon").map((c) => c.coupon!.code)).toContain("GRACIASUALA");
  });
});

describe("PedidosYa", () => {
  const list = parsePedidosYa(fixture("pedidosya"));
  it("lee las promos bancarias sin repetir", () => {
    expect(list).toHaveLength(13);
    expect(new Set(list.map((c) => c.externalId)).size).toBe(13);
    const prov = list.find((c) => c.externalId === "pedidosya:4174")!;
    expect(prov).toMatchObject({ bank: "Banco Provincia", discountValue: 20, kind: "reintegro", daysOfWeek: [0], categorySlug: "delivery" });
    expect(list.find((c) => c.externalId === "pedidosya:4161")!.kind).toBe("descuento");
  });
});

describe("Mercado Pago", () => {
  const list = parseMercadoPago(fixture("mercadopago"), TODAY);
  it("lee solo las promos con porcentaje y sus fechas", () => {
    expect(list.length).toBe(7);
    const aero = list.find((c) => c.merchantName === "Aerolíneas Argentinas")!;
    expect(aero).toMatchObject({ discountValue: 20, capAmount: 30000, validUntil: "2026-05-17", kind: "reintegro" });
    expect(list.every((c) => /^mp:[a-z0-9-]+:/.test(c.externalId))).toBe(true);
  });
});

describe("de la página a la cola de revisión", () => {
  beforeEach(() => resetDemoStore());
  const source = (adapter: string, url: string): Source => ({ id: `src-${adapter}`, name: adapter, url, kind: "oficial", active: true, adapter, config: {}, autoPublish: false, lastRunAt: null });
  const fakeFetch = (html: string) =>
    (async (u: string) => (String(u).endsWith("/robots.txt") ? new Response("User-agent: *\nDisallow: /api/\n") : new Response(html))) as unknown as typeof fetch;

  it("todo lo que se lee va a revisión; nada se publica solo", async () => {
    const repo = createMemoryRepo();
    const src = source("uala", "https://www.uala.com.ar/promociones");
    const cands = await ADAPTERS.uala.fetchCandidates(src, fakeFetch(fixture("uala")));
    const r = await processCandidates(repo, src, cands, { today: TODAY });
    expect(r.created).toBe(0);
    expect(r.flagged).toBe(12);
    // Al día siguiente no se vuelven a encolar.
    const again = await processCandidates(repo, src, cands, { today: TODAY });
    expect(again.flagged).toBe(0);
  });

  it("las promos vencidas se descartan", async () => {
    const repo = createMemoryRepo();
    const src = source("mercadopago", "https://promociones.mercadopago.com.ar/");
    const cands = await ADAPTERS.mercadopago.fetchCandidates(src, fakeFetch(fixture("mercadopago")));
    const r = await processCandidates(repo, src, cands, { today: TODAY });
    expect(r.skippedExpired).toBe(7);
    expect(r.flagged).toBe(0);
  });

  it("no lee lo que robots.txt prohíbe", async () => {
    const blocked = (async (u: string) => (String(u).endsWith("/robots.txt") ? new Response("User-agent: *\nDisallow: /\n") : new Response("x"))) as unknown as typeof fetch;
    await expect(ADAPTERS.uala.fetchCandidates(source("uala", "https://www.uala.com.ar/promociones"), blocked)).rejects.toThrow("robots.txt");
  });
});
