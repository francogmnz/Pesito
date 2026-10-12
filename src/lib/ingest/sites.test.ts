import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo, resetDemoStore } from "@/lib/data/memory";
import type { Source } from "@/lib/domain/types";
import { ADAPTERS, CRAWLERS } from "./adapters";
import { robotsDisallows } from "./fetch-page";
import { findCouponCode, parseDateRange, parseDays, parseSpanishDate } from "./html";
import { processCandidates } from "./process";
import { beloCandidate, fetchBelo, parseBeloList, parseShortDate } from "./sites/belo";
import { brubankArticleText, brubankCandidate, parseBrubankList } from "./sites/brubank";
import { parseFarmaonline } from "./sites/farmaonline";
import { parseDayText, parseGetTheLook } from "./sites/getthelook";
import { parseMercadoPago } from "./sites/mercadopago";
import { modoBanks, modoPriority, parseModoPromo, parseModoSitemap } from "./sites/modo";
import { parsePedidosYa } from "./sites/pedidosya";
import { parsePrexList, parsePrexPromo } from "./sites/prex";
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

describe("MODO", () => {
  const page = (n: string, today = TODAY) => parseModoPromo(fixture(`modo-${n}`), today);

  it("lee una promo bancaria con tope, días, tarjetas y vigencia real", () => {
    const r = page("banco");
    expect(r.state).toBe("vigente");
    expect(r.candidate).toMatchObject({
      externalId: "modo:23df25eb-0985-4238-a99a-45a4979d7f1b",
      kind: "reintegro",
      merchantName: "La Coope en Casa",
      title: "30% de reintegro en La Coope en Casa con Credicoop",
      discountValue: 30,
      capAmount: 15000,
      capPeriod: "dia",
      minPurchase: null,
      validFrom: "2025-10-01",
      validUntil: "2026-12-31",
      daysOfWeek: [5],
      channel: "online",
      bank: "Credicoop",
      paymentMethodSlugs: ["credicoop"],
      sourceUrl: "https://www.modo.com.ar/promos/30-lacoopeencasa-credicoop-oct25",
    });
    expect(r.candidate!.conditions).toContain("Tarjetas: crédito Cabal; débito Cabal.");
    expect(r.candidate!.conditions).toContain("Promoción válida únicamente para consumos con QR de MODO");
    // Los legales y el dato estructurado no coinciden: lo tiene que mirar una persona.
    expect(r.candidate!.flags).toContain("Los legales dicen hasta el 30/09/26 y el dato de vigencia, 2026-12-31");
  });

  it("una promo del comercio se carga con MODO y avisa que no hay banco puntual", () => {
    const c = page("comercio").candidate!;
    expect(c).toMatchObject({ merchantName: "FarmaPlus", discountValue: 15, capAmount: 9000, capPeriod: "semana", minPurchase: 60000, daysOfWeek: [1], channel: "online", categorySlug: "farmacias", paymentMethodSlugs: ["modo"], wallet: "MODO", bank: null });
    expect(c.conditions).toContain("El tope es por persona en cada banco.");
  });

  it("sin tope y con cuotas: queda sin tope y las cuotas van a las condiciones", () => {
    const c = page("cuotas-sin-tope").candidate!;
    expect(c).toMatchObject({ merchantName: "Frávega", discountValue: 10, capAmount: null, capPeriod: "sin_tope", paymentMethodSlugs: ["banco-corrientes"], daysOfWeek: [5] });
    expect(c.conditions).toContain("Hasta 6 cuotas sin interés.");
    expect(c.conditions).toContain("Tarjetas: crédito Visa.");
  });

  it("avisa cuando parece ser para un segmento de clientes", () => {
    const c = page("segmento").candidate!;
    expect(c).toMatchObject({ paymentMethodSlugs: ["macro"], daysOfWeek: null, channel: "local", capAmount: 20000, capPeriod: "mes" });
    // El segmento queda escrito en la promo: es una nota, no frena la publicación.
    expect(c.title).toContain("· Preferencial");
    expect(c.conditions).toContain("Solo para clientes Preferencial.");
    expect(c.notes!.some((f) => f.includes("segmento"))).toBe(true);
    expect(c.flags).toEqual([]);
  });

  it("que MODO diga “active” no alcanza: manda la vigencia", () => {
    expect(page("vencida")).toMatchObject({ state: "vencida", validUntil: "2023-07-14", candidate: null });
    expect(page("banco", "2027-01-15")).toMatchObject({ state: "vencida", candidate: null });
  });

  it("saltea las promos de solo cuotas y las páginas sin datos", () => {
    expect(page("solo-cuotas")).toMatchObject({ state: "omitida", reason: "Solo cuotas", candidate: null });
    expect(parseModoPromo("<html><title>Promociones</title></html>", TODAY).state).toBe("sin_datos");
  });

  it("reconoce el banco donde MODO lo pone, sin confundirlo con un comercio", () => {
    const slugs = (p: Parameters<typeof modoBanks>[0]) => modoBanks(p).map((b) => b.slug);
    expect(slugs({ short_description: "2505-BNA-voucher-7304530-carrefour" })).toEqual(["banco-nacion"]);
    expect(slugs({ slug: "30off-cerveceria-patagonia-macro-jun26" })).toEqual(["macro"]);
    expect(slugs({ slug: "15-farmaonline-icbc-jul24", short_description: "Promo ICBC" })).toEqual(["icbc"]);
    expect(slugs({ slug: "autoshop-agos26", short_description: "2608-AutoShop-Presencial-15off" })).toEqual([]);
  });

  it("ordena la lectura: primero lo reciente, al final lo viejo", () => {
    expect(parseModoSitemap("<urlset><url><loc>https://www.modo.com.ar/promos</loc></url><url><loc>https://www.modo.com.ar/promos/farmaplus-oct26</loc></url><url><loc>https://www.modo.com.ar/ayuda/x</loc></url></urlset>")).toEqual(["farmaplus-oct26"]);
    const order = ["20-bsf-semana-jul23", "25off-santander-dining", "2609-galicia-recital-6csi", "farmaplus-oct26"].sort((a, b) => modoPriority(b, TODAY) - modoPriority(a, TODAY));
    expect(order).toEqual(["farmaplus-oct26", "2609-galicia-recital-6csi", "25off-santander-dining", "20-bsf-semana-jul23"]);
  });
});

