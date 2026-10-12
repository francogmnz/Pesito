import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryRepo, resetDemoStore } from "@/lib/data/memory";
import { parseExtraction } from "@/lib/ai/extract";
import { todayAR, addDaysISO } from "@/lib/domain/dates";
import type { Source } from "@/lib/domain/types";
import { jsonFeedAdapter } from "./adapters";
import { processCandidates } from "./process";

const today = todayAR();
const oficial: Source = { id: "src-demo", name: "Fuente de ejemplo", url: "https://feed.example.com/promos.json", kind: "oficial", active: true, adapter: "json-feed", config: {}, autoPublish: true, lastRunAt: null };
const autorizada: Source = { ...oficial, kind: "autorizada", autoPublish: false };

const feedItem = (over: Record<string, unknown> = {}) => ({
  id: "A1",
  comercio: "Heladería Glaciar",
  title: "20% en Heladería Glaciar",
  kind: "descuento",
  discountKind: "porcentaje",
  discountValue: 20,
  capAmount: 3000,
  validUntil: addDaysISO(today, 20),
  paymentMethodSlugs: ["modo"],
  ...over,
});
const fakeFetch = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
const config = { fieldMap: { externalId: "id", merchantName: "comercio" } };

describe("automatización", () => {
  beforeEach(() => resetDemoStore());

  it("lee un feed autorizado con mapeo de campos y descarta basura", async () => {
    const list = await jsonFeedAdapter.fetchCandidates({ ...oficial, config }, fakeFetch({ promos: [feedItem(), null, 42, { comercio: "sin id ni título" }] }));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ externalId: "A1", merchantName: "Heladería Glaciar", discountValue: 20 });
  });

  it("no lee URLs inseguras", async () => {
    await expect(jsonFeedAdapter.fetchCandidates({ ...oficial, url: "http://10.0.0.1/feed" }, fakeFetch([]))).rejects.toThrow();
  });

  it("fuente oficial con publicación automática: publica lo completo", async () => {
    const repo = createMemoryRepo();
    const cands = await jsonFeedAdapter.fetchCandidates({ ...oficial, config }, fakeFetch([feedItem()]));
    const r = await processCandidates(repo, oficial, cands, { today });
    expect(r).toMatchObject({ created: 1, flagged: 0 });
    expect((await repo.listPromotions({ q: "glaciar" }))[0].sourceUrl).toBe(oficial.url);
  });

  it("fuente autorizada: todo va a revisión, nada se publica solo", async () => {
    const repo = createMemoryRepo();
    const cands = await jsonFeedAdapter.fetchCandidates({ ...autorizada, config }, fakeFetch([feedItem()]));
    const r = await processCandidates(repo, autorizada, cands, { today });
    expect(r).toMatchObject({ created: 0, flagged: 1 });
    expect(await repo.listPromotions({ q: "glaciar" })).toHaveLength(0);
    const sub = (await repo.listSubmissions({ origin: "automatizacion", status: "pendiente" })).find((s) => s.payload.merchantName === "Heladería Glaciar")!;
    expect(sub.flagReasons).toContain("La fuente no es oficial: verificar");
  });

  it("datos dudosos van a revisión aunque la fuente sea oficial", async () => {
    const repo = createMemoryRepo();
    const cands = await jsonFeedAdapter.fetchCandidates({ ...oficial, config }, fakeFetch([feedItem({ paymentMethodSlugs: [], discountValue: 150 })]));
    const r = await processCandidates(repo, oficial, cands, { today });
    expect(r.flagged).toBe(1);
    expect(r.created).toBe(0);
  });

  it("detecta duplicados, verifica sin cambios, aplica extensiones y manda cambios a revisión", async () => {
    const repo = createMemoryRepo();
    const src = { ...oficial, config };
    await processCandidates(repo, src, await jsonFeedAdapter.fetchCandidates(src, fakeFetch([feedItem()])), { today });

    // Misma promo otra vez: se verifica, no se duplica.
    let r = await processCandidates(repo, src, await jsonFeedAdapter.fetchCandidates(src, fakeFetch([feedItem()])), { today });
    expect(r).toMatchObject({ verified: 1, created: 0, flagged: 0 });

    // Extienden la vigencia: cambio menor, se aplica solo.
    r = await processCandidates(repo, src, await jsonFeedAdapter.fetchCandidates(src, fakeFetch([feedItem({ validUntil: addDaysISO(today, 50) })])), { today });
    expect(r.updated).toBe(1);
    expect((await repo.listPromotions({ q: "glaciar" }))[0].validUntil).toBe(addDaysISO(today, 50));

    // Bajan el porcentaje: va a revisión con el detalle.
    r = await processCandidates(repo, src, await jsonFeedAdapter.fetchCandidates(src, fakeFetch([feedItem({ validUntil: addDaysISO(today, 50), discountValue: 10 })])), { today });
    expect(r.flagged).toBe(1);
    const cambio = (await repo.listSubmissions({ status: "pendiente" })).find((s) => s.changeType === "cambio")!;
    expect(cambio.diff?.discountValue).toEqual({ antes: 20, despues: 10 });
  });

  it("fuente oficial con publicación automática: publica sola lo claro y deja en revisión solo lo dudoso", async () => {
    const repo = createMemoryRepo();
    const src = { ...oficial, config };
    const run = async (items: Record<string, unknown>[]) => processCandidates(repo, src, (await jsonFeedAdapter.fetchCandidates(src, fakeFetch(items))).map((c, i) => ({ ...c, ...(items[i].flags ? { flags: items[i].flags as string[] } : {}), ...(items[i].notes ? { notes: items[i].notes as string[] } : {}) })), { today });
    const r = await run([
      feedItem({ id: "N1", comercio: "Farmacia Sol", notes: ["La página no menciona tope."] }),
      feedItem({ id: "F1", comercio: "Bar Luna", flags: ["Aparecen varios bancos: verificar"] }),
      feedItem({ id: "S1", comercio: "Kiosco Río", discountValue: 100 }),
      feedItem({ id: "S2", comercio: "Comercios adheridos" }),
      feedItem({ id: "S3", comercio: "Tienda Mar", title: '20% en Tienda Mar <span class="x-' }),
    ]);
    // Una nota no frena; una duda del lector, un porcentaje altísimo o un comercio genérico, sí. El HTML suelto se limpia.
    expect(r).toMatchObject({ created: 2, flagged: 3 });
    const pending = (await repo.listSubmissions({ status: "pendiente", origin: "automatizacion" })).filter((s) => ["Bar Luna", "Comercios adheridos", "Kiosco Río", "Farmacia Sol", "Tienda Mar"].includes(s.payload.merchantName));
    expect(pending.map((s) => s.payload.merchantName).sort()).toEqual(["Bar Luna", "Comercios adheridos", "Kiosco Río"]);
    const published = await repo.listPromotions({ statuses: ["publicada"], limit: 1000 });
    expect(published.find((p) => p.merchant.name === "Tienda Mar")!.title).toBe("20% en Tienda Mar");
  });

  it("lo que esperaba revisión se publica solo cuando la fuente pasa a ser de confianza, sin quedar repetido en la cola", async () => {
    const repo = createMemoryRepo();
    const manual = { ...oficial, autoPublish: false, config };
    const item = feedItem({ id: "Q1", comercio: "Vivero Loma" });
    const run = async (src: Source) => processCandidates(repo, src, await jsonFeedAdapter.fetchCandidates(src, fakeFetch([item])), { today });
    expect(await run(manual)).toMatchObject({ created: 0, flagged: 1 });
    expect(await run({ ...manual, autoPublish: true })).toMatchObject({ created: 1, flagged: 0 });
    const subs = (await repo.listSubmissions({ origin: "automatizacion", status: "pendiente" })).filter((s) => s.payload.merchantName === "Vivero Loma");
    expect(subs).toHaveLength(0);
    const done = (await repo.listSubmissions({ origin: "automatizacion", status: "aprobada" })).filter((s) => s.payload.merchantName === "Vivero Loma");
    expect(done).toHaveLength(1);
    expect(done[0].publishedPromotionId).toBeTruthy();
  });

  it("fuente oficial: los cambios claros se aplican solos, salvo el beneficio o lo corregido a mano", async () => {
    const repo = createMemoryRepo();
    const src = { ...oficial, config };
    const run = async (item: Record<string, unknown>) => processCandidates(repo, src, await jsonFeedAdapter.fetchCandidates(src, fakeFetch([item])), { today });
    await run(feedItem());
    const find = async () => (await repo.listPromotions({ statuses: ["publicada", "vencida", "archivada"], limit: 1000 })).find((p) => p.externalId === "A1")!;

    // Cambia el tope y el título: se aplica solo.
    expect(await run(feedItem({ capAmount: 5000, title: "20% de descuento en Heladería Glaciar" }))).toMatchObject({ updated: 1, flagged: 0 });
    expect(await find()).toMatchObject({ capAmount: 5000, title: "20% de descuento en Heladería Glaciar" });

    // Vencida y renovada en la fuente: vuelve a publicarse sola.
    await repo.setPromotionStatus((await find()).id, "vencida", null);
    expect(await run(feedItem({ capAmount: 5000, title: "20% de descuento en Heladería Glaciar", validUntil: addDaysISO(today, 45) }))).toMatchObject({ updated: 1 });
    expect((await find()).status).toBe("publicada");

    // Corregida a mano: la fuente ya no la pisa, el cambio va a revisión.
    await repo.markManualEdit((await find()).id);
    expect(await run(feedItem({ capAmount: 7000, title: "20% de descuento en Heladería Glaciar", validUntil: addDaysISO(today, 45) }))).toMatchObject({ updated: 0, flagged: 1 });
    expect((await find()).capAmount).toBe(5000);

    // Archivada por una persona: la fuente no la revive ni la encola.
    await repo.setPromotionStatus((await find()).id, "archivada", null);
    expect(await run(feedItem({ capAmount: 9000, validUntil: addDaysISO(today, 45) }))).toMatchObject({ created: 0, updated: 0, flagged: 0 });
    expect((await find()).status).toBe("archivada");
  });

  it("fuentes oficiales: lo repetido no vuelve a revisión; se suma el medio de pago o se descarta solo", async () => {
    const repo = createMemoryRepo();
    const a = { ...oficial, config };
    const b: Source = { ...oficial, id: "src-b", name: "Otra fuente oficial", config };
    const feed = async (src: Source, item: Record<string, unknown>) => processCandidates(repo, src, await jsonFeedAdapter.fetchCandidates(src, fakeFetch([item])), { today });
    const glaciar = async () => (await repo.listPromotions({ statuses: ["publicada"], limit: 1000 })).filter((p) => p.merchant.name === "Heladería Glaciar");
    await feed(a, feedItem());

    // Misma promo, otra billetera: se suma el medio de pago sin pasar por revisión.
    expect(await feed(b, feedItem({ id: "B1", paymentMethodSlugs: ["uala"] }))).toMatchObject({ created: 0, updated: 1, flagged: 0 });
    expect((await glaciar()).map((p) => p.paymentMethods.map((m) => m.slug).sort())).toEqual([["modo", "uala"]]);

    // La misma oferta con el mismo medio de pago y otra fecha de fin: ya está, no se carga de nuevo ni se encola.
    expect(await feed(b, feedItem({ id: "B2", validUntil: addDaysISO(today, 12) }))).toMatchObject({ created: 0, updated: 0, verified: 1, flagged: 0 });
    expect(await glaciar()).toHaveLength(1);

    // Otro tope en el mismo comercio y con el mismo medio de pago: es otra promo y se publica.
    expect(await feed(b, feedItem({ id: "B3", capAmount: 9000 }))).toMatchObject({ created: 1, flagged: 0 });
    expect(await glaciar()).toHaveLength(2);
    expect((await repo.listSubmissions({ status: "pendiente", origin: "automatizacion" })).filter((x) => x.payload.merchantName === "Heladería Glaciar")).toHaveLength(0);
  });

  it("la misma promo en otra billetera no se duplica: se propone sumar el medio de pago", async () => {
    const repo = createMemoryRepo();
    const a = { ...oficial, config };
    const b: Source = { ...autorizada, id: "src-otra", name: "Otra billetera", kind: "oficial", config };
    const feed = async (src: Source, item: Record<string, unknown>) => processCandidates(repo, src, await jsonFeedAdapter.fetchCandidates(src, fakeFetch([item])), { today });
    await feed(a, feedItem());
    const otra = feedItem({ id: "B9", title: "20% OFF en Glaciar pagando con Ualá", paymentMethodSlugs: ["uala"] });

    expect(await feed(b, otra)).toMatchObject({ created: 0, flagged: 1 });
    const [sub] = await repo.listSubmissions({ origin: "automatizacion", status: "pendiente" });
    expect(sub).toMatchObject({ changeType: "cambio", diff: { paymentMethodSlugs: { antes: ["modo"], despues: ["modo", "uala"] } } });
    expect(sub.payload).toMatchObject({ title: "20% en Heladería Glaciar", paymentMethodSlugs: ["modo", "uala"], externalId: "A1" });
    // Mientras espera revisión no se vuelve a encolar.
    expect((await feed(b, otra)).flagged).toBe(0);

    // Aprobada: queda una sola promo con los dos medios de pago y las dos fuentes la dan por verificada.
    await repo.updatePromotionFromPayload(sub.matchedPromotionId!, sub.payload, sub.fingerprint!);
    expect(await feed(b, otra)).toMatchObject({ verified: 1, flagged: 0 });
    expect(await feed(a, feedItem())).toMatchObject({ verified: 1, flagged: 0 });
    const promos = await repo.listPromotions({ statuses: ["publicada"], limit: 1000 });
    expect(promos.filter((p) => p.merchant.name === "Heladería Glaciar").map((p) => p.paymentMethods.map((m) => m.slug).sort())).toEqual([["modo", "uala"]]);
    // Otro beneficio en el mismo comercio sí es otra promo.
    expect(await feed(b, { ...otra, id: "B10", discountValue: 30 })).toMatchObject({ verified: 0, flagged: 1 });
  });

  it("ignora promos vencidas y avisa si una promo desaparece del feed", async () => {
    const repo = createMemoryRepo();
    const src = { ...oficial, config };
    await processCandidates(repo, src, await jsonFeedAdapter.fetchCandidates(src, fakeFetch([feedItem()])), { today });
    const r = await processCandidates(repo, src, await jsonFeedAdapter.fetchCandidates(src, fakeFetch([feedItem({ id: "B2", comercio: "Otra", title: "Vieja", validUntil: addDaysISO(today, -1) })])), { today });
    expect(r.skippedExpired).toBe(1);
    expect((await repo.listSubmissions({ status: "pendiente" })).some((s) => s.changeType === "baja" && s.payload.merchantName === "Heladería Glaciar")).toBe(true);
  });

  it("vence promos terminadas", async () => {
    const repo = createMemoryRepo();
    expect(await repo.expirePromotions(addDaysISO(today, 100))).toBeGreaterThan(5);
  });
});

