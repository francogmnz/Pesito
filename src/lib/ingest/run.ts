import type { Repo } from "@/lib/data/repo";
import { ADAPTERS, CRAWLERS } from "./adapters";
import { processCandidates } from "./process";

export interface RunSummary {
  sources: number;
  created: number;
  updated: number;
  verified: number;
  flagged: number;
  expired: number;
  errors: string[];
}

/** Corre todas las fuentes activas con adaptador y después vence las promos terminadas. */
export async function runAllSources(repo: Repo, opts: { today: string; fetcher?: typeof fetch }): Promise<RunSummary> {
  const sum: RunSummary = { sources: 0, created: 0, updated: 0, verified: 0, flagged: 0, expired: 0, errors: [] };
  const sources = (await repo.listSources()).filter((s) => s.active && s.adapter && (ADAPTERS[s.adapter] || CRAWLERS[s.adapter]));
  for (const source of sources) {
    sum.sources++;
    const startedAt = new Date().toISOString();
    try {
      const crawler = CRAWLERS[source.adapter!];
      const crawl = crawler ? await crawler.crawl({ repo, source, fetcher: opts.fetcher, today: opts.today }) : null;
      const candidates = crawl ? crawl.candidates : await ADAPTERS[source.adapter!].fetchCandidates(source, opts.fetcher);
      const r = await processCandidates(repo, source, candidates, { today: opts.today, partial: !!crawl, removedExternalIds: crawl?.removedExternalIds });
      sum.created += r.created;
      sum.updated += r.updated;
      sum.verified += r.verified;
      sum.flagged += r.flagged;
      // En las fuentes por tandas, "leídas" son las páginas abiertas en esta corrida.
      const found = crawl ? crawl.checked : r.found;
      const error = crawl?.errors ? `${crawl.errors} páginas no se pudieron leer; se reintentan mañana.` : null;
      await repo.recordIngestionRun({ sourceId: source.id, startedAt, finishedAt: new Date().toISOString(), found, created: r.created, updated: r.updated, verified: r.verified, flagged: r.flagged, error });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sum.errors.push(`${source.name}: ${msg}`);
      await repo.recordIngestionRun({ sourceId: source.id, startedAt, finishedAt: new Date().toISOString(), found: 0, created: 0, updated: 0, verified: 0, flagged: 0, error: msg.slice(0, 500) });
    }
  }
  sum.expired = await repo.expirePromotions(opts.today);
  return sum;
}