describe("MODO por tandas", () => {
  beforeEach(() => resetDemoStore());
  const PAGES: Record<string, string> = { "farmaplus-oct26": "comercio", "30-lacoopeencasa-credicoop-oct25": "banco", "20-bsf-semana-jul23": "vencida" };
  const sitemap = `<urlset>${[...Object.keys(PAGES), "ya-no-existe-oct26"].map((s) => `<url><loc>https://www.modo.com.ar/promos/${s}</loc></url>`).join("")}</urlset>`;
  const source = (config: Record<string, unknown> = {}): Source => ({ id: "src-modo", name: "MODO", url: "https://www.modo.com.ar/promos", kind: "oficial", active: true, adapter: "modo", config: { delayMs: 0, ...config }, autoPublish: false, lastRunAt: null });
  const site = (robots = "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /data/\n") => {
    const calls: string[] = [];
    const fetcher = (async (u: string) => {
      const url = String(u);
      calls.push(url.replace("https://www.modo.com.ar", ""));
      if (url.endsWith("/robots.txt")) return new Response(robots);
      if (url.endsWith("/sitemap.xml")) return new Response(sitemap);
      const name = PAGES[url.split("/promos/")[1]];
      return name ? new Response(fixture(`modo-${name}`)) : new Response("no", { status: 404 });
    }) as unknown as typeof fetch;
    return { calls, fetcher };
  };
  const now = new Date("2026-10-11T13:00:00Z");

  it("lee el sitemap, abre cada página una vez y manda lo vigente a revisión", async () => {
    const repo = createMemoryRepo();
    const { calls, fetcher } = site();
    const r = await CRAWLERS.modo.crawl({ repo, source: source(), fetcher, today: TODAY, now });
    expect(r).toMatchObject({ checked: 4, skipped: 2, errors: 0, removedExternalIds: [] });
    expect(r.candidates.map((c) => c.merchantName).sort()).toEqual(["FarmaPlus", "La Coope en Casa"]);
    expect(calls.filter((c) => c === "/robots.txt")).toHaveLength(1);
    expect(calls.some((c) => c.startsWith("/api/"))).toBe(false);
    expect(await repo.sourceRecordStats("src-modo")).toEqual({ vigente: 2, vencida: 1, sin_datos: 1 });

    const p = await processCandidates(repo, source(), r.candidates, { today: TODAY, partial: true });
    expect(p).toMatchObject({ created: 0, flagged: 2 });
  });

  it("no relee lo vencido ni baja el sitemap de nuevo; lo vigente se revisa a la semana sin duplicar la cola", async () => {
    const repo = createMemoryRepo();
    const first = site();
    const r1 = await CRAWLERS.modo.crawl({ repo, source: source(), fetcher: first.fetcher, today: TODAY, now });
    await processCandidates(repo, source(), r1.candidates, { today: TODAY, partial: true });

    const synced = source({ sitemapSyncedAt: now.toISOString() });
    const sameDay = site();
    expect((await CRAWLERS.modo.crawl({ repo, source: synced, fetcher: sameDay.fetcher, today: TODAY, now })).checked).toBe(0);
    expect(sameDay.calls).toEqual([]);

    const later = site();
    const r2 = await CRAWLERS.modo.crawl({ repo, source: synced, fetcher: later.fetcher, today: "2026-10-19", now: new Date("2026-10-19T13:00:00Z") });
    expect(later.calls.filter((c) => c.startsWith("/promos/")).sort()).toEqual(["/promos/30-lacoopeencasa-credicoop-oct25", "/promos/farmaplus-oct26"]);
    const p = await processCandidates(repo, synced, r2.candidates, { today: "2026-10-19", partial: true });
    expect(p.flagged).toBe(0);
  });

  it("respeta el tamaño de la tanda y empieza por lo más reciente", async () => {
    const repo = createMemoryRepo();
    const { calls, fetcher } = site();
    const r = await CRAWLERS.modo.crawl({ repo, source: source({ batchSize: 2 }), fetcher, today: TODAY, now });
    expect(r.checked).toBe(2);
    expect(calls.filter((c) => c.startsWith("/promos/")).sort()).toEqual(["/promos/farmaplus-oct26", "/promos/ya-no-existe-oct26"]);
    expect((await repo.sourceRecordStats("src-modo")).nueva).toBe(2);
  });

  it("si robots.txt lo prohíbe, no lee nada", async () => {
    const { calls, fetcher } = site("User-agent: *\nDisallow: /\n");
    await expect(CRAWLERS.modo.crawl({ repo: createMemoryRepo(), source: source(), fetcher, today: TODAY, now })).rejects.toThrow("robots.txt");
    expect(calls).toEqual(["/robots.txt"]);
  });
});

