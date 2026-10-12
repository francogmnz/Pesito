import type { Repo } from "@/lib/data/repo";
import type { ListingChange } from "@/lib/domain/products";
import type { Source } from "@/lib/domain/types";
import { fetchPage } from "@/lib/ingest/fetch-page";
import { parseVtexProduct, parseVtexProductSitemap, parseVtexSitemapIndex } from "./vtex";

/** Adaptador de las fuentes de precios (tiendas VTEX). Las corre `runPriceSources`, no la actualización de promos. */
export const PRICE_ADAPTER = "vtex-precios";

/** Rubros con los que arranca «Comparar precios»: perfumería, dermocosmética y cuidado personal. */
const DEFAULT_SCOPE = "dermocosm|cuidado personal|cuidado de la piel|cuidado del cabello|cuidado capilar|perfum|fragancia|maquillaje|belleza|solares|higiene";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const int = (v: unknown, d: number, min: number, max: number) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.min(max, Math.max(min, Math.trunc(Number(v)))) : d);

export interface PriceCrawlResult {
  checked: number;
  created: number;
  changed: number;
  same: number;
  /** Leídas pero fuera de alcance: otro rubro, sin código de barras válido o sin precio. */
  skipped: number;
  errors: number;
}

/**
 * Lee por tandas las páginas de producto de una tienda VTEX y guarda el precio vigente de cada una.
 * Reutiliza la cola de `source_records`: el sitemap se sincroniza una vez por semana, cada corrida abre
 * `batchSize` páginas, lo que está fuera de alcance no se vuelve a leer y los precios se revisan cada `recheckHours`.
 * Se ajusta con sources.config: merchantSlug, merchantName, batchSize, delayMs, concurrency, recheckHours, maxSeconds, scope.
 */
