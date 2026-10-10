import type { Repo } from "@/lib/data/repo";
import { ADAPTERS } from "./adapters";
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
  const sources = (await repo.listSources()).filter((s) => s.active && s.adapter && ADAPTERS[s.adapter]);
  for (const source of sources) {
    sum.sources++;
    const startedAt = new Date().toISOString();
    try {
      const candidates = await ADAPTERS[source.adapter!].fetchCandidates(source, opts.fetcher);
      const r = await processCandidates(repo, source, candidates, { today: opts.today });
      sum.created += r.created;
      sum.updated += r.updated;
      sum.verified += r.verified;
      sum.flagged += r.flagged;
      await repo.recordIngestionRun({ sourceId: source.id, startedAt, finishedAt: new Date().toISOString(), found: r.found, created: r.created, updated: r.updated, verified: r.verified, flagged: r.flagged, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sum.errors.push(`${source.name}: ${msg}`);
      await repo.recordIngestionRun({ sourceId: source.id, startedAt, finishedAt: new Date().toISOString(), found: 0, created: 0, updated: 0, verified: 0, flagged: 0, error: msg.slice(0, 500) });
    }
  }
  sum.expired = await repo.expirePromotions(opts.today);
  return sum;
}