describe("Prex", () => {
  const items = parsePrexList(fixture("prex"));
  const promo = (slug: string) => parsePrexPromo(items.find((i) => i.slug === slug)!, fixture(`prex-${slug}`), TODAY);

  it("del listado toma solo lo que tiene porcentaje", () => {
    expect(items.map((i) => i.slug)).toEqual(["ypf", "changomas-qr", "temu"]);
  });

  it("saca tope, mínimo, día y vigencia de la página de la promo", () => {
    expect(promo("ypf")).toMatchObject({
      externalId: "prex:198", kind: "reintegro", merchantName: "YPF", discountValue: 10, capAmount: 6000, capPeriod: "semana", minPurchase: 35000,
      validFrom: "2026-09-28", validUntil: "2026-10-31", daysOfWeek: [1], paymentMethodSlugs: ["prex"], sourceUrl: "https://www.prexcard.com.ar/promociones/ypf",
    });
    expect(promo("ypf").flags).toBeUndefined();
  });

  it("entiende «sin tope» y una vigencia de mes entero", () => {
    expect(promo("changomas-qr")).toMatchObject({ merchantName: "ChangoMás", kind: "descuento", capAmount: null, capPeriod: "sin_tope", validFrom: "2026-10-01", validUntil: "2026-10-31", daysOfWeek: [0, 5, 6], channel: "local" });
  });

  it("detecta el código y avisa cuando el tope no aclara el período", () => {
    const c = promo("temu");
    expect(c).toMatchObject({ kind: "cupon", audience: "nuevos_clientes", capAmount: 15000, capPeriod: "vigencia", minPurchase: 15000, validUntil: "2026-10-31", channel: "online" });
    expect(c.coupon).toMatchObject({ code: "PREX26", newCustomersOnly: true });
    expect(c.notes?.some((f) => f.startsWith("El tope no aclara"))).toBe(true);
    expect(c.flags).toBeUndefined();
  });

  const src: Source = { id: "src-prex", name: "Prex", url: "https://www.prexcard.com.ar/promociones", kind: "oficial", active: true, adapter: "prex", config: { delayMs: 0 }, autoPublish: false, lastRunAt: null };
  const site = (missing?: string) => {
    const calls: string[] = [];
    const fetcher = (async (u: string) => {
      const p = String(u).replace("https://www.prexcard.com.ar", "");
      calls.push(p);
      if (p === "/robots.txt") return new Response("User-agent: *\nDisallow:\n");
      if (p === "/promociones") return new Response(fixture("prex"));
      const slug = p.split("/promociones/")[1];
      return slug === missing ? new Response("no", { status: 500 }) : new Response(fixture(`prex-${slug}`));
    }) as unknown as typeof fetch;
    return { calls, fetcher };
  };

  it("abre el listado y la página de cada promo, y todo va a revisión", async () => {
    resetDemoStore();
    const repo = createMemoryRepo();
    const { calls, fetcher } = site();
    const cands = await ADAPTERS.prex.fetchCandidates(src, fetcher);
    expect(calls).toEqual(["/robots.txt", "/promociones", "/promociones/ypf", "/promociones/changomas-qr", "/promociones/temu"]);
    expect(await processCandidates(repo, src, cands, { today: TODAY })).toMatchObject({ created: 0, flagged: 3 });
  });

  it("si falla una página no devuelve una lista incompleta", async () => {
    await expect(ADAPTERS.prex.fetchCandidates(src, site("temu").fetcher)).rejects.toThrow(/500/);
  });
});