describe("lectura con IA", () => {
  it("valida campo por campo y descarta lo inventado o inseguro", () => {
    const x = parseExtraction(
      'Acá va: {"merchantName":"Farmacia Sol","discountValue":15,"couponCode":"BIEN VENIDA","validUntil":"2026-13-01","sourceUrl":"http://farmacia.com","days":[1,9],"confidence":0.8}',
    );
    expect(x.merchantName).toBe("Farmacia Sol");
    expect(x.discountValue).toBe(15);
    expect(x.couponCode).toBeNull();
    expect(x.validUntil).toBeNull();
    expect(x.sourceUrl).toBeNull();
    expect(x.days).toBeNull();
    expect(x.confidence).toBe(0.8);
  });
  it("tolera respuestas que no son JSON", () => {
    expect(parseExtraction("no pude leer nada").merchantName).toBeNull();
  });
});

describe("límites y reglas en modo demo (iguales a la base)", () => {
  beforeEach(() => resetDemoStore());
  it("máximo 5 sugerencias por día por persona y sin repetir", async () => {
    const repo = createMemoryRepo();
    const payload = (await repo.listSubmissions())[0].payload;
    for (let i = 0; i < 4; i++) await repo.createSubmission({ origin: "usuario", payload, fingerprint: `fp-${i}`, submittedBy: "demo-usuario" });
    // ya tenía 1 de hoy en los datos de ejemplo → 5
    await expect(repo.createSubmission({ origin: "usuario", payload, fingerprint: "fp-x", submittedBy: "demo-usuario" })).rejects.toThrow("límite");
    await expect(repo.createSubmission({ origin: "usuario", payload, fingerprint: "fp-0", submittedBy: "demo-admin" })).resolves.toBeTruthy();
    await expect(repo.createSubmission({ origin: "usuario", payload, fingerprint: "fp-0", submittedBy: "demo-admin" })).rejects.toThrow("Ya nos mandaste");
  });
  it("tres reportes de personas distintas pausan el cupón", async () => {
    const repo = createMemoryRepo();
    for (const u of ["a", "b", "c"]) await repo.createReport(u, "c-ceibo", "codigo_invalido", null);
    expect(await repo.getPromotion("c-ceibo")).toBeNull();
    expect((await repo.getPromotion("c-ceibo", { includeUnpublished: true }))!.status).toBe("en_revision");
  });
});