export async function crawlPrices(ctx: { repo: Repo; source: Source; fetcher?: typeof fetch; now?: Date }): Promise<PriceCrawlResult> {
  const { repo, source, fetcher = fetch, now = new Date() } = ctx;
  const cfg = source.config;
  const merchantSlug = String(cfg.merchantSlug ?? "");
  const merchantName = String(cfg.merchantName ?? "");
  if (!merchantSlug || !merchantName) throw new Error("La fuente de precios no tiene comercio configurado (merchantSlug, merchantName)");
  const origin = new URL(source.url).origin;
  const batchSize = int(cfg.batchSize, 200, 1, 2000);
  const delayMs = int(cfg.delayMs, 300, 0, 10_000);
  const recheckHours = int(cfg.recheckHours, 72, 1, 24 * 60);
  const concurrency = int(cfg.concurrency, 3, 1, 4);
  const deadline = Date.now() + int(cfg.maxSeconds, 200, 5, 3600) * 1000;
  const scope = new RegExp(typeof cfg.scope === "string" && cfg.scope ? cfg.scope : DEFAULT_SCOPE, "i");
  const robotsCache = new Map<string, string | null>();
  const xml = { accept: "application/xml,text/xml", maxBytes: 12 * 1024 * 1024, robotsCache };
  const at = (ms: number) => new Date(now.getTime() + ms).toISOString();

  const synced = typeof cfg.sitemapSyncedAt === "string" ? Date.parse(cfg.sitemapSyncedAt) : 0;
  if (!(now.getTime() - synced < 7 * DAY_MS)) {
    let maps = parseVtexSitemapIndex(await fetchPage(`${origin}/sitemap.xml`, fetcher, xml));
    // Algunas tiendas no listan los sitemaps de productos en el índice, pero los publican igual.
    const probe = maps.length === 0;
    if (probe) maps = Array.from({ length: 40 }, (_, i) => `${origin}/sitemap/product-${i}.xml`);
    for (const url of maps.slice(0, 60)) {
      let slugs: string[];
      try {
        slugs = parseVtexProductSitemap(await fetchPage(url, fetcher, xml));
      } catch (e) {
        if (probe) break;
        throw e;
      }
      if (!slugs.length && probe) break;
      await repo.addSourceRecords(source.id, slugs.map((key) => ({ key, priority: 0 })));
    }
    await repo.updateSourceConfig(source.id, { sitemapSyncedAt: now.toISOString() });
  }

  const out: PriceCrawlResult = { checked: 0, created: 0, changed: 0, same: 0, skipped: 0, errors: 0 };
  const due = await repo.dueSourceRecords(source.id, now.toISOString(), batchSize);
  let streak = 0;
  let stop = false;
  const readOne = async (rec: (typeof due)[number]): Promise<void> => {
    const url = `${origin}/${rec.key}/p`;
    let html: string;
    try {
      html = await fetchPage(url, fetcher, { robotsCache });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/robots\.txt/.test(msg)) throw e;
      if (/respondió (404|410)/.test(msg)) {
        // El comercio sacó la página: no se vuelve a leer. El último precio guardado queda viejo y se muestra como tal.
        await repo.saveSourceRecord(source.id, rec.key, { state: "sin_datos", nextCheckAt: null });
        out.checked++;
        out.skipped++;
        streak = 0;
        return;
      }
      await repo.saveSourceRecord(source.id, rec.key, { state: "error", nextCheckAt: at(6 * HOUR_MS), error: msg.slice(0, 300) });
      out.errors++;
      if (++streak >= 5) stop = true; // el sitio está caído o nos frena: se corta y se sigue en la próxima corrida
      return;
      return;
    }
    streak = 0;
    out.checked++;
    const p = parseVtexProduct(html);
    // Cada presentación (tono, tamaño) con código de barras válido y precio es un producto aparte.
    const items = (p?.items ?? []).filter((it) => it.ean && it.price != null);
    // Fuera de alcance: otro rubro, sin código de barras válido o sin precio.
    if (!p || !items.length || !scope.test(p.category ?? "")) {
      const inScope = !!p && scope.test(p.category ?? "");
      await repo.saveSourceRecord(source.id, rec.key, { state: "omitida", nextCheckAt: inScope ? at(30 * DAY_MS) : null });
      out.skipped++;
      return;
    }
    const single = p.items.length === 1;
    for (const item of items.slice(0, 40)) {
      // El nombre de la presentación suele repetir el del producto; si no, se le agrega ("Labial X - Rojo 05").
      const variant = item.name && !single && !item.name.toLowerCase().includes(p.name.toLowerCase()) ? `${p.name} - ${item.name}` : item.name || p.name;
      const change: ListingChange = await repo.upsertListing({
        merchantSlug,
        merchantName,
        sourceId: source.id,
        // Con una sola presentación se conserva la clave de siempre; con varias, una por código de barras.
        externalKey: single ? rec.key : `${rec.key}#${item.ean}`.slice(0, 200),
        url,
        ean: item.ean!,
        title: (single ? p.name || item.name : variant).slice(0, 200),
        brand: p.brand,
        category: p.category,
        imageUrl: p.imageUrl,
        price: item.price!,
        listPrice: item.listPrice,
        inStock: item.inStock,
      });
      if (change === "nuevo") out.created++;
      else if (change === "cambio") out.changed++;
      else out.same++;
    }
    await repo.saveSourceRecord(source.id, rec.key, { state: "vigente", externalId: items[0].ean, nextCheckAt: at(recheckHours * HOUR_MS) });
  };
  // Pocas páginas a la vez: alcanza para revisar los precios cada pocos días sin cargar al comercio.
  let next = 0;
  const worker = async () => {
    while (!stop && next < due.length && Date.now() < deadline) {
      const rec = due[next++];
      await readOne(rec);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

export interface PriceRunSummary {
  sources: number;
  checked: number;
  created: number;
  changed: number;
  skipped: number;
  errors: string[];
}

/** Corre una tanda de cada fuente de precios activa y deja el registro en el historial de corridas. */
export async function runPriceSources(repo: Repo, opts: { fetcher?: typeof fetch } = {}): Promise<PriceRunSummary> {
  const sum: PriceRunSummary = { sources: 0, checked: 0, created: 0, changed: 0, skipped: 0, errors: [] };
  const sources = (await repo.listSources()).filter((s) => s.active && s.adapter === PRICE_ADAPTER);
  // Cada comercio es un sitio distinto: se leen a la vez para aprovechar el tiempo de la corrida.
  await Promise.all(
    sources.map(async (source) => {
    sum.sources++;
    const startedAt = new Date().toISOString();
    try {
      const r = await crawlPrices({ repo, source, fetcher: opts.fetcher });
      sum.checked += r.checked;
      sum.created += r.created;
      sum.changed += r.changed;
      sum.skipped += r.skipped;
      const error = r.errors ? `${r.errors} páginas no se pudieron leer; se reintentan en unas horas.` : null;
      await repo.recordIngestionRun({ sourceId: source.id, startedAt, finishedAt: new Date().toISOString(), found: r.checked, created: r.created, updated: r.changed, verified: r.same, flagged: 0, error });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sum.errors.push(`${source.name}: ${msg}`);
      await repo.recordIngestionRun({ sourceId: source.id, startedAt, finishedAt: new Date().toISOString(), found: 0, created: 0, updated: 0, verified: 0, flagged: 0, error: msg.slice(0, 500) });
    }
    }),
  );
  return sum;
}