describe("Farmaonline", () => {
  const list = parseFarmaonline(fixture("farmaonline"), TODAY);
  const by = (id: string) => list.find((c) => c.externalId === id)!;

  it("saltea las tarjetas de solo cuotas y lee el resto", () => {
    expect(list.map((c) => c.externalId)).toEqual(["farmaonline:modo:20:2", "farmaonline:mercado-pago:20:24", "farmaonline:amex:10:5", "farmaonline:credicoop:30:2", "farmaonline:x:20:todos:onsale"]);
    expect(list.every((c) => c.merchantName === "Farmaonline" && c.categorySlug === "farmacias" && c.channel === "online")).toBe(true);
  });

  it("promo de MODO con muchos bancos: tope semanal, mínimo, día y vigencia", () => {
    expect(by("farmaonline:modo:20:2")).toMatchObject({ kind: "reintegro", title: "20% de reintegro en Farmaonline con MODO", paymentMethodSlugs: ["modo"], discountValue: 20, capAmount: 16000, capPeriod: "semana", minPurchase: 70000, validFrom: "2026-10-06", validUntil: "2026-10-27", daysOfWeek: [2] });
    expect(by("farmaonline:modo:20:2").flags).toBeUndefined();
  });

  it("Amex emitida por varios bancos es una promo de Amex", () => {
    expect(by("farmaonline:amex:10:5")).toMatchObject({ kind: "descuento", paymentMethodSlugs: ["amex"], capAmount: 10000, capPeriod: "compra", daysOfWeek: [5], validUntil: "2026-10-31" });
  });

  it("avisa lo dudoso: grupo de clientes, tope sin período, varios medios, sin fecha de fin", () => {
    const mp = by("farmaonline:mercado-pago:20:24");
    expect(mp).toMatchObject({ paymentMethodSlugs: ["mercado-pago"], capAmount: 16000, capPeriod: "vigencia", minPurchase: 80000, daysOfWeek: [2, 4] });
    expect(mp.audience).toBe("nuevos_clientes");
    expect(mp.flags).toBeUndefined();
    expect(mp.notes).toHaveLength(2);
    const cabal = by("farmaonline:credicoop:30:2");
    expect(cabal).toMatchObject({ validFrom: "2025-11-01", validUntil: null, capPeriod: "semana" });
    expect(cabal.paymentMethodSlugs).toEqual(["credicoop"]);
    expect(cabal.flags).toEqual(["No se encontró hasta cuándo vale en el texto legal."]);
  });

  it("el titular no arrastra restos de HTML", () => {
    expect(list.some((c) => /[<>]|farmaonline-store/.test(`${c.title} ${c.summary}`))).toBe(false);
    expect(by("farmaonline:mercado-pago:20:24").summary).toBe("20% de descuento en compras mayores a $80.000 los martes y jueves");
  });

  it("un cupón de la tienda no necesita medio de pago", () => {
    const c = by("farmaonline:x:20:todos:onsale");
    expect(c).toMatchObject({ kind: "cupon", paymentMethodSlugs: [], validUntil: "2026-10-12" });
    expect(c.coupon).toMatchObject({ code: "ONSALE" });
    expect(c.flags!.some((f) => f.startsWith("No se reconoció"))).toBe(false);
  });
});

describe("Belo", () => {
  const cards = parseBeloList(fixture("belo"));

  it("lee una tarjeta por beneficio con porcentaje, aunque venga repetida para cada tamaño de pantalla", () => {
    expect(cards.map((c) => c.slug)).toEqual(["ypf-10", "airalo", "slack"]);
    expect(cards[0]).toMatchObject({ merchant: "YPF", benefit: "10% de reintegro pagando con tu Mastercard", until: "31 oct 2026" });
    expect(parseShortDate("Válido hasta el 30 sept 2026")).toBe("2026-09-30");
  });

  it("saca tope, mínimo y día de la mecánica de cada beneficio", () => {
    const c = beloCandidate(cards[0], fixture("belo-ypf"));
    expect(c).toMatchObject({
      externalId: "belo:ypf-10", kind: "reintegro", merchantName: "YPF", title: "10% de reintegro en YPF con Belo", paymentMethodSlugs: ["belo"],
      discountValue: 10, capAmount: 6000, capPeriod: "semana", minPurchase: 35000, validUntil: "2026-10-31", daysOfWeek: [1], sourceUrl: "https://www.belo.app/ar/beneficios/ypf-10",
    });
    expect(c.flags).toBeUndefined();
    expect(c.conditions).toContain("Tope de reintegro: $6.000 por semana");
  });

  it("no carga los convenios sin fecha ni mecánica, y una página que falla manda la promo a revisión", async () => {
    const src: Source = { id: "src-belo", name: "Belo", url: "https://www.belo.app/ar/beneficios", kind: "oficial", active: true, adapter: "belo", config: { delayMs: 0 }, autoPublish: true, lastRunAt: null };
    const fetcher = (async (u: string) => {
      const p = String(u).replace("https://www.belo.app", "");
      if (p === "/robots.txt") return new Response("User-agent: *\nAllow: /\n");
      if (p === "/ar/beneficios") return new Response(fixture("belo"));
      if (p === "/ar/beneficios/ypf-10") return new Response(fixture("belo-ypf"));
      if (p === "/ar/beneficios/slack") return new Response("<html><body><h1>Slack</h1><p>25% OFF en Slack Pro</p><p>Volver a Beneficios</p></body></html>");
      return new Response("no", { status: 500 });
    }) as unknown as typeof fetch;
    const out = await fetchBelo(src, fetcher);
    expect(out.map((c) => c.externalId)).toEqual(["belo:ypf-10", "belo:airalo"]);
    expect(out[1].flags).toEqual(["No se pudo leer la página del beneficio: faltan tope y condiciones."]);
  });
});

describe("Get The Look (medios de pago)", () => {
  const list = parseGetTheLook(fixture("getthelook-medios"), TODAY);
  const by = (id: string) => list.find((c) => c.externalId === id)!;

  it("entiende los días abreviados y los rangos", () => {
    expect(parseDayText("Jueves")).toEqual([4]);
    expect(parseDayText("DDM- Sab y Dom")).toEqual([0, 6]);
    expect(parseDayText("DDM - Jue a Dom")).toEqual([0, 4, 5, 6]);
    expect(parseDayText("Todos los días")).toBeNull();
  });

  it("deja una promo por banco y texto, sin las filas de solo cuotas", () => {
    expect(list.map((c) => c.externalId)).toEqual(["getthelook:icbc:20:5", "getthelook:banco-nacion:35:todos", "getthelook:galicia:25:06", "getthelook:x:20:4", "getthelook:banco-del-sol:20:3", "getthelook:naranja-x:30:3"]);
    expect(list.every((c) => c.merchantName === "Get The Look" && c.categorySlug === "belleza")).toBe(true);
  });

  it("saca día, tope con su período, canal y vigencia de los legales", () => {
    expect(by("getthelook:icbc:20:5")).toMatchObject({ title: "20% de reintegro en Get The Look con ICBC", paymentMethodSlugs: ["icbc"], discountValue: 20, capAmount: 6000, capPeriod: "semana", daysOfWeek: [5], channel: "ambos", validFrom: "2025-10-01", validUntil: "2027-03-31" });
    expect(by("getthelook:icbc:20:5").flags).toBeUndefined();
    // Fechas con puntos ("12.10.2026 al 18.10.2026") y tope por transacción.
    expect(by("getthelook:banco-nacion:35:todos")).toMatchObject({ capAmount: 35000, capPeriod: "compra", validFrom: "2026-10-12", validUntil: "2026-10-18" });
    // Miles con coma ("$15,000 por día").
    expect(by("getthelook:naranja-x:30:3")).toMatchObject({ capAmount: 15000, capPeriod: "dia", channel: "online" });
  });

  it("avisa segmentos y bancos que no están en el catálogo", () => {
    expect(by("getthelook:galicia:25:06").flags).toEqual(["Puede ser solo para un segmento de clientes (“EMINET”)."]);
    expect(by("getthelook:x:20:4").flags).toEqual(["No se reconoció el medio de pago (“COINAG”)."]);
    expect(by("getthelook:banco-del-sol:20:3").paymentMethodSlugs).toEqual(["banco-del-sol"]);
  });
});

describe("Brubank", () => {
  const cards = parseBrubankList(fixture("brubank"));
  const article = brubankArticleText(fixture("brubank-articulo"));
  const card = (merchant: string) => cards.find((c) => c.merchant === merchant)!;

  it("lee las tarjetas con porcentaje de cada plan, sin repetir ni contar las de solo cuotas", () => {
    expect(cards.map((c) => `${c.plan}: ${c.merchant}`)).toEqual(["Plan Ultra: App YPF", "Plan Ultra: Cerini", "Plan Plus: Farmacity", "Plan Ultra: Cabify"]);
    expect(card("App YPF")).toMatchObject({ benefit: "10% de reintegro", cap: "Tope de reintegro: $6.000", days: "Todos los lunes" });
    // El enlace a las condiciones se toma sin los parámetros de seguimiento.
    expect(card("App YPF").articleUrl).toBe("https://help.brubank.com/es/articles/13003457-todos-los-lunes-10-off-a-traves-de-la-app-ypf-compra-con-tu-tarjeta-de-debito-y-credito-visa-brubank");
  });

  it("completa vigencia y tope por compra con el artículo de ayuda, y deja el plan a la vista", () => {
    const c = brubankCandidate(card("App YPF"), article, TODAY);
    expect(c).toMatchObject({
      externalId: "brubank:plan-ultra:app-ypf:10", kind: "reintegro", merchantName: "App YPF", title: "10% de reintegro en App YPF con Brubank · Plan Ultra",
      paymentMethodSlugs: ["brubank"], discountValue: 10, capAmount: 6000, capPeriod: "compra", minPurchase: null, validFrom: "2026-10-01", validUntil: "2026-10-31", daysOfWeek: [1],
    });
    expect(c.conditions).toContain("Solo para clientes con Plan Ultra.");
    expect(c.flags).toBeUndefined();
  });

  it("sin condiciones enlazadas, o con las de otro comercio, va a revisión", () => {
    expect(brubankCandidate(card("Cerini"), null, TODAY).flags).toEqual(["La tarjeta no enlaza las condiciones: falta la vigencia."]);
    expect(brubankCandidate(card("Cerini"), article, TODAY).flags).toEqual(["Las condiciones enlazadas no nombran a este comercio: verificar."]);
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
